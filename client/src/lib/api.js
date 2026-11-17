import { supabase } from './supabase';
import { normalizeRecords, recordToJob } from './aiJobs';
import { isLead, leadError } from './leadRules';
import { sanitizeContact } from '../../../supabase/functions/ai/parseContacts.ts';

class ApiError extends Error {}

// Leads and jobs live in separate tables but the UI treats them as one list.
// Leads get an "l-" id prefix so we know which table an id belongs to.
const LEAD_PREFIX = 'l-';
const isLeadId = (id) => String(id).startsWith(LEAD_PREFIX);
const leadUuid = (id) => String(id).slice(LEAD_PREFIX.length);

function check({ data, error }) {
  if (error) throw new ApiError(error.message || 'Request failed');
  return data;
}

const dateOrNull = (v) => (v ? String(v).slice(0, 10) : null);

export function jobFromRow(r) {
  return {
    id: r.id,
    company: r.company,
    role: r.role,
    status: r.status,
    dateApplied: r.date_applied || '',
    interviewStatus: r.interview_status || '',
    contact: r.contact || '',
    source: r.source || 'Manual',
    location: r.location || '',
    experience: r.experience || '',
    postedTime: r.posted_time || '',
    notes: r.notes || '',
    description: r.description || '',
    jobUrl: r.job_url || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function leadFromRow(r) {
  return {
    id: LEAD_PREFIX + r.id,
    company: r.company,
    role: r.role,
    status: 'lead',
    dateApplied: '',
    interviewStatus: '',
    contact: r.contact || '',
    source: r.source || 'Scraped',
    location: r.location || '',
    experience: r.experience || '',
    postedTime: r.posted_time || '',
    notes: '',
    description: r.description || '',
    jobUrl: r.job_url || '',
    visibility: r.visibility || 'personal',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Only include keys the caller actually passed, so a partial patch never
// blanks out other columns.
function jobToRow(job) {
  const map = {
    company: 'company', role: 'role', status: 'status', interviewStatus: 'interview_status',
    contact: 'contact', source: 'source', location: 'location', experience: 'experience',
    postedTime: 'posted_time', notes: 'notes', description: 'description', jobUrl: 'job_url',
  };
  const row = {};
  for (const [k, col] of Object.entries(map)) if (job[k] !== undefined) row[col] = job[k] ?? '';
  if (job.dateApplied !== undefined) row.date_applied = dateOrNull(job.dateApplied);
  return row;
}

function leadToRow(job) {
  const row = {};
  for (const [k, col] of Object.entries({
    company: 'company', role: 'role', location: 'location', experience: 'experience',
    contact: 'contact', source: 'source', postedTime: 'posted_time',
    description: 'description', jobUrl: 'job_url', visibility: 'visibility',
  })) if (job[k] !== undefined) row[col] = job[k] ?? '';
  return row;
}

// Makes sure the signed-in Clerk user has a database account (profile + identity link) and, for
// users imported from the old system, links them to their existing data. Safe to call every sign-in.
export async function ensureIdentity(displayName = '') {
  const { data, error } = await supabase.rpc('ensure_identity', { p_display_name: displayName || null });
  if (error) throw new ApiError(error.message || 'Could not set up your account.');
  return data; // the user's id in the database; names their private live-update topic
}

// ---------------------------------------------------------------- live updates (Supabase Realtime)
// A live channel that stays alive: Clerk tokens are short-lived, so the socket's token is refreshed
// regularly, and the channel is re-created after an error or timeout (with a growing delay) instead of
// staying silently dead. `bind(channel)` attaches the listeners; `onStatus` reports 'SUBSCRIBED',
// 'CHANNEL_ERROR', 'TIMED_OUT' or 'CLOSED'. Returns a function that stops everything.
function openLiveChannel({ name, config, bind, onStatus }) {
  let channel = null;
  let stopped = false;
  let retry = 0;
  let retryTimer = null;

  const freshToken = async () => (typeof window !== 'undefined' && window.Clerk?.session ? window.Clerk.session.getToken() : null);

  function connect() {
    if (stopped) return;
    channel = config ? supabase.channel(name, { config }) : supabase.channel(name);
    bind(channel);
    channel.subscribe((status) => {
      if (stopped) return;
      onStatus?.(status);
      if (status === 'SUBSCRIBED') { retry = 0; return; }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        const old = channel;
        channel = null;
        if (old) supabase.removeChannel(old);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, Math.min(30000, 2000 * 2 ** retry));
        retry += 1;
      }
    });
  }

  freshToken().then((t) => { if (t && !stopped) supabase.realtime.setAuth(t); }).catch(() => {}).finally(connect);
  const refreshTimer = setInterval(async () => {
    try { const t = await freshToken(); if (t) supabase.realtime.setAuth(t); } catch { /* next tick */ }
  }, 45000);

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    clearInterval(refreshTimer);
    if (channel) supabase.removeChannel(channel);
  };
}

// Changes to the signed-in user's own jobs, leads, contacts and notes. Row-level security applies to these events, so
// the server only ever sends rows this user owns. `onChange(table, payload)` gets each insert/update/delete.
export function subscribeToJobChanges({ onChange, onStatus } = {}) {
  return openLiveChannel({
    name: `jobs-and-leads-${Math.random().toString(36).slice(2)}`,
    bind: (channel) => {
      for (const table of ['leads', 'jobs', 'contacts', 'notes']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => onChange?.(table, payload));
      }
    },
    onStatus,
  });
}

