// End-to-end check of peers, lead sharing and contact sharing through the REAL
// Supabase API (PostgREST + Auth), using real signed-in sessions — the one thing
// the pgTAP tests (which simulate sessions inside the database) cannot cover.
//
// It creates THREE throwaway users, runs the scenarios, then deletes exactly the
// users it created (cascading to all their data). It never touches other users.
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... \
//     node scripts/e2e-sharing.mjs
//
// The service key is only used to create/delete the throwaway users. Never commit it.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY.');
  process.exit(2);
}

const mk = (key) => createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(SUPABASE_SERVICE_KEY);
const tag = `e2e-${Date.now()}`;
const created = [];
let pass = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}
const msg = (r) => r.error?.message || '';
const section = (t) => console.log(`\n${t}`);

async function makeUser(label) {
  const email = `${tag}-${label}@example.com`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: `Test ${label.toUpperCase()}` },
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  created.push(data.user.id);
  const client = mk(SUPABASE_ANON_KEY);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`signIn ${label}: ${signed.error.message}`);
  const code = (await client.rpc('my_peer_code')).data;
  return { id: data.user.id, client, code, label };
}

async function run() {
  section('Setup: three users sign in with real sessions');
  const A = await makeUser('a');
  const B = await makeUser('b');
  const C = await makeUser('c');
  check('each user gets a peer code', [A, B, C].every((u) => /^PEER-[A-HJ-NP-Z2-9]{6}$/.test(u.code)), [A.code, B.code, C.code].join(','));
  check('peer codes are unique', new Set([A.code, B.code, C.code]).size === 3);

  const anon = mk(SUPABASE_ANON_KEY);
  check('signed-out caller cannot use peer functions', !!msg(await anon.rpc('my_peer_code')));
  check('signed-out caller cannot use lead sharing', !!msg(await anon.rpc('shared_leads_with_me')));
  check('signed-out caller cannot use contact sharing', !!msg(await anon.rpc('shared_contacts_with_me')));
  const anonLeads = await anon.from('leads').select('id');
  check('signed-out caller has no access to leads', anonLeads.error?.code === '42501', JSON.stringify(anonLeads.error));
  const anonContacts = await anon.from('contacts').select('id');
  check('signed-out caller has no access to contacts', anonContacts.error?.code === '42501', JSON.stringify(anonContacts.error));
  const anonPeers = await anon.from('peer_connections').select('id');
  check('signed-out caller has no access to peer_connections', anonPeers.error?.code === '42501', JSON.stringify(anonPeers.error));

  section('Scenario 1: peer connection');
  check('cannot connect to yourself', /yourself/i.test(msg(await A.client.rpc('connect_with_peer', { p_code: A.code }))));
  const unknown = await B.client.rpc('connect_with_peer', { p_code: 'PEER-ZZZZZZ' });
  check('an unknown code returns no connection and no error (the attempt is recorded)', !unknown.error && !unknown.data?.id, msg(unknown));
  const req = await B.client.rpc('connect_with_peer', { p_code: A.code.toLowerCase() });
  check('B sends a request using A\'s code (case-insensitive)', req.data?.status === 'pending', msg(req));
  const connId = req.data?.id;
  check('duplicate request is rejected', /already sent/i.test(msg(await B.client.rpc('connect_with_peer', { p_code: A.code }))));
  const aList = (await A.client.rpc('list_peers')).data || [];
  check('A sees B\'s incoming request with a display name', aList.some((p) => p.direction === 'incoming' && p.status === 'pending' && p.peer_display_name === 'Test B'));
  check('C cannot accept a request that is not theirs', /not found/i.test(msg(await C.client.rpc('respond_to_request', { p_id: connId, p_accept: true }))));
  check('B cannot accept their own outgoing request', /not found/i.test(msg(await B.client.rpc('respond_to_request', { p_id: connId, p_accept: true }))));
  const acc = await A.client.rpc('respond_to_request', { p_id: connId, p_accept: true });
  check('A accepts: both are connected', acc.data?.status === 'accepted', msg(acc));
  const bList = (await B.client.rpc('list_peers')).data || [];
  check('B lists A as a connected peer', bList.some((p) => p.status === 'accepted' && p.peer_display_name === 'Test A'));
  const direct = await B.client.from('peer_connections').insert({ requester_id: B.id, receiver_id: C.id });
  check('clients cannot write peer_connections directly', !!direct.error);
  const hack = await A.client.from('profiles').update({ peer_code: 'PEER-HACKED' }).eq('id', A.id);
  check('a user cannot change their peer code', !!hack.error);
  check('C sees no connections', ((await C.client.rpc('list_peers')).data || []).length === 0);

  section('Scenario 2: personal lead isolation');
  const google = (await A.client.from('leads').insert({ company: 'Google', role: 'Software Engineer' }).select().single());
  check('a new lead defaults to Personal', google.data?.visibility === 'personal', msg(google));
  const gid = google.data?.id;
  check('B cannot see it through the shared list', !((await B.client.rpc('shared_leads_with_me')).data || []).some((l) => l.company === 'Google'));
  check('B cannot read it from the table', ((await B.client.from('leads').select('id').eq('id', gid)).data || []).length === 0);
  const bImportPersonal = await B.client.rpc('import_shared_lead', { p_lead_id: gid, p_status: 'applied' });
  check('B cannot import a personal lead by id (IDOR)', /not found/i.test(msg(bImportPersonal)));
  const spoof = await A.client.from('leads').insert({ company: 'Spoof', role: 'X', user_id: B.id });
  check('A cannot create a lead owned by someone else', !!spoof.error);

  section('Scenario 3: shared lead and independent status');
  const ms = (await A.client.from('leads').insert({ company: 'Microsoft', role: 'Software Engineer', visibility: 'peer', job_url: 'https://example.com/ms' }).select().single()).data;
  const meta = (await A.client.from('leads').insert({ company: 'Meta', role: 'Backend Engineer', visibility: 'peer' }).select().single()).data;
  const shared = (await B.client.rpc('shared_leads_with_me')).data || [];
  check('B sees A\'s peer leads and not the personal one', shared.length === 2 && shared.every((l) => l.company !== 'Google'));
  check('B sees who shared it', shared.every((l) => l.owner_display_name === 'Test A'));
  check('shared view never exposes A\'s application status', shared.every((l) => !('applied' in l) && !('status' in l)));
  check('C (not a peer) sees nothing', ((await C.client.rpc('shared_leads_with_me')).data || []).length === 0);
  check('C cannot import it (IDOR)', /not found/i.test(msg(await C.client.rpc('import_shared_lead', { p_lead_id: ms.id, p_status: 'applied' }))));
  const upd = await B.client.from('leads').update({ company: 'Hacked' }).eq('id', ms.id).select();
  check('B cannot edit A\'s lead', (upd.data || []).length === 0);
  const del = await B.client.from('leads').delete().eq('id', ms.id).select();
  check('B cannot delete A\'s lead', (del.data || []).length === 0);
  const vis = await B.client.from('leads').update({ visibility: 'personal' }).eq('id', ms.id).select();
  check('B cannot change A\'s lead visibility', (vis.data || []).length === 0);
  const imp = await B.client.rpc('import_shared_lead', { p_lead_id: ms.id, p_status: 'applied' });
  check('B imports Microsoft as Applied', imp.data?.table === 'jobs' && imp.data.row.status === 'applied', msg(imp));
  const again = await B.client.rpc('import_shared_lead', { p_lead_id: ms.id, p_status: 'applied' });
  check('importing twice does not duplicate', !again.error && ((await B.client.from('jobs').select('id').eq('company', 'Microsoft')).data || []).length === 1);
  const asLead = await B.client.rpc('import_shared_lead', { p_lead_id: meta.id, p_status: 'lead' });
  check('B can import Meta into their own Leads column', asLead.data?.table === 'leads' && asLead.data.row.visibility === 'personal', msg(asLead));
  check('A has no application from B\'s import', ((await A.client.from('jobs').select('id')).data || []).length === 0);
  const aPromo = await A.client.rpc('promote_lead', { p_lead_id: ms.id, p_status: 'interviewing' });
  check('A moves Microsoft to Interviewing (promote_lead regression)', aPromo.data?.status === 'interviewing', msg(aPromo));
  const bJob = (await B.client.from('jobs').select('status, source_lead_id').eq('company', 'Microsoft')).data?.[0];
  check('B\'s Microsoft status is still Applied', bJob?.status === 'applied');
  check('B\'s copy records where it came from', bJob?.source_lead_id === ms.id);
  const bMove = await B.client.rpc('promote_lead', { p_lead_id: asLead.data.row.id, p_status: 'rejected' });
  check('B tracks their own copy independently (Rejected)', bMove.data?.status === 'rejected', msg(bMove));
  check('A\'s statuses are unaffected by B', ((await A.client.from('jobs').select('company, status')).data || []).every((j) => j.company !== 'Meta'));
  const aOwn = await A.client.from('leads').select('company, applied').eq('id', meta.id).single();
  check('A\'s own Meta lead is untouched', aOwn.data?.applied === false);

  section('Scenario 4: shared contact');
  const alice = (await A.client.from('contacts').insert({ name: 'Alice', email: 'alice@acme.com', phone_number: '+1 555 0100', company_name: 'Acme' }).select().single()).data;
  const bob = (await A.client.from('contacts').insert({ name: 'Bob', email: 'bob@globex.com', phone_number: '+1 555 0200', company_name: 'Globex', designation: 'Recruiter', notes: 'secret note', visibility: 'peer' }).select().single()).data;
  check('a new contact defaults to Personal', alice?.visibility === 'personal');
  const sc = (await B.client.rpc('shared_contacts_with_me')).data || [];
  check('B sees only the peer contact', sc.length === 1 && sc[0].name === 'Bob');
  check('B sees the owner', sc[0]?.owner_display_name === 'Test A');
  check('the owner\'s notes are not shared', sc[0] && !('notes' in sc[0]));
  check('B cannot read A\'s contacts from the table', ((await B.client.from('contacts').select('id')).data || []).length === 0);
  check('B cannot duplicate a personal contact (IDOR)', /not found/i.test(msg(await B.client.rpc('duplicate_contact', { p_id: alice.id }))));
  check('B cannot edit A\'s contact', ((await B.client.from('contacts').update({ phone_number: '000' }).eq('id', bob.id).select()).data || []).length === 0);
  check('B cannot delete A\'s contact', ((await B.client.from('contacts').delete().eq('id', bob.id).select()).data || []).length === 0);
  check('C cannot duplicate it', /not found/i.test(msg(await C.client.rpc('duplicate_contact', { p_id: bob.id }))));
  const dup = await B.client.rpc('duplicate_contact', { p_id: bob.id });
  check('B duplicates Bob into their own contacts', dup.data?.name === 'Bob' && dup.data.visibility === 'personal' && dup.data.notes === '' && dup.data.user_id === B.id, msg(dup));
  check('duplicating twice does not create a second copy', ((await B.client.rpc('duplicate_contact', { p_id: bob.id })).data?.id === dup.data?.id));
  await B.client.from('contacts').update({ phone_number: '+1 999 0000' }).eq('id', dup.data.id);
  check('B edits their copy; A\'s original is unchanged', (await A.client.from('contacts').select('phone_number').eq('id', bob.id).single()).data?.phone_number === '+1 555 0200');
  const badContact = await A.client.from('contacts').insert({ name: 'X', email: 'not-an-email', phone_number: '1', company_name: 'Y' });
  check('invalid contact data is rejected by the database', !!badContact.error);

  section('Scenario 6: visibility change revokes access immediately');
  await A.client.from('leads').update({ visibility: 'personal' }).eq('id', meta.id);
  check('B loses Meta as soon as A makes it personal', !((await B.client.rpc('shared_leads_with_me')).data || []).some((l) => l.company === 'Meta'));
  await A.client.from('contacts').update({ visibility: 'personal' }).eq('id', bob.id);
  check('B loses Bob as soon as A makes him personal', ((await B.client.rpc('shared_contacts_with_me')).data || []).length === 0);
  check('B cannot import or duplicate after the change', /not found/i.test(msg(await B.client.rpc('import_shared_lead', { p_lead_id: meta.id, p_status: 'lead' }))) && /not found/i.test(msg(await B.client.rpc('duplicate_contact', { p_id: bob.id }))));
  await A.client.from('leads').update({ visibility: 'peer' }).eq('id', meta.id);
  await A.client.from('contacts').update({ visibility: 'peer' }).eq('id', bob.id);
  check('switching back to Peer restores access', ((await B.client.rpc('shared_leads_with_me')).data || []).some((l) => l.company === 'Meta') && ((await B.client.rpc('shared_contacts_with_me')).data || []).length === 1);

  section('Scenario 5: peer disconnection');
  check('C cannot remove A and B\'s connection', /not found/i.test(msg(await C.client.rpc('remove_peer', { p_id: connId }))));
  const rm = await A.client.rpc('remove_peer', { p_id: connId });
  check('A removes B', !rm.error, msg(rm));
  check('B no longer sees A\'s shared leads', ((await B.client.rpc('shared_leads_with_me')).data || []).length === 0);
  check('B no longer sees A\'s shared contacts', ((await B.client.rpc('shared_contacts_with_me')).data || []).length === 0);
  check('B cannot import after removal', /not found/i.test(msg(await B.client.rpc('import_shared_lead', { p_lead_id: meta.id, p_status: 'lead' }))));
  check('the peer lists are empty on both sides', ((await A.client.rpc('list_peers')).data || []).length === 0 && ((await B.client.rpc('list_peers')).data || []).length === 0);
  check('A\'s original leads and contacts remain', ((await A.client.from('leads').select('id')).data || []).length === 3 && ((await A.client.from('contacts').select('id')).data || []).length === 2);
  check('A\'s application history remains', (await A.client.from('jobs').select('status').eq('company', 'Microsoft').single()).data?.status === 'interviewing');
  check('B keeps the imported job and its status', (await B.client.from('jobs').select('status').eq('company', 'Microsoft').single()).data?.status === 'applied');
  check('B keeps the duplicated contact', ((await B.client.from('contacts').select('id').eq('id', dup.data.id)).data || []).length === 1);
  const re = await B.client.rpc('connect_with_peer', { p_code: A.code });
  check('a removed peer can send a new request', re.data?.status === 'pending', msg(re));
  check('re-requesting does not restore access until accepted', ((await B.client.rpc('shared_leads_with_me')).data || []).length === 0);
}

