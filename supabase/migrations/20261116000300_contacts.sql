-- Phase 3: contacts. Same sharing model as leads: the table is owner-only under
-- RLS; peers read through shared_contacts_with_me() and copy with
-- duplicate_contact(), both of which re-check the live peer relationship and
-- visibility on every call (revocation is immediate).

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null
    constraint contacts_name_check check (length(btrim(name)) between 1 and 200),
  email text not null
    constraint contacts_email_check check (length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone_number text not null
    constraint contacts_phone_check check (length(btrim(phone_number)) between 1 and 40),
  company_name text not null
    constraint contacts_company_check check (length(btrim(company_name)) between 1 and 200),
  designation text not null default '' constraint contacts_designation_check check (length(designation) <= 200),
  linkedin_url text not null default ''
    constraint contacts_linkedin_check check (linkedin_url = '' or (linkedin_url ~* '^https?://' and length(linkedin_url) <= 500)),
  notes text not null default '' constraint contacts_notes_check check (length(notes) <= 5000),
  visibility text not null default 'personal'
    constraint contacts_visibility_check check (visibility in ('personal', 'peer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_visibility_idx on public.contacts (user_id, visibility);
create index contacts_user_email_idx on public.contacts (user_id, lower(email));
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;
create policy contacts_owner on public.contacts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.contacts from anon;

-- ---------------------------------------------------------------- shared_contacts_with_me
-- Peer-visible contacts owned by accepted peers. The owner's private `notes` are
-- intentionally not part of the shared view.
create or replace function public.shared_contacts_with_me()
returns table (
  contact_id uuid, owner_display_name text, name text, email text, phone_number text,
  company_name text, designation text, linkedin_url text,
  created_at timestamptz, updated_at timestamptz, already_saved boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  return query
  select c.id, p.display_name, c.name, c.email, c.phone_number, c.company_name,
         c.designation, c.linkedin_url, c.created_at, c.updated_at,
         exists (select 1 from public.contacts m
                  where m.user_id = v_uid and lower(m.email) = lower(c.email))
    from public.contacts c
    join public.profiles p on p.id = c.user_id
   where c.visibility = 'peer'
     and c.user_id <> v_uid
     and public.are_peers(v_uid, c.user_id)
   order by c.name;
end $$;

-- ---------------------------------------------------------------- duplicate_contact
-- Copies a peer's shared contact into the CALLER's own personal contacts. The
-- copy is independent; the original is never modified. If the caller already has
-- a contact with the same email, that one is returned instead of making a second.
create or replace function public.duplicate_contact(p_id uuid) returns public.contacts
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c public.contacts;
  n public.contacts;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  -- One generic error for missing / personal / not-a-peer; `for share` stops the
  -- owner flipping visibility mid-copy.
  select * into c from public.contacts
   where id = p_id and visibility = 'peer' and user_id <> v_uid
     and public.are_peers(v_uid, user_id)
   for share;
  if not found then raise exception 'Contact not found' using errcode = 'P0002'; end if;

  select * into n from public.contacts
   where user_id = v_uid and lower(email) = lower(c.email)
   order by created_at limit 1;
  if found then return n; end if;

  insert into public.contacts (user_id, name, email, phone_number, company_name, designation, linkedin_url, notes, visibility)
  values (v_uid, c.name, c.email, c.phone_number, c.company_name, c.designation, c.linkedin_url, '', 'personal')
  returning * into n;
  return n;
end $$;

revoke all on function public.shared_contacts_with_me() from public, anon;
revoke all on function public.duplicate_contact(uuid) from public, anon;
grant execute on function public.shared_contacts_with_me() to authenticated;
grant execute on function public.duplicate_contact(uuid) to authenticated;
