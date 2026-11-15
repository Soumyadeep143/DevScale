-- Baseline pgTAP checks for the base migration. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select has_table('public', t, t || ' exists')
from unnest(array['jobs','leads','notes','leetcode_problems']) as t;

select is(
  (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
  true, t || ' has RLS enabled')
from unnest(array['jobs','leads','notes','leetcode_problems']) as t;

select has_function('public', 'promote_lead', array['uuid','text'], 'promote_lead exists');
select has_index('public', 'jobs', 'jobs_user_company_role_uniq', 'jobs company+role is unique per user');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename in ('jobs','leads','notes','leetcode_problems')),
  4, 'one owner policy per table');

select * from finish();
rollback;