// Signals that something SHARED WITH this user changed (a peer shared, edited or un-shared a lead or
// contact, a connection changed, a peer renamed themselves). The signal carries no data, only a kind;
// the app reloads through the normal permission-checked functions. The topic is private to this user
// ('peer:<uuid>'): the database only lets people receive their own.
export function subscribeToSharedUpdates({ userUuid, onSignal, onStatus } = {}) {
  return openLiveChannel({
    name: `peer:${userUuid}`,
    config: { private: true },
    bind: (channel) => {
      channel.on('broadcast', { event: 'shared_changed' }, ({ payload }) => onSignal?.(payload?.kind || 'all'));
    },
    onStatus,
  });
}

// The API silently caps one response (1000 rows by default), so a plain select drops rows with no
// error once a list grows past that. Read in pages until a short page says the data has ended.
// `makeQuery` must return a fresh, ordered query; `id` is added as a tiebreaker so pages never
// overlap or skip rows when many rows share a timestamp.
const READ_PAGE = 1000;
async function selectAll(makeQuery) {
  const out = [];
  for (let from = 0; ; from += READ_PAGE) {
    const page = check(await makeQuery().order('id', { ascending: true }).range(from, from + READ_PAGE - 1));
    out.push(...page);
    if (page.length < READ_PAGE) return out;
  }
}

export async function fetchJobs() {
  const [jobs, leads] = await Promise.all([
    selectAll(() => supabase.from('jobs').select('*').order('created_at', { ascending: false })),
    selectAll(() => supabase.from('leads').select('*').eq('applied', false).order('created_at', { ascending: false })),
  ]);
  return [...jobs.map(jobFromRow), ...leads.map(leadFromRow)];
}

export async function createJob(job) {
  if (job.status === 'lead') {
    // Whatever called this (the form, an import, a script), a lead without a company, role and
    // link/email is refused before anything is written.
    const problem = leadError(job);
    if (problem) throw new ApiError(problem);
    const row = await supabase.from('leads').insert(leadToRow(job)).select().single().then(check);
    return leadFromRow(row);
  }
  const row = await supabase.from('jobs').insert(jobToRow(job)).select().single().then(check);
  return jobFromRow(row);
}

export async function updateJob(id, patch) {
  if (isLeadId(id)) {
    if (patch.status && patch.status !== 'lead') {
      const row = await supabase
        .rpc('promote_lead', { p_lead_id: leadUuid(id), p_status: patch.status })
        .then(check);
      return jobFromRow(row);
    }
    const row = await supabase.from('leads').update(leadToRow(patch)).eq('id', leadUuid(id)).select().single().then(check);
    return leadFromRow(row);
  }
  if (patch.status === 'lead') throw new ApiError('A tracked job cannot be moved back to Lead.');
  const row = await supabase.from('jobs').update(jobToRow(patch)).eq('id', id).select().single().then(check);
  return jobFromRow(row);
}

export async function deleteJob(id) {
  const table = isLeadId(id) ? 'leads' : 'jobs';
  const realId = isLeadId(id) ? leadUuid(id) : id;
  check(await supabase.from(table).delete().eq('id', realId));
}

