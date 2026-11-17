// One-off: creates a Clerk user for every existing Supabase Auth user, keeping their data.
// Each Clerk user gets external_id = the old Supabase user uuid; on first sign-in the database links
// the two (see supabase/migrations/20261116000700_clerk_auth.sql), so jobs, leads, contacts, notes and
// peers carry over. Passwords carry over too (bcrypt hashes), so people sign in as before.
//
//   1. In the Supabase SQL editor run, and save the result as users.json (array of objects):
//        select id, email, raw_user_meta_data->>'display_name' as display_name, encrypted_password
//          from auth.users where email_confirmed_at is not null;
//   2. Dry run (default, creates nothing):
//        CLERK_SECRET_KEY=sk_... node client/scripts/import-users-to-clerk.mjs users.json
//   3. Create the users:
//        CLERK_SECRET_KEY=sk_... node client/scripts/import-users-to-clerk.mjs users.json --apply
//
// users.json holds password hashes: keep it out of git and delete it afterwards. The Clerk secret key
// stays in your shell; never commit it.
import { readFileSync } from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const secret = process.env.CLERK_SECRET_KEY;
if (!file || !secret) { console.error('Usage: CLERK_SECRET_KEY=sk_... node import-users-to-clerk.mjs users.json [--apply]'); process.exit(2); }

const users = JSON.parse(readFileSync(file, 'utf8'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let created = 0, skipped = 0, failed = 0;

for (const u of users) {
  const label = String(u.email || '').replace(/^(.).*(@.*)$/, '$1***$2');
  if (!UUID.test(u.id || '') || !u.email) { console.log(`skip   ${label}: missing id or email`); skipped += 1; continue; }
  const [first, ...rest] = String(u.display_name || '').trim().split(/\s+/).filter(Boolean);
  const body = {
    external_id: u.id,
    email_address: [u.email],
    first_name: first || undefined,
    last_name: rest.join(' ') || undefined,
    ...(u.encrypted_password ? { password_digest: u.encrypted_password, password_hasher: 'bcrypt', skip_password_checks: true } : {}),
    skip_legal_checks: true,
  };
  if (!apply) { console.log(`would create ${label} (external_id ${u.id})`); created += 1; continue; }
  const res = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res.ok) { console.log(`created ${label}`); created += 1; }
  else if (res.status === 422) { const e = await res.json().catch(() => ({})); console.log(`skip   ${label}: ${e.errors?.[0]?.code || 'rejected'} (already exists?)`); skipped += 1; }
  else { console.log(`FAILED ${label}: HTTP ${res.status}`); failed += 1; }
  await new Promise((r) => setTimeout(r, 120)); // stay well under Clerk's rate limit
}
console.log(`\n${apply ? 'Done' : 'Dry run'}: ${created} ${apply ? 'created' : 'to create'}, ${skipped} skipped, ${failed} failed.`);
process.exit(failed ? 1 : 0);
