-- Phase 2 pgTAP tests: lead visibility, shared reads, import, independence, revocation.
-- Run with: supabase test db   (rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Fixtures: A owns the leads, B is A's accepted peer, C is unconnected.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.dev'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.dev');
insert into public.peer_connections (requester_id, receiver_id, status, accepted_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'accepted', now());

insert into public.leads (id, user_id, company, role, description) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Google', 'Software Engineer', 'GDesc');
insert into public.leads (id, user_id, company, role, visibility, job_url) values
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'Microsoft', 'Software Engineer', 'peer', 'https://example.com/ms'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'Meta', 'Backend Engineer', 'peer', '');

-- ------------------------------------------------------------ constraints and defaults
select is((select visibility from public.leads where id = '11111111-1111-1111-1111-111111111111'), 'personal', 'visibility defaults to personal');
select throws_ok(
  $$insert into public.leads (user_id, company, role, visibility) values ('aaaaaaaa-0000-0000-0000-000000000001','X','Y','public')$$,
  '23514', null, 'visibility must be personal or peer');
select throws_ok(
  $$insert into public.leads (user_id, company, role, job_url) values ('aaaaaaaa-0000-0000-0000-000000000001','X','Y','javascript:alert(1)')$$,
  '23514', null, 'job_url must be http(s)');

-- ------------------------------------------------------------ as B (accepted peer)
reset role;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.shared_leads_with_me()), 2, 'B sees A''s two peer-visible leads');
select is((select count(*)::int from public.shared_leads_with_me() where company = 'Google'), 0, 'B does not see A''s personal lead');
select is((select owner_display_name from public.shared_leads_with_me() where company = 'Microsoft'), 'a', 'the original owner is identified');
select is((select count(*)::int from public.leads), 0, 'B cannot read A''s leads through the table (RLS)');

-- B cannot edit or delete A's lead (verified as the owner below).
update public.leads set company = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
delete from public.leads where id = '22222222-2222-2222-2222-222222222222';

select throws_ok($$select public.import_shared_lead('22222222-2222-2222-2222-222222222222', 'bogus')$$, '22023', 'Invalid status', 'invalid status is rejected');
select throws_ok($$select public.import_shared_lead('11111111-1111-1111-1111-111111111111', 'applied')$$, 'P0002', 'Lead not found', 'a personal lead cannot be imported');

select is(public.import_shared_lead('22222222-2222-2222-2222-222222222222', 'applied') -> 'row' ->> 'status', 'applied', 'B imports Microsoft as Applied');
select is((select source_lead_id from public.jobs where company = 'Microsoft'), '22222222-2222-2222-2222-222222222222'::uuid, 'the import records its source lead');
select is((select job_url from public.jobs where company = 'Microsoft'), 'https://example.com/ms', 'the import carries the job URL');
select lives_ok($$select public.import_shared_lead('22222222-2222-2222-2222-222222222222', 'applied')$$, 'importing twice does not fail');
select is((select count(*)::int from public.jobs where company = 'Microsoft'), 1, 'importing twice creates one job');
select is((select already_imported from public.shared_leads_with_me() where company = 'Microsoft'), true, 'already_imported is true for Microsoft');
select is((select already_imported from public.shared_leads_with_me() where company = 'Meta'), false, 'already_imported is false for Meta');

select is(public.import_shared_lead('33333333-3333-3333-3333-333333333333', 'lead') ->> 'table', 'leads', 'B can import Meta into their own Leads column');
select is((select visibility from public.leads where company = 'Meta'), 'personal', 'the imported lead copy is personal');

-- ------------------------------------------------------------ the original is untouched
reset role;
select is((select company from public.leads where id = '22222222-2222-2222-2222-222222222222'), 'Microsoft', 'B''s edit attempt did not change A''s lead');
select is((select count(*)::int from public.leads where id = '22222222-2222-2222-2222-222222222222'), 1, 'B''s delete attempt did not delete A''s lead');
select is((select applied from public.leads where id = '22222222-2222-2222-2222-222222222222'), false, 'importing does not touch the owner''s lead');
select is((select count(*)::int from public.jobs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), 0, 'A has no application from B''s import');

-- ------------------------------------------------------------ independent statuses
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok($$select public.promote_lead('22222222-2222-2222-2222-222222222222', 'interviewing')$$, 'A moves Microsoft to Interviewing');
select lives_ok($$select public.promote_lead('11111111-1111-1111-1111-111111111111', 'applied')$$, 'promote_lead still works for a personal lead');
reset role;
select is((select status from public.jobs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and company = 'Microsoft'), 'interviewing', 'A''s Microsoft status is Interviewing');
select is((select status from public.jobs where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and company = 'Microsoft'), 'applied', 'B''s Microsoft status is still Applied');
select is((select description from public.jobs where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and company = 'Google'), 'GDesc', 'promote_lead carries the description over');

-- ------------------------------------------------------------ C (not a peer)
set local request.jwt.claims to '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.shared_leads_with_me()), 0, 'an unconnected user sees no shared leads');
select throws_ok($$select public.import_shared_lead('22222222-2222-2222-2222-222222222222', 'applied')$$, 'P0002', 'Lead not found', 'an unconnected user cannot import');

-- ------------------------------------------------------------ visibility revocation
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
update public.leads set visibility = 'personal' where id = '22222222-2222-2222-2222-222222222222';
reset role;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.shared_leads_with_me() where company = 'Microsoft'), 0, 'B loses sight of Microsoft once A makes it personal');
select throws_ok($$select public.import_shared_lead('22222222-2222-2222-2222-222222222222', 'rejected')$$, 'P0002', 'Lead not found', 'B can no longer import it');
select is((select count(*)::int from public.jobs where company = 'Microsoft'), 1, 'B keeps the job they already imported');

-- ------------------------------------------------------------ peer removal revokes everything
reset role;
update public.peer_connections set status = 'removed';
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.shared_leads_with_me()), 0, 'B sees nothing after the peer is removed');
select throws_ok($$select public.import_shared_lead('33333333-3333-3333-3333-333333333333', 'lead')$$, 'P0002', 'Lead not found', 'B cannot import after removal');

-- ------------------------------------------------------------ owner deletes the original
reset role;
delete from public.leads where id = '22222222-2222-2222-2222-222222222222';
select is((select count(*)::int from public.jobs where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and company = 'Microsoft'), 1, 'B''s job survives the owner deleting the lead');
select is((select source_lead_id from public.jobs where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and company = 'Microsoft'), null, 'the dangling source link is cleared');

-- ------------------------------------------------------------ anon
set local role anon;
select throws_ok($$select * from public.shared_leads_with_me()$$, '42501', null, 'anon cannot list shared leads');
select throws_ok($$select public.import_shared_lead('33333333-3333-3333-3333-333333333333', 'lead')$$, '42501', null, 'anon cannot import');

reset role;
select * from finish();
rollback;