async function importScenario() {
  section('Scenario 7: contact paste import (atomic bulk insert)');
  const A = await makeUser('i');
  const row = (n, email, extra = {}) => ({ name: `Imp ${n}`, email, phone_number: `555${n}`, company_name: 'ImportCo', designation: '', linkedin_url: '', notes: '', visibility: 'peer', ...extra });
  const count = async () => ((await A.client.from('contacts').select('id')).data || []).length;

  // Rows carry every column, exactly as the app's bulkCreateContacts sends them.
  const ok = await A.client.from('contacts').insert([row(1, 'imp1@example.com'), row(2, 'imp2@example.com'), row(3, 'imp3@example.com', { designation: 'Dev', linkedin_url: 'https://linkedin.com/in/x' })]);
  check('a valid batch imports in one go', !ok.error && (await count()) === 3, msg(ok));

  const bad = await A.client.from('contacts').insert([row(4, 'imp4@example.com'), row(5, 'not-an-email'), row(6, 'imp6@example.com')]);
  check('a batch with one invalid row is rejected', !!bad.error);
  check('...and nothing from that batch was kept (atomic)', (await count()) === 3);

  const spoof = await A.client.from('contacts').insert([{ ...row(7, 'imp7@example.com'), user_id: '00000000-0000-0000-0000-000000000000' }]);
  check('a batch cannot be created for another owner', !!spoof.error);
  check('...and imported contacts are owned by the importer', ((await A.client.from('contacts').select('user_id')).data || []).every((r) => r.user_id === A.id));
}

