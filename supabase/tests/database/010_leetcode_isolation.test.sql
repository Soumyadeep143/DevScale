-- Two-user isolation checks for leetcode_problems. Run with: supabase test db
-- Each peer's LeetCode list/progress is personal; RLS must keep them apart.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Fixtures (as the table owner, bypassing RLS).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.leetcode_problems (user_id, problem) values
  ('00000000-0000-0000-0000-00000000000a', 'Two Sum'),
  ('00000000-0000-0000-0000-00000000000a', 'Valid Anagram'),
  ('00000000-0000-0000-0000-00000000000b', 'Merge Intervals');

-- ---- act as user A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.leetcode_problems), 2,
  'A sees only their own rows');
select is((select count(*)::int from public.leetcode_problems
            where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'A cannot see B''s rows');
select throws_ok(
  $$insert into public.leetcode_problems (user_id, problem)
    values ('00000000-0000-0000-0000-00000000000b', 'Injected')$$,
  '42501', null, 'A cannot insert a row owned by B');
select lives_ok(
  $$update public.leetcode_problems set status = 'Solved ✅'
    where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  'A''s update of B''s rows is a silent no-op (verified below)');
select lives_ok(
  $$delete from public.leetcode_problems
    where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  'A''s delete of B''s rows is a silent no-op (verified below)');
insert into public.leetcode_problems (problem) values ('Default owner');
select is((select user_id from public.leetcode_problems where problem = 'Default owner'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'user_id defaults to the caller');

-- ---- act as user B
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*)::int from public.leetcode_problems), 1,
  'B sees only their own row');

-- ---- anonymous
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.leetcode_problems), 0, 'anon sees nothing');

-- ---- back to owner: B's row untouched
reset role;
select is((select count(*)::int from public.leetcode_problems
            where user_id = '00000000-0000-0000-0000-00000000000b' and status = 'Not Started'), 1,
  'B''s row was not modified or deleted by A');

select * from finish();
rollback;
