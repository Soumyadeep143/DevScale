-- DevScale: Google Sheets -> Supabase migration.
-- Every table is owned by a Supabase Auth user (user_id) and locked down with
-- RLS so the browser (anon key + user session) can only ever touch its own rows.
-- NOTE: this assumes a project without the old mirror tables. If `jobs` / `notes`
-- from the previous SETUP.md already exist, rename or drop them first.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- jobs
-- Tracker rows: anything that has been applied to (applied/interviewing/offer/rejected).
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null default '',
  role text not null default '',
  status text not null default 'applied'
    check (status in ('applied','interviewing','offer','rejected')),
  date_applied date,
  interview_status text not null default '',
  contact text not null default '',
  source text not null default 'Manual',
  location text not null default '',
  experience text not null default '',
  posted_time text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_user_status_idx on public.jobs (user_id, status);
-- Same dedup rule the old leads->tracker automation used: one company+role per user.
create unique index jobs_user_company_role_uniq
  on public.jobs (user_id, lower(company), lower(role));
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- leads
-- Scraped postings. External scrapers insert here (service_role key, with an
-- explicit user_id). `applied` flips to true when a lead is promoted to a job.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null default '',
  role text not null default '',
  location text not null default '',
  experience text not null default '',
  contact text not null default '',
  source text not null default 'Scraped',
  posted_time text not null default '',
  applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_user_applied_idx on public.leads (user_id, applied);
create trigger leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- notes
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_idx on public.notes (user_id, updated_at desc);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- leetcode
create table public.leetcode_problems (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position int not null default 0,          -- original sheet order
  week text not null default '',
  day text not null default '',
  week_theme text not null default '',
  topic text not null default '',
  day_focus text not null default '',
  problem text not null,
  link text not null default '',
  difficulty text not null default '',
  concept text not null default '',
  status text not null default 'Not Started'
    check (status in ('Not Started','In Progress','Solved ✅')),
  updated_at timestamptz not null default now()
);
create index leetcode_user_pos_idx on public.leetcode_problems (user_id, position);
create trigger leetcode_updated_at before update on public.leetcode_problems
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.jobs enable row level security;
alter table public.leads enable row level security;
alter table public.notes enable row level security;
alter table public.leetcode_problems enable row level security;

create policy jobs_owner on public.jobs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy leads_owner on public.leads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notes_owner on public.notes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy leetcode_owner on public.leetcode_problems for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- promote_lead
-- Atomic lead -> job move (replaces the Apps Script "copy row on Applied" logic).
-- SECURITY INVOKER so RLS still applies. Skips the insert if the company+role is
-- already tracked, exactly like the old dedup rule, but still marks the lead applied.
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

  insert into public.jobs (company, role, status, date_applied, contact, source, location, experience, posted_time)
  values (l.company, l.role, p_status, current_date, l.contact, l.source, l.location, l.experience, l.posted_time)
  on conflict (user_id, lower(company), lower(role)) do nothing
  returning * into j;

  if j.id is null then
    select * into j from public.jobs
    where user_id = l.user_id and lower(company) = lower(l.company) and lower(role) = lower(l.role);
  end if;

  update public.leads set applied = true where id = p_lead_id;
  return j;
end $$;

revoke all on function public.promote_lead(uuid, text) from public, anon;
grant execute on function public.promote_lead(uuid, text) to authenticated;
