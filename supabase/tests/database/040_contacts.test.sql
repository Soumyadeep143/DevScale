-- Phase 3 pgTAP tests: contact validation, visibility, sharing, duplication, revocation.
-- Run with: supabase test db   (rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Fixtures: A owns the contacts, B is A's accepted peer, C is unconnected.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.dev'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.dev');
insert into public.peer_connections (requester_id, receiver_id, status, accepted_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'accepted', now());

insert into public.contacts (id, user_id, name, email, phone_number, company_name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', 'alice@acme.com', '+1 555 0100', 'Acme');
insert into public.contacts (id, user_id, name, email, phone_number, company_name, designation, notes, visibility) values
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bob', 'bob@globex.com', '+1 555 0200', 'Globex', 'Recruiter', 'private note', 'peer');

-- ------------------------------------------------------------ validation and defaults
select is((select visibility from public.contacts where id = '11111111-1111-1111-1111-111111111111'), 'personal', 'visibility defaults to personal');
select throws_ok($$insert into public.contacts (user_id,name,email,phone_number,company_name) values ('aaaaaaaa-0000-0000-0000-000000000001','  ','x@y.com','1','Co')$$, '23514', null, 'blank name is rejected');
select throws_ok($$insert into public.contacts (user_id,name,email,phone_number,company_name) values ('aaaaaaaa-0000-0000-0000-000000000001','N','not-an-email','1','Co')$$, '23514', null, 'invalid email is rejected');
select throws_ok($$insert into public.contacts (user_id,name,email,phone_number,company_name) values ('aaaaaaaa-0000-0000-0000-000000000001','N','x@y.com','','Co')$$, '23514', null, 'blank phone is rejected');
select throws_ok($$insert into public.contacts (user_id,name,email,phone_number,company_name) values ('aaaaaaaa-0000-0000-0000-000000000001','N','x@y.com','1','')$$, '23514', null, 'blank company is rejected');
select throws_ok($$insert into public.contacts (user_id,name,email,phone_number,company_name,linkedin_url) values ('aaaaaaaa-0000-0000-0000-000000000001','N','x@y.com','1','Co','javascript:alert(1)')$$, '23514', null, 'non-http LinkedIn URL is rejected');
select throws_ok($$insert into public.contacts (user_id,name,email,phone_number,company_name,visibility) values ('aaaaaaaa-0000-0000-0000-000000000001','N','x@y.com','1','Co','public')$$, '23514', null, 'visibility must be personal or peer');

-- ------------------------------------------------------------ as B (accepted peer)
reset role;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select is((select count(*)::int from public.shared_contacts_with_me()), 1, 'B sees only A''s peer-visible contact');
select is((select name from public.shared_contacts_with_me()), 'Bob', 'the visible contact is Bob, not the personal Alice');
select is((select owner_display_name from public.shared_contacts_with_me()), 'a', 'the original owner is identified');
select is((select to_jsonb(s) ? 'notes' from public.shared_contacts_with_me() s limit 1), false, 'the owner''s private notes are not shared');
select is((select count(*)::int from public.contacts), 0, 'B cannot read A''s contacts through the table (RLS)');

update public.contacts set phone_number = '000' where id = '22222222-2222-2222-2222-222222222222';
delete from public.contacts where id = '22222222-2222-2222-2222-222222222222';

select throws_ok($$select public.duplicate_contact('11111111-1111-1111-1111-111111111111')$$, 'P0002', 'Contact not found', 'a personal contact cannot be duplicated');
select is((select user_id from public.duplicate_contact('22222222-2222-2222-2222-222222222222')), 'bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'the duplicate is owned by B');
select is((select visibility from public.contacts where name = 'Bob'), 'personal', 'the duplicate is personal');
select is((select notes from public.contacts where name = 'Bob'), '', 'the duplicate does not carry the owner''s notes');
select lives_ok($$select public.duplicate_contact('22222222-2222-2222-2222-222222222222')$$, 'duplicating twice does not fail');
select is((select count(*)::int from public.contacts where name = 'Bob'), 1, 'duplicating twice does not create a second copy');
select is((select already_saved from public.shared_contacts_with_me()), true, 'already_saved is true after duplicating');

-- B may edit their own copy without touching the original.
update public.contacts set phone_number = '+1 999 0000' where name = 'Bob';

-- ------------------------------------------------------------ the original is untouched
reset role;
select is((select phone_number from public.contacts where id = '22222222-2222-2222-2222-222222222222'), '+1 555 0200', 'B''s edits and edit attempts did not change A''s contact');
select is((select count(*)::int from public.contacts where id = '22222222-2222-2222-2222-222222222222'), 1, 'B''s delete attempt did not delete A''s contact');

-- ------------------------------------------------------------ C (not a peer)
set local request.jwt.claims to '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.shared_contacts_with_me()), 0, 'an unconnected user sees no shared contacts');
select throws_ok($$select public.duplicate_contact('22222222-2222-2222-2222-222222222222')$$, 'P0002', 'Contact not found', 'an unconnected user cannot duplicate');

-- ------------------------------------------------------------ visibility revocation
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
update public.contacts set visibility = 'personal' where id = '22222222-2222-2222-2222-222222222222';
reset role;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.shared_contacts_with_me()), 0, 'B loses sight of Bob once A makes him personal');
select throws_ok($$select public.duplicate_contact('22222222-2222-2222-2222-222222222222')$$, 'P0002', 'Contact not found', 'B can no longer duplicate him');
select is((select count(*)::int from public.contacts where name = 'Bob'), 1, 'B keeps the copy they already made');

-- ------------------------------------------------------------ peer removal revokes everything
reset role;
update public.contacts set visibility = 'peer' where id = '22222222-2222-2222-2222-222222222222';
update public.peer_connections set status = 'removed';
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.shared_contacts_with_me()), 0, 'B sees nothing after the peer is removed');
select throws_ok($$select public.duplicate_contact('22222222-2222-2222-2222-222222222222')$$, 'P0002', 'Contact not found', 'B cannot duplicate after removal');

-- ------------------------------------------------------------ owner deletes the original
reset role;
delete from public.contacts where id = '22222222-2222-2222-2222-222222222222';
select is((select count(*)::int from public.contacts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and name = 'Bob'), 1, 'B''s copy survives the owner deleting the original');

-- ------------------------------------------------------------ anon
set local role anon;
select throws_ok($$select * from public.shared_contacts_with_me()$$, '42501', null, 'anon cannot list shared contacts');
select throws_ok($$select public.duplicate_contact('11111111-1111-1111-1111-111111111111')$$, '42501', null, 'anon cannot duplicate');
select throws_ok($$select * from public.contacts$$, '42501', null, 'anon has no table access to contacts');

reset role;
select * from finish();
rollback;
