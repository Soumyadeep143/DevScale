-- Phase 2: lead sharing. Additive columns + two functions; the owner-only RLS
-- policies on leads/jobs are NOT changed. Peers never read the leads table
-- directly: they go through shared_leads_with_me() / import_shared_lead(), which
-- re-check the live peer relationship and visibility on every call, so
-- revocation (visibility -> personal, or removing a peer) is immediate.

-- ---------------------------------------------------------------- columns
alter table public.leads
  add column visibility text not null default 'personal'
    constraint leads_visibility_check check (visibility in ('personal', 'peer')),
  add column description text not null default '',
  add column job_url text not null default ''
    constraint leads_job_url_check check (job_url = '' or job_url ~* '^https?://');

alter table public.jobs
  add column source_lead_id uuid references public.leads(id) on delete set null,
  add column description text not null default '',
  add column job_url text not null default ''
    constraint jobs_job_url_check check (job_url = '' or job_url ~* '^https?://');

create index leads_user_visibility_idx on public.leads (user_id, visibility);
create index jobs_source_lead_idx on public.jobs (source_lead_id) where source_lead_id is not null;

-- ---------------------------------------------------------------- promote_lead
-- Same behaviour as before; additionally carries description and job_url over.
create or replace function public.promote_lead(p_lead_id uuid, p_status text default 'applied')
returns public.jobs
language plpgsql security invoker set search_path = public as $$
declare
  l public.leads;
  j public.jobs;
begin
  if p_status not in ('applied','interviewing','offer','rejected') then
    raise exception 'invalid status %', p_status;
  end if;

  select * into l from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;

  insert into public.jobs (company, role, status, date_applied, contact, source, location, experience, posted_time, description, job_url)
  values (l.company, l.role, p_status, current_date, l.contact, l.source, l.location, l.experience, l.posted_time, l.description, l.job_url)
  on conflict (user_id, lower(company), lower(role)) do nothing
  returning * into j;

  if j.id is null then
    select * into j from public.jobs
    where user_id = l.user_id and lower(company) = lower(l.company) and lower(role) = lower(l.role);
  end if;

  update public.leads set applied = true where id = p_lead_id;
  return j;
end $$;

-- ---------------------------------------------------------------- shared_leads_with_me
-- Peer-visible leads owned by accepted peers. Deliberately omits the owner's
-- `applied` flag: application status is never shared.
create or replace function public.shared_leads_with_me()
returns table (
  lead_id uuid, owner_display_name text, company text, role text, location text,
  experience text, contact text, source text, posted_time text, description text,
  job_url text, created_at timestamptz, already_imported boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  return query
  select l.id, p.display_name, l.company, l.role, l.location, l.experience, l.contact,
         l.source, l.posted_time, l.description, l.job_url, l.created_at,
         (exists (select 1 from public.jobs j
                   where j.user_id = v_uid
                     and (j.source_lead_id = l.id
                          or (lower(j.company) = lower(l.company) and lower(j.role) = lower(l.role))))
          or exists (select 1 from public.leads m
                      where m.user_id = v_uid and m.applied = false
                        and lower(m.company) = lower(l.company) and lower(m.role) = lower(l.role)))
    from public.leads l
    join public.profiles p on p.id = l.user_id
   where l.visibility = 'peer'
     and l.user_id <> v_uid
     and public.are_peers(v_uid, l.user_id)
   order by l.created_at desc;
end $$;

-- ---------------------------------------------------------------- import_shared_lead
-- Copies a peer's shared lead into the CALLER's own data. The original row is
-- never modified, and the copy is independent (own status, own history).
--   p_status = 'lead'  -> a personal lead in the caller's Leads column
--   otherwise          -> a tracked job with that status
-- Dedups on company+role exactly like promote_lead. Returns {"table", "row"}.
create or replace function public.import_shared_lead(p_lead_id uuid, p_status text default 'applied')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  l public.leads;
  j public.jobs;
  n public.leads;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_status is null or p_status not in ('lead','applied','interviewing','offer','rejected') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  -- One generic error whether the lead is missing, personal, or its owner is not
  -- (or no longer) a peer; `for share` stops the owner flipping visibility mid-import.
  select * into l from public.leads
   where id = p_lead_id and visibility = 'peer' and user_id <> v_uid
     and public.are_peers(v_uid, user_id)
   for share;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;

  if p_status = 'lead' then
    select * into j from public.jobs
     where user_id = v_uid and lower(company) = lower(l.company) and lower(role) = lower(l.role);
    if found then return jsonb_build_object('table', 'jobs', 'row', to_jsonb(j)); end if;

    select * into n from public.leads
     where user_id = v_uid and applied = false
       and lower(company) = lower(l.company) and lower(role) = lower(l.role)
     limit 1;
    if not found then
      insert into public.leads (user_id, company, role, location, experience, contact, source,
                                posted_time, description, job_url, visibility)
      values (v_uid, l.company, l.role, l.location, l.experience, l.contact, 'Peer',
              l.posted_time, l.description, l.job_url, 'personal')
      returning * into n;
    end if;
    return jsonb_build_object('table', 'leads', 'row', to_jsonb(n));
  end if;

  insert into public.jobs (user_id, company, role, status, date_applied, contact, source, location,
                           experience, posted_time, description, job_url, source_lead_id)
  values (v_uid, l.company, l.role, p_status, current_date, l.contact, 'Peer', l.location,
          l.experience, l.posted_time, l.description, l.job_url, l.id)
  on conflict (user_id, lower(company), lower(role)) do nothing
  returning * into j;

  if j.id is null then
    select * into j from public.jobs
     where user_id = v_uid and lower(company) = lower(l.company) and lower(role) = lower(l.role);
  end if;
  return jsonb_build_object('table', 'jobs', 'row', to_jsonb(j));
end $$;

revoke all on function public.shared_leads_with_me() from public, anon;
revoke all on function public.import_shared_lead(uuid, text) from public, anon;
grant execute on function public.shared_leads_with_me() to authenticated;
grant execute on function public.import_shared_lead(uuid, text) to authenticated;