async function hardeningScenario() {
  section('Scenario 8: open sign-up limits (through the real API)');
  const X = await makeUser('x');
  const Y = await makeUser('y');
  let allNoThrow = true;
  for (let i = 0; i < 10; i += 1) {
    const r = await X.client.rpc('connect_with_peer', { p_code: `PEER-BAD${i}` });
    if (r.error || r.data?.id) allNoThrow = false;
  }
  check('ten wrong codes each return "no connection", not an error', allNoThrow);
  const locked = await X.client.rpc('connect_with_peer', { p_code: Y.code });
  check('the 11th attempt is refused even with a correct code', /Too many invalid codes/i.test(msg(locked)) && locked.error?.code === '54000', JSON.stringify(locked.error));
  const other = await Y.client.rpc('connect_with_peer', { p_code: X.code });
  check('another user is not affected by that lockout', other.data?.status === 'pending', msg(other));

  const long = await admin.auth.admin.createUser({
    email: `${tag}-long@example.com`, password: `${crypto.randomUUID()}Aa1!`, email_confirm: true,
    user_metadata: { display_name: `${'n'.repeat(100)}\nBcc: x` },
  });
  if (long.error) throw new Error(long.error.message);
  created.push(long.data.user.id);
  const prof = await admin.from('profiles').select('display_name').eq('id', long.data.user.id).single();
  check('an over-long sign-up name is cut to 60 characters with control characters removed', prof.data?.display_name?.length === 60 && [...prof.data.display_name].every((ch) => ch.charCodeAt(0) > 31), String(prof.data?.display_name?.length));
  const rename = await X.client.from('profiles').update({ display_name: 'x'.repeat(61) }).eq('id', X.id);
  check('a user cannot rename themselves past 60 characters', !!rename.error);
}

async function cleanup() {
  section('Cleanup');
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id);
    console.log(`  ${error ? 'FAILED to delete' : 'deleted'} test user ${id}${error ? `: ${error.message}` : ''}`);
  }
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const leftovers = (data?.users || []).filter((u) => (u.email || '').startsWith(tag));
  check('no test users remain', leftovers.length === 0, `${leftovers.length} left`);
}

try {
  await run();
  await importScenario();
  await hardeningScenario();
} catch (e) {
  failures.push(`aborted: ${e.message}`);
  console.error(`\nABORTED: ${e.message}`);
} finally {
  await cleanup();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
