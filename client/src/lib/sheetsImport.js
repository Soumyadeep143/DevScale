// Turns CSV exports of the old Google Sheets into SQL for Supabase. Pure functions (no I/O) so they
// are testable. The mapping mirrors apps-script/Code.gs, so the result matches what the old tracker showed:
//  * Job Tracker: status text -> lead/applied/interviewing/offer/rejected (normalizeStatus_)
//  * Leads master list: only rows NOT yet applied (applied rows live on in the tracker)
//  * LeetCode tracker: one row per problem

// RFC 4180: quoted fields, "" escapes, CRLF or LF, newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

const norm = (h) => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Rows -> objects keyed by normalised header; `aliases` maps wanted keys to accepted header names.
export function toRecords(rows, aliases) {
  if (!rows.length) return [];
  const header = rows[0].map(norm);
  const index = {};
  for (const [key, names] of Object.entries(aliases)) {
    const i = header.findIndex((h) => names.map(norm).includes(h));
    index[key] = i;
  }
  return rows.slice(1).map((r) => Object.fromEntries(Object.keys(aliases).map((k) => [k, index[k] >= 0 ? String(r[index[k]] ?? '').trim() : ''])));
}

export function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['lead', 'applied', 'interviewing', 'offer', 'rejected'].includes(s)) return s;
  if (s === 'declined') return 'rejected';
  if (s === 'selected') return 'offer';
  if (s === 'in progress') return 'interviewing';
  if (['sent', 'submitted', 'true'].includes(s)) return 'applied';
  if (!s) return 'lead';
  if (/reject|declin/.test(s)) return 'rejected';
  if (/select|offer/.test(s)) return 'offer';
  if (/progress|interview/.test(s)) return 'interviewing';
  if (/sent|appl|submit/.test(s)) return 'applied';
  return 'lead';
}