export async function bulkImportJobs(jobs) {
  // All or nothing: if any lead is missing its company, role or link/email, nothing is imported.
  const incomplete = jobs.filter((j) => isLead(j) && leadError(j)).length;
  if (incomplete) {
    throw new ApiError(`${incomplete} lead${incomplete === 1 ? ' is' : 's are'} missing required fields (company, role, link or email). Nothing was imported.`);
  }
  const leads = jobs.filter((j) => (j.status || 'lead') === 'lead').map(leadToRow);
  const tracked = jobs.filter((j) => (j.status || 'lead') !== 'lead');

  if (leads.length) check(await supabase.from('leads').insert(leads));

  let inserted = 0;
  if (tracked.length) {
    // The jobs table enforces one company+role per user; skip rows already
    // present (or repeated within the batch) instead of failing the import.
    const existing = await supabase.from('jobs').select('company, role').then(check);
    const seen = new Set(existing.map((r) => `${r.company}|${r.role}`.toLowerCase()));
    const rows = [];
    for (const j of tracked) {
      const key = `${j.company || ''}|${j.role || ''}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(jobToRow(j));
    }
    if (rows.length) check(await supabase.from('jobs').insert(rows));
    inserted = rows.length;
  }
  return leads.length + inserted;
}

// A failed call to the AI service, in words a person can act on. A browser reports an undeployed
// function (HTTP 404) as a CORS error, which hides the real cause.
export function aiErrorMessage(error) {
  const status = error?.context?.status;
  const text = String(error?.message || '');
  if (status === 404) return 'The AI service isn’t deployed yet. It needs to be deployed once (see the setup notes).';
  if (status === 401 || status === 403) return 'The AI service rejected your sign-in. Try signing out and back in.';
  if (error?.name === 'FunctionsFetchError' || /failed to send a request|failed to fetch|networkerror/i.test(text)) {
    return 'Couldn’t reach the AI service. It may not be deployed yet, or your connection dropped.';
  }
  return text || 'AI request failed';
}

async function invokeAI(action, payload) {
  const { data, error } = await supabase.functions.invoke('ai', { body: { action, payload } });
  if (error) throw new ApiError(aiErrorMessage(error));
  if (!data?.ok) throw new ApiError(data?.error || 'AI request failed');
  return data;
}

export async function askAI(question, history = []) {
  return (await invokeAI('askAI', { question, history })).answer;
}

// The DevScale AI server (server/): holds the AI key, answers CORS only for this app, and checks the
// person's Clerk sign-in. Set VITE_AI_SERVER_URL to use it.
async function callAiServer(text, route = 'parse-jobs') {
  const base = String(import.meta.env.VITE_AI_SERVER_URL).replace(/\/$/, '');
  const token = typeof window !== 'undefined' && window.Clerk?.session ? await window.Clerk.session.getToken() : null;
  if (!token) throw new ApiError('Please sign in again.');
  let res;
  try {
    res = await fetch(`${base}/api/${route}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch {
    throw new ApiError(`Couldn’t reach the AI server at ${base}. Is it running? (In the server folder: npm start)`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new ApiError(data?.error || `The AI server returned an error (${res.status}).`);
  return data;
}

// Turns pasted free text (a job posting, an email, a link, a snippet, spreadsheet rows) into job records
// in the 12-column schema, plus the same records as importable jobs. Nothing is saved: the caller shows
// the result for review first. Route, in order: the AI server (VITE_AI_SERVER_URL), a key in .env.local
// for local development, or the deployed Supabase function.
export async function parseJobsWithAI(text) {
  let data;
  if (import.meta.env.VITE_AI_SERVER_URL) {
    data = await callAiServer(text);
  } else if (import.meta.env.DEV && import.meta.env.VITE_AI_API_KEY) {
    // `import.meta.env.DEV` is false in production builds, so this branch and the key vanish there.
    const { directParseJobs } = await import('./aiDirect.js');
    data = await directParseJobs(text);
  } else {
    data = await invokeAI('parseJobs', { text });
  }
  const records = normalizeRecords(data.records);
  return {
    records, jobs: records.map(recordToJob), truncated: !!data.truncated,
    notices: (Array.isArray(data.notices) ? data.notices : []).map((n) => String(n).slice(0, 300)).slice(0, 5),
  };
}

// Free text (a recruiter message, a signature, messy rows) -> contacts. Nothing is saved: the caller shows
// them for review. Same three routes as parseJobsWithAI.
export async function parseContactsWithAI(text) {
  let data;
  if (import.meta.env.VITE_AI_SERVER_URL) {
    data = await callAiServer(text, 'parse-contacts');
  } else if (import.meta.env.DEV && import.meta.env.VITE_AI_API_KEY) {
    const { directParseContacts } = await import('./aiDirect.js');
    data = await directParseContacts(text);
  } else {
    data = await invokeAI('parseContacts', { text });
  }
  const contacts = (Array.isArray(data.contacts) ? data.contacts : []).map(sanitizeContact).filter(Boolean);
  return { contacts, truncated: !!data.truncated };
}

export async function analyzeJob({ company, role, status, notes }) {
  return (await invokeAI('analyzeJob', { company, role, status, notes })).analysis;
}

export async function fetchNotes() {
  return selectAll(() => supabase.from('notes').select('*').order('updated_at', { ascending: false }));
}

export async function setNoteVisibility(id, visibility) {
  return check(await supabase.from('notes').update({ visibility }).eq('id', id).select().single());
}

// Notes that accepted peers have moved to Team. Read only through this function, which re-checks the
// live peer relationship on every call.
export async function fetchSharedNotes() {
  const rows = check(await supabase.rpc('shared_notes_with_me')) || [];
  return rows.map((r) => ({
    id: r.note_id, owner: r.owner_display_name, content: r.content,
    createdAt: r.created_at, updatedAt: r.updated_at, alreadySaved: !!r.already_saved,
  }));
}

// Saves a peer's shared note as the caller's own personal note (an independent copy).
export async function importSharedNote(id) {
  return check(await supabase.rpc('import_shared_note', { p_id: id }));
}

// visibility 'peer' = a note written straight into Team (needs the notes-sharing migration); the default
// is a Personal note, and then no visibility column is sent, so older databases keep working.
export async function createNote(content, visibility = 'personal') {
  return check(await supabase.from('notes').insert(visibility === 'peer' ? { content, visibility } : { content }).select().single());
}

export async function updateNote(id, content) {
  return check(await supabase.from('notes').update({ content }).eq('id', id).select().single());
}

export async function deleteNote(id) {
  check(await supabase.from('notes').delete().eq('id', id));
}

// ---------------------------------------------------------------- LeetCode
// The problem list is read one page at a time (the page it feeds scrolls infinitely), and the
// totals/charts come from a separate summary that only reads a few narrow columns. Both page through
// results: the API silently caps a single response (1000 rows by default), so one big select would
// drop rows without any error.
const LC_STATUS_DONE = 'Solved ✅';
const LC_STATUS_DOING = 'In Progress';

function problemFromRow(r) {
  return {
    row: r.id, // kept as "row" so existing UI code is unchanged; it's the problem's id now
    week: r.week, day: r.day, weekTheme: r.week_theme, topic: r.topic, dayFocus: r.day_focus,
    problem: r.problem, link: r.link, difficulty: r.difficulty, concept: r.concept, status: r.status,
    updatedAt: r.updated_at,
  };
}

// One page of problems in plan order. Asks for one extra row to know whether more exist.
export async function fetchLeetcodePage({ offset = 0, limit = 50, week = null } = {}) {
  let query = supabase.from('leetcode_problems').select('*')
    .order('position', { ascending: true }).order('id', { ascending: true })
    .range(offset, offset + limit);
  if (week) query = query.eq('week', String(week));
  const rows = check(await query);
  return { items: rows.slice(0, limit).map(problemFromRow), hasMore: rows.length > limit };
}

const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const SUMMARY_PAGE = 1000;

// Totals, per-week and per-difficulty progress, and the latest activity, without loading full rows.
export async function fetchLeetcodeSummary() {
  const rows = [];
  for (let from = 0; ; from += SUMMARY_PAGE) {
    const page = check(await supabase.from('leetcode_problems')
      .select('id, week, week_theme, difficulty, status, problem, updated_at')
      .order('position', { ascending: true }).order('id', { ascending: true })
      .range(from, from + SUMMARY_PAGE - 1));
    rows.push(...page);
    if (page.length < SUMMARY_PAGE) break;
  }
  const byWeek = new Map();
  const byDifficulty = new Map([['Easy', { total: 0, solved: 0 }], ['Medium', { total: 0, solved: 0 }], ['Hard', { total: 0, solved: 0 }]]);
  let solved = 0;
  let inProgress = 0;
  for (const r of rows) {
    const w = byWeek.get(r.week) || { week: r.week, theme: r.week_theme, total: 0, solved: 0 };
    w.total += 1;
    const d = byDifficulty.get(r.difficulty);
    if (d) d.total += 1;
    if (r.status === LC_STATUS_DONE) { solved += 1; w.solved += 1; if (d) d.solved += 1; }
    if (r.status === LC_STATUS_DOING) inProgress += 1;
    byWeek.set(r.week, w);
  }
  const total = rows.length;
  return {
    total, solved, inProgress,
    notStarted: total - solved - inProgress,
    percent: total ? Math.round((solved / total) * 1000) / 10 : 0,
    byWeek: [...byWeek.values()].sort((a, b) => naturalCompare(a.week, b.week)),
    byDifficulty: [...byDifficulty].map(([name, v]) => ({ name, ...v })),
    recent: rows
      .filter((r) => r.status !== 'Not Started' && r.updated_at)
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .slice(0, 5)
      .map((r) => ({ row: r.id, problem: r.problem, status: r.status, updatedAt: r.updated_at })),
  };
}

export async function updateLeetcodeStatus(row, status) {
  check(await supabase.from('leetcode_problems').update({ status }).eq('id', row));
}

// ---------------------------------------------------------------- lead sharing
// Own leads are read from the leads table (RLS keeps that to the caller's rows).
// Leads shared BY peers are only ever reachable through the shared_leads_with_me()
// function, which re-checks the live peer relationship on each call.
function myLeadFromRow(r) {
  return {
    id: r.id,
    company: r.company,
    role: r.role,
    location: r.location || '',
    experience: r.experience || '',
    contact: r.contact || '',
    source: r.source || '',
    postedTime: r.posted_time || '',
    description: r.description || '',
    jobUrl: r.job_url || '',
    visibility: r.visibility || 'personal',
    applied: !!r.applied,
    createdAt: r.created_at,
  };
}

export async function fetchMyLeads() {
  const rows = await selectAll(() => supabase.from('leads').select('*').order('created_at', { ascending: false }));
  return rows.map(myLeadFromRow);
}

export async function fetchSharedLeads() {
  const rows = check(await supabase.rpc('shared_leads_with_me')) || [];
  return rows.map((r) => ({
    id: r.lead_id,
    owner: r.owner_display_name,
    company: r.company,
    role: r.role,
    location: r.location || '',
    experience: r.experience || '',
    contact: r.contact || '',
    source: r.source || '',
    postedTime: r.posted_time || '',
    description: r.description || '',
    jobUrl: r.job_url || '',
    createdAt: r.created_at,
    alreadyImported: !!r.already_imported,
  }));
}

// Changes the visibility of many of YOUR OWN rows in a few requests (100 per request) instead of one
// request per row. Row-level security means only rows you own can change; the returned count is how
// many actually did. If a request fails part-way, the error says how many had already moved.
async function setVisibilityMany(table, ids, visibility) {
  let moved = 0;
  for (let i = 0; i < ids.length; i += 100) {
    try {
      const rows = check(await supabase.from(table).update({ visibility }).in('id', ids.slice(i, i + 100)).select('id'));
      moved += rows.length;
    } catch (e) {
      throw new ApiError(`${moved ? `Moved ${moved} of ${ids.length}, then ` : ''}${e.message || 'the request failed'}.`.replace(/\.\.$/, '.'));
    }
  }
  return moved;
}
export const setLeadsVisibility = (ids, visibility) => setVisibilityMany('leads', ids, visibility);
export const setContactsVisibility = (ids, visibility) => setVisibilityMany('contacts', ids, visibility);
export const setNotesVisibility = (ids, visibility) => setVisibilityMany('notes', ids, visibility);

export async function setLeadVisibility(id, visibility) {
  const row = check(await supabase.from('leads').update({ visibility }).eq('id', id).select().single());
  return myLeadFromRow(row);
}

// status: 'lead' (a personal copy in your Leads column) or a tracked stage.
export async function importSharedLead(id, status) {
  return check(await supabase.rpc('import_shared_lead', { p_lead_id: id, p_status: status }));
}

export async function fetchLeadCounts() {
  const [personal, shared, withMe] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('visibility', 'personal').eq('applied', false),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('visibility', 'peer'),
    supabase.rpc('shared_leads_with_me'),
  ]);
  for (const r of [personal, shared, withMe]) if (r.error) throw new ApiError(r.error.message || 'Request failed');
  return { personal: personal.count ?? 0, sharedByMe: shared.count ?? 0, sharedWithMe: (withMe.data || []).length };
}

// ---------------------------------------------------------------- contacts
// Own contacts use the table directly (RLS keeps it to the caller's rows; the
// owner id is never sent). Peers' contacts are only reachable through
// shared_contacts_with_me(), and copying one goes through duplicate_contact().
function contactFromRow(r) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone_number,
    company: r.company_name,
    designation: r.designation || '',
    linkedinUrl: r.linkedin_url || '',
    notes: r.notes || '',
    visibility: r.visibility || 'personal',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Only include keys the caller passed, so a partial patch never blanks other columns.
function contactToRow(c) {
  const map = {
    name: 'name', email: 'email', phone: 'phone_number', company: 'company_name',
    designation: 'designation', linkedinUrl: 'linkedin_url', notes: 'notes', visibility: 'visibility',
  };
  const row = {};
  for (const [k, col] of Object.entries(map)) {
    if (c[k] === undefined) continue;
    row[col] = typeof c[k] === 'string' && k !== 'notes' ? c[k].trim() : (c[k] ?? '');
  }
  return row;
}

export async function fetchContacts() {
  const rows = await selectAll(() => supabase.from('contacts').select('*').order('name'));
  return rows.map(contactFromRow);
}

export async function createContact(contact) {
  return contactFromRow(check(await supabase.from('contacts').insert(contactToRow(contact)).select().single()));
}

export async function updateContact(id, patch) {
  return contactFromRow(check(await supabase.from('contacts').update(contactToRow(patch)).eq('id', id).select().single()));
}

// One multi-row insert = one atomic statement: either every row lands or none do.
// The caller never supplies an owner id; the database sets it, and RLS enforces it.
// PostgREST fills a key that is missing from some rows of a batch with NULL (not the
// column default), so every row is normalised to the same full set of columns.
export async function bulkCreateContacts(contacts, visibility = 'personal') {
  if (!contacts.length) return 0;
  const rows = contacts.map((c) => contactToRow({ designation: '', linkedinUrl: '', ...c, notes: c.notes ?? '', visibility }));
  check(await supabase.from('contacts').insert(rows));
  return rows.length;
}

export async function deleteContact(id) {
  check(await supabase.from('contacts').delete().eq('id', id));
}

export async function fetchSharedContacts() {
  const rows = check(await supabase.rpc('shared_contacts_with_me')) || [];
  return rows.map((r) => ({
    id: r.contact_id,
    owner: r.owner_display_name,
    name: r.name,
    email: r.email,
    phone: r.phone_number,
    company: r.company_name,
    designation: r.designation || '',
    linkedinUrl: r.linkedin_url || '',
    alreadySaved: !!r.already_saved,
  }));
}

export async function duplicateContact(id) {
  return contactFromRow(check(await supabase.rpc('duplicate_contact', { p_id: id })));
}

// ---------------------------------------------------------------- peers
// Every call goes through a SECURITY DEFINER database function that derives the
// caller from the session; nothing here (or in the UI) decides who may do what.
// The name peers see. Clerk is the source of truth for a person's name; this copies it to the profile.
// Same rules as the database: 1-60 characters, no control characters.
export async function updateMyDisplayName(userUuid, name) {
  const clean = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!userUuid || !clean) return;
  check(await supabase.from('profiles').update({ display_name: clean }).eq('id', userUuid));
}

export async function fetchMyPeerCode() {
  return check(await supabase.rpc('my_peer_code'));
}

export async function fetchPeers() {
  const rows = check(await supabase.rpc('list_peers')) || [];
  return rows.map((r) => ({
    id: r.connection_id,
    status: r.status, // 'pending' | 'accepted'
    direction: r.direction, // 'incoming' | 'outgoing'
    name: r.peer_display_name,
    code: r.peer_code,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
  }));
}

export async function connectWithPeer(code) {
  const result = check(await supabase.rpc('connect_with_peer', { p_code: code }));
  // An unknown code comes back as an empty row, not an error: the database has to record the
  // failed guess for its rate limit, and an error would roll that record back.
  if (!result || !result.id) throw new ApiError('Invalid peer code');
  return result;
}

export async function respondToPeerRequest(id, accept) {
  return check(await supabase.rpc('respond_to_request', { p_id: id, p_accept: accept }));
}

export async function removePeer(id) {
  check(await supabase.rpc('remove_peer', { p_id: id }));
}

export { ApiError };
