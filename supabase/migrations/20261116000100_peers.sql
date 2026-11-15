-- Phase 1: peers. Adds profiles (with unique peer codes), peer_connections and the
-- RPCs that manage them. Purely additive: no existing table or policy is changed.
--
-- Design: clients never write peer data directly. Every change goes through a
-- SECURITY DEFINER function that derives the caller from auth.uid(), so a
-- client can never supply (or spoof) a user id.

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  peer_code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- A user can read only their own profile. Peers see each other's display name
-- and code through list_peers(), never by reading this table.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Only display_name is user-editable; peer_code is permanent.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------- peer codes
-- PEER- + 6 characters from a 32-symbol alphabet (no 0/O/1/I). 256 % 32 = 0,
-- so mapping random bytes onto the alphabet has no modulo bias. Randomness is
-- gen_random_uuid(), which is cryptographically secure.
create or replace function public.generate_peer_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  raw bytea;
  code text;
  i int;
begin
  loop
    raw := uuid_send(gen_random_uuid());
    code := 'PEER-';
    for i in 0..5 loop
      code := code || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where peer_code = code);
  end loop;
  return code;
end $$;

-- Creates the profile for one user. Retries if a concurrent insert grabs the
-- same code (unique violation); returns quietly if the profile already exists.
create or replace function public.create_profile_for(p_user uuid, p_email text, p_meta jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(p_meta ->> 'display_name'), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Member');
  loop
    begin
      insert into public.profiles (id, display_name, peer_code)
      values (p_user, v_name, public.generate_peer_code());
      return;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = p_user) then return; end if;
    end;
  end loop;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.create_profile_for(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: every existing user gets a code. Idempotent.
select public.create_profile_for(u.id, u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

revoke all on function public.generate_peer_code() from public, anon, authenticated;
revoke all on function public.create_profile_for(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- peer_connections
create table public.peer_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint peer_connections_not_self check (requester_id <> receiver_id)
);
-- One row per unordered pair: blocks duplicate and reverse-direction rows.
create unique index peer_connections_pair_uniq
  on public.peer_connections (least(requester_id, receiver_id), greatest(requester_id, receiver_id));
create index peer_connections_requester_idx on public.peer_connections (requester_id);
create index peer_connections_receiver_idx on public.peer_connections (receiver_id);
create trigger peer_connections_updated_at before update on public.peer_connections
  for each row execute function public.set_updated_at();

alter table public.peer_connections enable row level security;
create policy peer_connections_select_own on public.peer_connections for select to authenticated
  using (requester_id = (select auth.uid()) or receiver_id = (select auth.uid()));
-- No insert/update/delete policies, and no grants: writes happen only in the RPCs below.
revoke insert, update, delete on public.peer_connections from anon, authenticated;

-- ---------------------------------------------------------------- helpers
-- Internal only (not granted to clients, so it can't be used to probe who is
-- connected to whom). Phase 2/3 functions call it.
create or replace function public.are_peers(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.peer_connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.receiver_id = b) or (c.requester_id = b and c.receiver_id = a))
  );
$$;
revoke all on function public.are_peers(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- RPCs
create or replace function public.my_peer_code() returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select peer_code into v_code from public.profiles where id = v_uid;
  return v_code;
end $$;

create or replace function public.connect_with_peer(p_code text) returns public.peer_connections
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  c public.peer_connections;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  select id into v_target from public.profiles where peer_code = upper(trim(coalesce(p_code, '')));
  -- One generic message so codes can't be told apart from typos.
  if v_target is null then raise exception 'Invalid peer code' using errcode = 'P0002'; end if;
  if v_target = v_uid then raise exception 'You cannot connect with yourself' using errcode = '22023'; end if;

  select * into c from public.peer_connections
   where least(requester_id, receiver_id) = least(v_uid, v_target)
     and greatest(requester_id, receiver_id) = greatest(v_uid, v_target)
   for update;

  if not found then
    begin
      insert into public.peer_connections (requester_id, receiver_id)
      values (v_uid, v_target) returning * into c;
      return c;
    exception when unique_violation then
      -- A concurrent request for the same pair won the race; re-read it.
      select * into c from public.peer_connections
       where least(requester_id, receiver_id) = least(v_uid, v_target)
         and greatest(requester_id, receiver_id) = greatest(v_uid, v_target)
       for update;
    end;
  end if;

  if c.status = 'accepted' then
    raise exception 'Already connected' using errcode = '23505';
  elsif c.status = 'pending' and c.requester_id = v_uid then
    raise exception 'Request already sent' using errcode = '23505';
  elsif c.status = 'pending' then
    -- They already asked us: connecting back accepts their request.
    update public.peer_connections set status = 'accepted', accepted_at = now()
     where id = c.id returning * into c;
  else
    -- rejected or removed: start over as a fresh request from the caller.
    update public.peer_connections
       set status = 'pending', requester_id = v_uid, receiver_id = v_target, accepted_at = null
     where id = c.id returning * into c;
  end if;
  return c;
end $$;

create or replace function public.respond_to_request(p_id uuid, p_accept boolean) returns public.peer_connections
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.peer_connections;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  -- Same error whether the request doesn't exist or belongs to someone else (no IDOR signal).
  select * into c from public.peer_connections
   where id = p_id and receiver_id = v_uid and status = 'pending' for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;

  update public.peer_connections
     set status = case when p_accept then 'accepted' else 'rejected' end,
         accepted_at = case when p_accept then now() else null end
   where id = c.id returning * into c;
  return c;
end $$;

-- Removes an accepted peer (either side) or cancels a pending request the caller sent.
create or replace function public.remove_peer(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.peer_connections;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  select * into c from public.peer_connections
   where id = p_id
     and ((status = 'accepted' and (requester_id = v_uid or receiver_id = v_uid))
       or (status = 'pending' and requester_id = v_uid))
   for update;
  if not found then raise exception 'Connection not found' using errcode = 'P0002'; end if;
  update public.peer_connections set status = 'removed', accepted_at = null where id = c.id;
end $$;

create or replace function public.list_peers()
returns table (
  connection_id uuid, status text, direction text,
  peer_display_name text, peer_code text, created_at timestamptz, accepted_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  return query
  select c.id, c.status,
         case when c.requester_id = v_uid then 'outgoing' else 'incoming' end,
         p.display_name, p.peer_code, c.created_at, c.accepted_at
    from public.peer_connections c
    join public.profiles p
      on p.id = case when c.requester_id = v_uid then c.receiver_id else c.requester_id end
   where (c.requester_id = v_uid or c.receiver_id = v_uid)
     and c.status in ('pending', 'accepted')
   order by c.updated_at desc;
end $$;

revoke all on function public.my_peer_code() from public, anon;
revoke all on function public.connect_with_peer(text) from public, anon;
revoke all on function public.respond_to_request(uuid, boolean) from public, anon;
revoke all on function public.remove_peer(uuid) from public, anon;
revoke all on function public.list_peers() from public, anon;
grant execute on function public.my_peer_code() to authenticated;
grant execute on function public.connect_with_peer(text) to authenticated;
grant execute on function public.respond_to_request(uuid, boolean) to authenticated;
grant execute on function public.remove_peer(uuid) to authenticated;
grant execute on function public.list_peers() to authenticated;