export function toDate(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(`${s} 12:00 UTC`);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}
export function toTimestamp(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? `${s.replace(' ', 'T')}Z` : s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// The database only accepts empty or http(s) values in job_url, and some sheet rows have notes in
// the URL columns, so only real URLs are ever treated as links.
const asUrl = (v) => (/^https?:\/\//i.test(String(v || '').trim()) ? String(v).trim() : '');

const TRACKER = {
  company: ['Company'], role: ['Role'], dateApplied: ['Date Applied'], status: ['Status'], interviewStatus: ['Interview Status'],
  contact: ['Job Link/Mail', 'Job Link Mail'], notes: ['Notes'], createdAt: ['Created At'], updatedAt: ['Updated At'],
};
const LEADS = {
  company: ['Company'], email: ['Recruitment Email'], role: ['Job Title'], experience: ['Experience'], location: ['Location'],
  postedTime: ['Posted Time'], linkedin: ['LinkedIn Job URL', 'LinkedIn URL'], careers: ['Careers Page URL'],
  emailSource: ['Email Source URL'], applied: ['Applied'], postedAt: ['Posted Timestamp (Base)', 'Posted Timestamp'],
};
const LEETCODE = {
  week: ['Week #', 'Week'], day: ['Day #', 'Day'], weekTheme: ['Week Theme'], topic: ['Topic Category'], dayFocus: ['Day Focus'],
  problem: ['Problem Name'], link: ['Open Problem', '🔗 Open Problem'], difficulty: ['Difficulty'], concept: ['ML/AI Connection'], status: ['Status'],
};
const LEETCODE_STATUS = ['Not Started', 'In Progress', 'Solved ✅'];

export function mapTracker(csv) {
  const jobs = [];
  const leads = [];
  const seen = new Set();
  for (const r of toRecords(parseCsv(csv), TRACKER)) {
    if (!r.company && !r.role) continue;
    const status = normalizeStatus(r.status);
    const base = { company: r.company, role: r.role, contact: r.contact, notes: r.notes };
    if (status === 'lead') { leads.push({ ...base, source: 'Tracker', location: '', experience: '', postedTime: '', jobUrl: asUrl(r.contact), createdAt: toTimestamp(r.createdAt) }); continue; }
    const key = `${r.company}|${r.role}`.toLowerCase();
    if (seen.has(key)) continue; // one company+role per user
    seen.add(key);
    jobs.push({
      ...base, status, dateApplied: toDate(r.dateApplied), interviewStatus: r.interviewStatus === '-' ? '' : r.interviewStatus,
      source: 'Tracker', location: '', experience: '', postedTime: '', createdAt: toTimestamp(r.createdAt), updatedAt: toTimestamp(r.updatedAt),
    });
  }
  return { jobs, leads };
}

export function mapLeads(csv) {
  const out = [];
  for (const r of toRecords(parseCsv(csv), LEADS)) {
    if (!r.company) continue;
    if (String(r.applied).toUpperCase() === 'TRUE') continue; // already in the tracker
    const linkedin = asUrl(r.linkedin);
    const careers = asUrl(r.careers);
    const contact = linkedin || careers || asUrl(r.emailSource) || r.email || '';
    out.push({
      company: r.company, role: r.role, location: r.location,
      experience: /^(not stated|not specified)$/i.test(r.experience) ? '' : r.experience,
      contact, jobUrl: linkedin || careers,
      source: linkedin ? 'LinkedIn' : careers ? 'Careers Page' : r.email ? 'Email' : 'Scraped',
      postedTime: /^#/.test(r.postedTime) ? '' : r.postedTime, createdAt: toTimestamp(r.postedAt), notes: '',
    });
  }
  return out;
}

// Master-list rows marked Applied that the tracker does not already have, as Applied jobs.
// The sheet records no application date, so date_applied stays empty and the row's posted
// timestamp is used as its created_at.
export function mapAppliedLeads(csv, existingJobs = []) {
  const have = new Set(existingJobs.map((j) => `${j.company}|${j.role}`.toLowerCase()));
  const out = [];
  for (const r of toRecords(parseCsv(csv), LEADS)) {
    if (!r.company || String(r.applied).toUpperCase() !== 'TRUE') continue;
    const key = `${r.company}|${r.role}`.toLowerCase();
    if (have.has(key)) continue;
    have.add(key);
    out.push({
      company: r.company, role: r.role, status: 'applied', dateApplied: null, interviewStatus: '',
      contact: asUrl(r.linkedin) || asUrl(r.careers) || asUrl(r.emailSource) || r.email || '',
      source: asUrl(r.linkedin) ? 'LinkedIn' : asUrl(r.careers) ? 'Careers Page' : r.email ? 'Email' : 'Scraped',
      location: r.location, experience: /^(not stated|not specified)$/i.test(r.experience) ? '' : r.experience,
      postedTime: /^#/.test(r.postedTime) ? '' : r.postedTime, notes: '', createdAt: toTimestamp(r.postedAt), updatedAt: toTimestamp(r.postedAt),
    });
  }
  return out;
}

export function mapLeetcode(csv) {
  return toRecords(parseCsv(csv), LEETCODE).filter((r) => r.problem).map((r, position) => ({
    position, week: r.week, day: r.day, weekTheme: r.weekTheme, topic: r.topic, dayFocus: r.dayFocus, problem: r.problem,
    link: r.link, difficulty: r.difficulty, concept: r.concept, status: LEETCODE_STATUS.includes(r.status) ? r.status : 'Not Started',
  }));
}

// ---------------------------------------------------------------- SQL
export const q = (v) => (v == null || v === '' ? "''" : `'${String(v).replace(/'/g, "''").replace(/\u0000/g, '')}'`);
const qn = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Target = a uuid (existing profile) or a Clerk user id ('user_...', resolved through clerk_identities,
// which exists once that person has signed in). Either way the SQL stops if no such account exists.
export function buildSql({ userId, clerkUserId, jobs = [], leads = [], problems = [] }) {
  let resolve;
  let label;
  if (clerkUserId) {
    if (!/^user_[A-Za-z0-9]+$/.test(clerkUserId)) throw new Error('clerkUserId must look like user_...');
    resolve = `select user_id from public.clerk_identities where clerk_user_id = '${clerkUserId}'`;
    label = clerkUserId;
  } else {
    if (!UUID.test(userId || '')) throw new Error('userId must be a uuid');
    resolve = `select id as user_id from public.profiles where id = '${userId}'`;
    label = userId;
  }
  const u = '(select user_id from _target)';
  const parts = [
    '-- Generated from Google Sheets exports. Re-runnable: rows that already exist are skipped.',
    'begin;',
    `create temp table _target on commit drop as ${resolve};`,
    `do $$ begin if (select count(*) from _target) <> 1 then raise exception 'No account found for ${label}. Has that person signed in to the app yet?'; end if; end $$;`,
  ];
  if (jobs.length) {
    parts.push('insert into public.jobs (user_id, company, role, status, date_applied, interview_status, contact, source, location, experience, posted_time, notes, created_at, updated_at) values');
    parts.push(jobs.map((j) => `(${u}, ${q(j.company)}, ${q(j.role)}, ${q(j.status)}, ${qn(j.dateApplied)}, ${q(j.interviewStatus)}, ${q(j.contact)}, ${q(j.source)}, ${q(j.location)}, ${q(j.experience)}, ${q(j.postedTime)}, ${q(j.notes)}, coalesce(${qn(j.createdAt)}::timestamptz, now()), coalesce(${qn(j.updatedAt)}::timestamptz, now()))`).join(',\n'));
    parts.push('on conflict do nothing;');
  }
  if (leads.length) {
    parts.push('insert into public.leads (user_id, company, role, location, experience, contact, source, posted_time, job_url, created_at)');
    parts.push('select v.* from (values');
    parts.push(leads.map((l) => `(${u}::uuid, ${q(l.company)}, ${q(l.role)}, ${q(l.location)}, ${q(l.experience)}, ${q(l.contact)}, ${q(l.source)}, ${q(l.postedTime)}, ${q(l.jobUrl)}, coalesce(${qn(l.createdAt)}::timestamptz, now()))`).join(',\n'));
    parts.push(') as v(user_id, company, role, location, experience, contact, source, posted_time, job_url, created_at)');
    parts.push('where not exists (select 1 from public.leads x where x.user_id = v.user_id and lower(x.company) = lower(v.company) and lower(x.role) = lower(v.role));');
  }
  if (problems.length) {
    parts.push('insert into public.leetcode_problems (user_id, position, week, day, week_theme, topic, day_focus, problem, link, difficulty, concept, status)');
    parts.push('select v.* from (values');
    parts.push(problems.map((p) => `(${u}::uuid, ${p.position}, ${q(p.week)}, ${q(p.day)}, ${q(p.weekTheme)}, ${q(p.topic)}, ${q(p.dayFocus)}, ${q(p.problem)}, ${q(p.link)}, ${q(p.difficulty)}, ${q(p.concept)}, ${q(p.status)})`).join(',\n'));
    parts.push(') as v(user_id, position, week, day, week_theme, topic, day_focus, problem, link, difficulty, concept, status)');
    parts.push('where not exists (select 1 from public.leetcode_problems x where x.user_id = v.user_id and x.problem = v.problem);');
  }
  parts.push('commit;');
  return parts.join('\n') + '\n';
}
