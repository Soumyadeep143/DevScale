// One-time import: old Google Sheets (via the still-deployed Apps Script) -> Supabase.
//
//   APPS_SCRIPT_URL=... APPS_SCRIPT_TOKEN=... \
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... IMPORT_USER_ID=<auth user uuid> \
//   node scripts/import-from-sheets.mjs [--dry-run]
//
// The service-role key bypasses RLS, so it is only ever read from the environment
// here — never put it in client/.env or any VITE_* variable.
import { createClient } from '@supabase/supabase-js';

const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`Missing env var ${k}`); process.exit(1); }
  return v;
};
const dry = process.argv.includes('--dry-run');
const scriptUrl = need('APPS_SCRIPT_URL');
const token = need('APPS_SCRIPT_TOKEN');
const userId = need('IMPORT_USER_ID');
const sb = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } });

async function get(params = {}) {
  const u = new URL(scriptUrl);
  u.searchParams.set('token', token);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const data = await (await fetch(u)).json();
  if (!data.ok) throw new Error(data.error || 'Apps Script error');
  return data;
}

async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + 200));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

const dateOrNull = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const ts = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined);

const { jobs: all } = await get();
const tracked = [];
const seen = new Set();
for (const j of all.filter((j) => j.status !== 'lead')) {
  const key = `${j.company}|${j.role}`.toLowerCase();
  if (seen.has(key)) continue; // unique company+role per user
  seen.add(key);
  tracked.push({
    user_id: userId, company: j.company || '', role: j.role || '', status: j.status,
    date_applied: dateOrNull(j.dateApplied), interview_status: j.interviewStatus || '',
    contact: j.contact || '', source: j.source || 'Tracker', location: j.location || '',
    experience: j.experience || '', posted_time: j.postedTime || '', notes: j.notes || '',
    created_at: ts(j.createdAt), updated_at: ts(j.updatedAt),
  });
}
const leads = all.filter((j) => j.status === 'lead').map((j) => ({
  user_id: userId, company: j.company || '', role: j.role || '', location: j.location || '',
  experience: j.experience || '', contact: j.contact || '', source: j.source || 'Scraped',
  posted_time: j.postedTime || '',
}));

const lc = await get({ action: 'leetcode' });
const problems = lc.problems.map((p, i) => ({
  user_id: userId, position: i, week: String(p.week ?? ''), day: String(p.day ?? ''),
  week_theme: p.weekTheme || '', topic: p.topic || '', day_focus: p.dayFocus || '',
  problem: p.problem, link: p.link || '', difficulty: p.difficulty || '', concept: p.concept || '',
  status: p.status || 'Not Started',
}));

let notes = [];
try {
  notes = (await get({ action: 'notes' })).notes.map((n) => ({
    user_id: userId, content: n.content, created_at: ts(n.created_at), updated_at: ts(n.updated_at),
  }));
} catch (e) {
  console.warn('Skipping notes:', e.message);
}

console.log({ jobs: tracked.length, leads: leads.length, leetcode: problems.length, notes: notes.length });
if (dry) { console.log('Dry run — nothing written.'); process.exit(0); }

await insertAll('jobs', tracked);
await insertAll('leads', leads);
await insertAll('leetcode_problems', problems);
await insertAll('notes', notes);
console.log('Import complete.');
