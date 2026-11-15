-- Phase 1 pgTAP tests: peer codes, connections and their RPCs.
-- Run with: supabase test db   (needs a local Supabase database; rolls back at the end)
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Fixtures: three users. The on_auth_user_created trigger creates their profiles.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.dev'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test.dev');

create temp table codes (u uuid, code text);
insert into codes select id, peer_code from public.profiles
 where id in ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003');
create temp table ids (conn uuid);
grant select on codes, ids to authenticated, anon;

-- ------------------------------------------------------------ peer codes
select is((select count(*)::int from codes), 3, 'every new user gets a profile with a peer code');
select ok((select bool_and(code ~ '^PEER-[A-HJ-NP-Z2-9]{6}$') from codes), 'peer codes have the expected format');
select is((select count(distinct code)::int from codes), 3, 'peer codes are distinct');
select throws_ok(
  $$update public.profiles set peer_code = (select code from codes where u = 'bbbbbbbb-0000-0000-0000-000000000002')
     where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  '23505', null, 'duplicate peer code is rejected by the UNIQUE constraint');
select lives_ok(
  $$select public.create_profile_for('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.dev', '{}'::jsonb)$$,
  'create_profile_for is idempotent');
select is(
  (select peer_code from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  (select code from codes where u = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'an existing peer code is never changed');

-- ------------------------------------------------------------ table constraints
select throws_ok(
  $$insert into public.peer_connections (requester_id, receiver_id)
    values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001')$$,
  '23514', null, 'a user cannot connect to themselves (CHECK)');

-- ------------------------------------------------------------ as A
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(public.my_peer_code(), (select code from codes where u = 'aaaaaaaa-0000-0000-0000-000000000001'), 'my_peer_code returns the caller''s code');
select throws_ok(
  $$select public.connect_with_peer((select code from codes where u = 'aaaaaaaa-0000-0000-0000-000000000001'))$$,
  '22023', 'You cannot connect with yourself', 'connecting to own code is rejected');
select throws_ok($$select public.connect_with_peer('PEER-NOPE00')$$, 'P0002', 'Invalid peer code', 'unknown code is rejected');
select is(
  (select status from public.connect_with_peer(lower((select code from codes where u = 'bbbbbbbb-0000-0000-0000-000000000002')))),
  'pending', 'A -> B creates a pending request (code is case-insensitive)');
select throws_ok(
  $$select public.connect_with_peer((select code from codes where u = 'bbbbbbbb-0000-0000-0000-000000000002'))$$,
  '23505', 'Request already sent', 'duplicate request is rejected');

reset role;
insert into ids select id from public.peer_connections;
select throws_ok(
  $$insert into public.peer_connections (requester_id, receiver_id)
    values ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001')$$,
  '23505', null, 'reverse-direction duplicate row is rejected by the pair index');

-- ------------------------------------------------------------ as C (uninvolved)
set local request.jwt.claims to '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.peer_connections), 0, 'an uninvolved user sees none of A and B''s connection');
select throws_ok(
  $$insert into public.peer_connections (requester_id, receiver_id)
    values ('cccccccc-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'clients cannot insert into peer_connections directly');
select throws_ok(
  $$select public.respond_to_request((select conn from ids), true)$$,
  'P0002', 'Request not found', 'a third user cannot accept someone else''s request');

-- ------------------------------------------------------------ as B
reset role;
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.list_peers() where direction = 'incoming' and status = 'pending'), 1, 'B sees A''s incoming pending request');
select is((select status from public.respond_to_request((select conn from ids), true)), 'accepted', 'B accepts the request');

reset role;
select is(public.are_peers('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002'), true, 'A and B are peers once accepted');

-- ------------------------------------------------------------ remove
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.list_peers() where status = 'accepted'), 1, 'A lists B as a connected peer');
select lives_ok($$select public.remove_peer((select conn from ids))$$, 'A removes B');
reset role;
select is(public.are_peers('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002'), false, 'access is revoked immediately after removal');
set local request.jwt.claims to '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is((select count(*)::int from public.list_peers()), 0, 'B no longer lists A');

-- ------------------------------------------------------------ re-request after removal
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  (select status from public.connect_with_peer((select code from codes where u = 'bbbbbbbb-0000-0000-0000-000000000002'))),
  'pending', 'a removed peer can be re-requested');

-- ------------------------------------------------------------ reverse request auto-accepts
reset role;
set local request.jwt.claims to '{"sub":"cccccccc-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select is((select status from public.connect_with_peer((select code from codes where u = 'aaaaaaaa-0000-0000-0000-000000000001'))), 'pending', 'C -> A creates a pending request');
reset role;
set local request.jwt.claims to '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  (select status from public.connect_with_peer((select code from codes where u = 'cccccccc-0000-0000-0000-000000000003'))),
  'accepted', 'A connecting back to C accepts C''s pending request');

-- ------------------------------------------------------------ privilege checks
select throws_ok($$update public.profiles set peer_code = 'PEER-HACKED' where id = auth.uid()$$, '42501', null, 'peer_code cannot be edited by the user');
reset role;
set local role anon;
select throws_ok($$select public.my_peer_code()$$, '42501', null, 'anon cannot call peer RPCs');

reset role;
select * from finish();
rollback;
