/**
 * DevScale — Google Apps Script backend.
 *
 * Bound to the "tracking jobs" spreadsheet (Sheet1: Company, Role, Date
 * Applied, Status, Interview Status, Job Link/Mail). It also reads/writes
 * the separate "scraping jobs" (leads) spreadsheet and the LeetCode tracker
 * spreadsheet by ID, so one Apps Script deployment serves all three, and
 * runs a multi-turn AI assistant backed by Groq.
 *
 * The leads sheet has its own "Job application" Apps Script project with an
 * onEdit trigger (onAppliedEdit) that copies a row into the tracker when the
 * "Applied" checkbox is ticked by hand in the UI. Apps Script edit triggers
 * — installable or simple — only fire for genuine UI edits, never for
 * script-driven writes (even from another script), so a checkbox flipped
 * via this API would not reach their trigger. Marking a lead "Applied" here
 * therefore replicates that copy itself (same dedup rule they use), instead
 * of relying on a trigger that can't see it.
 *
 * Every field is read and written using this account's own vocabulary:
 * the tracker's Status column keeps its existing dropdown values (Sent /
 * Applied / In Progress / Selected / Rejected) and the leads sheet's
 * Applied column stays a real checkbox — this script never silently
 * rewrites either into some other format.
 *
 * Deploy as a Web App (Execute as: Me, Who has access: Anyone with the link)
 * and paste the resulting /exec URL + the SECRET_TOKEN below into the app's
 * Setup screen. See ../SETUP.md for the full walkthrough.
 */

// Change this to any random string of your own before deploying — this
// value never needs to leave your own Apps Script project.
const SECRET_TOKEN = 'CHANGE_ME_TO_A_RANDOM_STRING';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

const TRACKER_TAB_NAME = 'Sheet1';

const LEADS_SHEET_ID = '1v6EGTqJ--HehRELC2UOTXhDmGU1fU30cTxcqbhnGhe4';
const LEADS_TAB_NAME = 'Sheet1';

const LEETCODE_SHEET_ID = '1TWGv91-BjIgOIa9bilQQYP4CN31IPj-W4IvZp8jG57o';
const LEETCODE_TAB_NAME = 'Soumyadeep_35Day_LeetCode_Tracker.csv';
const LEETCODE_STATUSES = ['Not Started', 'In Progress', 'Solved ✅'];

const VALID_STATUSES = ['lead', 'applied', 'interviewing', 'offer', 'rejected'];
// Maps this app's internal pipeline stages to the tracker's own existing
// Status dropdown values — never invent new text, always write one of the
// five options that dropdown already has (Sent / Applied / In Progress /
// Selected / Rejected).
const STATUS_LABELS = { applied: 'Applied', interviewing: 'In Progress', offer: 'Selected', rejected: 'Rejected' };
const TRACKER_STATUS_OPTIONS = ['Sent', 'Applied', 'In Progress', 'Selected', 'Rejected'];

// Physical column order on the tracker's Sheet1 — A–F already existed
// (shared with the leads sheet's own automation); G–J are appended by this
// script the first time it runs, without touching the existing columns.
const TRACKER_COLUMNS = ['company', 'role', 'dateApplied', 'status', 'interviewStatus', 'contact', 'id', 'notes', 'createdAt', 'updatedAt'];
const TRACKER_HEADERS = ['Company', 'Role', 'Date Applied', 'Status', 'Interview Status', 'Job Link/Mail', 'ID', 'Notes', 'Created At', 'Updated At'];
const TCOL = {};
TRACKER_COLUMNS.forEach(function (name, idx) { TCOL[name] = idx; });

// Physical column order on the leads sheet — all pre-existing, untouched.
const LEADS_COLUMNS = ['company', 'email', 'jobTitle', 'experience', 'location', 'postedTime', 'linkedinUrl', 'careersUrl', 'emailSourceUrl', 'applied', 'unnamed', 'postedTimestamp'];
const LCOL = {};
LEADS_COLUMNS.forEach(function (name, idx) { LCOL[name] = idx; });

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Every sheet read-then-write (find a row, then write back to it; append a
// row, then stamp its dropdown) has to be atomic across concurrent requests
// — two tabs open, the 10s poll firing mid-edit, or the AI assistant reading
// while you add a job. Without this, concurrent executions can interleave
// and corrupt or misplace rows. Callers acquire this once per top-level
// action and never nest it, so it's always released promptly (including
// before any slow network call like Groq, which must never run while
// holding the lock).
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('The tracker is busy right now — please try again in a few seconds.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function isEmailStr_(s) {
  return /@/.test(String(s || '')) && !/\s/.test(String(s || ''));
}

// Old rows sometimes have a real Date cell (auto-typed by Sheets) rather
// than text — JSON.stringify would otherwise turn that into a full
// timestamp instead of a plain date.
function formatDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v;
}

// Reads whatever text is already in the Status cell (their five dropdown
// values, or anything hand-typed) and interprets it for the app's own
// Lead/Applied/Interviewing/Offer/Rejected board — purely for display and
// filtering. This never writes anything back; the cell's own text is left
// exactly as the user (or their dropdown) set it.
function normalizeStatus_(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (VALID_STATUSES.indexOf(s) !== -1) return s;
  if (s === 'rejected' || s === 'declined') return 'rejected';
  if (s === 'selected' || s === 'offer') return 'offer';
  if (s === 'in progress' || s === 'interviewing') return 'interviewing';
  if (s === 'sent' || s === 'applied' || s === 'submitted' || s === 'true') return 'applied';
  if (!s) return 'lead';
  if (s.indexOf('reject') !== -1 || s.indexOf('declin') !== -1) return 'rejected';
  if (s.indexOf('select') !== -1 || s.indexOf('offer') !== -1) return 'offer';
  if (s.indexOf('progress') !== -1 || s.indexOf('interview') !== -1) return 'interviewing';
  if (s.indexOf('sent') !== -1 || s.indexOf('appl') !== -1 || s.indexOf('submit') !== -1) return 'applied';
  return 'lead';
}

function getTrackerSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKER_TAB_NAME);
  if (!sheet) throw new Error('Tracker tab "' + TRACKER_TAB_NAME + '" not found');

  // Backfill only the new header cells (G1:J1) — never touch the existing
  // A1:F1 headers or data.
  const existingHeaders = sheet.getRange(1, 1, 1, TRACKER_HEADERS.length).getValues()[0];
  let headerNeedsWrite = false;
  const headerRow = TRACKER_HEADERS.map(function (label, idx) {
    if (idx < 6) return existingHeaders[idx] || label;
    if (!existingHeaders[idx]) { headerNeedsWrite = true; return label; }
    return existingHeaders[idx];
  });
  if (headerNeedsWrite) sheet.getRange(1, 1, 1, TRACKER_HEADERS.length).setValues([headerRow]);

  return sheet;
}

function getLeadsSheet_() {
  const sheet = SpreadsheetApp.openById(LEADS_SHEET_ID).getSheetByName(LEADS_TAB_NAME);
  if (!sheet) throw new Error('Leads tab "' + LEADS_TAB_NAME + '" not found');
  return sheet;
}

/**
 * Reads every tracker row, tolerating rows added or edited by hand (or by
 * the leads sheet's own automation, which only ever writes columns A–F):
 * backfills a missing id/createdAt and normalizes a hand-typed status,
 * writing those fixes back so the row behaves correctly from then on.
 */
function readTracker_() {
  const sheet = getTrackerSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const range = sheet.getRange(2, 1, lastRow - 1, TRACKER_COLUMNS.length);
  const values = range.getValues();
  let needsWrite = false;
  const now = new Date().toISOString();

  const jobs = values
    .map(function (row) {
      const obj = {};
      TRACKER_COLUMNS.forEach(function (col, idx) { obj[col] = row[idx]; });

      const hasContent = String(obj.company || '').trim() || String(obj.role || '').trim();
      if (!hasContent) return null;

      if (!obj.id) {
        obj.id = 't-' + Utilities.getUuid();
        row[TCOL.id] = obj.id;
        needsWrite = true;
      }

      // Interpreted for the app's own board only — the Status cell itself
      // is never rewritten, so the tracker's dropdown stays exactly as is.
      obj.status = normalizeStatus_(obj.status);

      if (obj.interviewStatus === '-') obj.interviewStatus = '';
      obj.dateApplied = formatDate_(obj.dateApplied);

      if (!obj.createdAt) {
        obj.createdAt = obj.updatedAt || now;
        row[TCOL.createdAt] = obj.createdAt;
        needsWrite = true;
      }

      obj.source = obj.source || 'Tracker';
      return obj;
    })
    .filter(Boolean);

  if (needsWrite) range.setValues(values);

  return jobs;
}

/**
 * Reads leads that haven't been applied to yet (once applied, the row lives
 * on as history here, but the job itself now lives in the tracker — the
 * source of truth moves over, so we don't show it twice).
 */
function readLeads_() {
  const sheet = getLeadsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, LEADS_COLUMNS.length).getValues();

  return values
    .map(function (row, i) {
      const obj = {};
      LEADS_COLUMNS.forEach(function (col, idx) { obj[col] = row[idx]; });
      if (!String(obj.company || '').trim()) return null;
      if (obj.applied === true || String(obj.applied).toUpperCase() === 'TRUE') return null;

      const contact = obj.linkedinUrl || obj.careersUrl || obj.emailSourceUrl || obj.email || '';
      const source = obj.linkedinUrl ? 'LinkedIn' : (obj.careersUrl ? 'Careers Page' : (obj.email ? 'Email' : 'Scraped'));

      return {
        id: 'l-' + (i + 2),
        company: obj.company,
        role: obj.jobTitle,
        location: obj.location,
        experience: (obj.experience && obj.experience !== 'Not stated' && obj.experience !== 'Not specified') ? obj.experience : '',
        status: 'lead',
        dateApplied: '',
        interviewStatus: '',
        contact: contact,
        source: source,
        postedTime: obj.postedTime,
        notes: '',
      };
    })
    .filter(Boolean);
}

function readAll_() {
  return readTracker_().concat(readLeads_());
}

function findTrackerRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, TCOL.id + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function rowFromTrackerJob_(job) {
  return TRACKER_COLUMNS.map(function (col) {
    if (col === 'status') return STATUS_LABELS[job.status] || job.status || '';
    return job[col] !== undefined && job[col] !== null ? job[col] : '';
  });
}

// Rows appended via the API don't automatically inherit the dropdown/
// checkbox formatting of the sheet's existing rows, so new rows apply it
// explicitly — the cell still holds one of the sheet's own valid values,
// this just keeps the same clickable-dropdown affordance the rest of the
// column has.
function applyStatusDropdown_(sheet, row) {
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(TRACKER_STATUS_OPTIONS, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(row, TCOL.status + 1).setDataValidation(rule);
}

function setAppliedCheckbox_(sheet, row, value) {
  const cell = sheet.getRange(row, LCOL.applied + 1);
  cell.insertCheckboxes();
  cell.setValue(value);
}

function appendTrackerJob_(job, now) {
  const sheet = getTrackerSheet_();
  job.id = 't-' + Utilities.getUuid();
  job.status = normalizeStatus_(job.status);
  job.createdAt = now;
  job.updatedAt = now;
  sheet.appendRow(rowFromTrackerJob_(job));
  applyStatusDropdown_(sheet, sheet.getLastRow());
  return job;
}

function appendLeadJob_(job, now) {
  const sheet = getLeadsSheet_();
  const contact = job.contact || '';
  const email = isEmailStr_(contact) ? contact : '';
  const url = !isEmailStr_(contact) ? contact : '';
  const isLinkedin = /linkedin\.com/i.test(url);
  const row = [];
  row[LCOL.company] = job.company || '';
  row[LCOL.email] = email;
  row[LCOL.jobTitle] = job.role || '';
  row[LCOL.experience] = job.experience || '';
  row[LCOL.location] = job.location || '';
  row[LCOL.postedTime] = job.postedTime || '';
  row[LCOL.linkedinUrl] = isLinkedin ? url : '';
  row[LCOL.careersUrl] = (!isLinkedin && url) ? url : '';
  row[LCOL.emailSourceUrl] = '';
  row[LCOL.applied] = '';
  row[LCOL.unnamed] = '';
  row[LCOL.postedTimestamp] = now;
  sheet.appendRow(row);
  const newRow = sheet.getLastRow();
  setAppliedCheckbox_(sheet, newRow, false);
  return { id: 'l-' + newRow, status: 'lead' };
}

function getGroqKey_() {
  return PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
}

// --- Supabase mirror -------------------------------------------------------
// Google Sheets stays the single source of truth for both jobs and leads —
// this project never authors data in Supabase directly. Every write made
// through the website (or a manual edit typed into the sheet, once the
// onTrackerEdit trigger below is installed) pushes a copy into Supabase, so
// Supabase always mirrors the sheet rather than the other way around. That
// one-directional flow is what keeps this safe from sync loops: nothing
// ever reads a change *from* Supabase and writes it back to the sheet.
// Entirely optional — every function here silently no-ops if
// SUPABASE_URL / SUPABASE_SERVICE_KEY aren't set as Script Properties.

function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key: key };
}

// `preferOverride` lets callers ask for upsert semantics
// ("resolution=merge-duplicates") instead of the default plain insert/error
// behavior — PostgREST's Prefer header controls this per-request.
function supabaseRequest_(method, path, body, preferOverride) {
  const cfg = getSupabaseConfig_();
  if (!cfg) throw new Error('Not set up yet. In Apps Script, add SUPABASE_URL and SUPABASE_SERVICE_KEY as Script Properties. See SETUP.md.');

  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json',
      Prefer: preferOverride || 'return=representation',
    },
  };
  if (body !== undefined) options.payload = JSON.stringify(body);

  const res = UrlFetchApp.fetch(cfg.url + '/rest/v1' + path, options);
  const status = res.getResponseCode();
  const text = res.getContentText();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = text;
  }
  if (status >= 400) {
    const msg = (data && data.message) || ('Supabase request failed (' + status + ')');
    throw new Error(msg);
  }
  return data;
}

function listNotes_() {
  if (!getSupabaseConfig_()) return [];
  return supabaseRequest_('get', '/notes?select=*&order=updated_at.desc') || [];
}

function createNote_(content) {
  const now = new Date().toISOString();
  const rows = supabaseRequest_('post', '/notes', [{ content: content || '', created_at: now, updated_at: now }]);
  return rows && rows[0];
}

function updateNote_(id, content) {
  const rows = supabaseRequest_('patch', '/notes?id=eq.' + encodeURIComponent(String(id)), {
    content: content || '',
    updated_at: new Date().toISOString(),
  });
  return rows && rows[0];
}

function deleteNote_(id) {
  supabaseRequest_('delete', '/notes?id=eq.' + encodeURIComponent(String(id)));
}

// Shape mirrored into Supabase's `jobs` table — deliberately flat text
// columns (rather than typed date/timestamp columns) because the sheet
// itself sometimes holds hand-typed or irregular values; the mirror should
// never fail to sync just because a column's type is stricter than the
// sheet's own data.
function jobToSupabaseRow_(job) {
  return {
    id: String(job.id),
    company: job.company || '',
    role: job.role || '',
    status: job.status || '',
    date_applied: job.dateApplied || '',
    interview_status: job.interviewStatus || '',
    contact: job.contact || '',
    source: job.source || '',
    location: job.location || '',
    experience: job.experience || '',
    posted_time: job.postedTime || '',
    notes: job.notes || '',
    created_at: job.createdAt || '',
    updated_at: job.updatedAt || '',
    synced_at: new Date().toISOString(),
  };
}

// Used after a single create/update — one small upsert instead of
// resyncing everything. Best-effort: a Supabase hiccup here must never
// break the sheet write the user is actually waiting on.
function upsertJobToSupabase_(job) {
  if (!getSupabaseConfig_() || !job || !job.id) return;
  try {
    supabaseRequest_('post', '/jobs', [jobToSupabaseRow_(job)], 'resolution=merge-duplicates,return=minimal');
  } catch (err) {
    console.error('Supabase job upsert failed: ' + err);
  }
}

function deleteJobFromSupabase_(id) {
  if (!getSupabaseConfig_() || !id) return;
  try {
    supabaseRequest_('delete', '/jobs?id=eq.' + encodeURIComponent(String(id)));
  } catch (err) {
    console.error('Supabase job delete failed: ' + err);
  }
}

// Used after bulk imports, lead promotions, and manual sheet edits — cases
// where reconciling the whole table is simpler and safer than tracking
// exactly what changed by hand. Cheap at personal-tracker scale (dozens to
// low hundreds of rows).
function resyncAllJobsToSupabase_(jobs) {
  if (!getSupabaseConfig_()) return;
  try {
    const rows = jobs.map(jobToSupabaseRow_);
    for (var i = 0; i < rows.length; i += 200) {
      supabaseRequest_('post', '/jobs', rows.slice(i, i + 200), 'resolution=merge-duplicates,return=minimal');
    }
    const idList = jobs.map(function (j) { return String(j.id); }).join(',');
    const filter = idList ? ('/jobs?id=not.in.(' + idList + ')') : '/jobs?id=neq.__never__';
    supabaseRequest_('delete', filter);
  } catch (err) {
    console.error('Supabase full resync failed: ' + err);
  }
}

// Install this once as an installable trigger — in the Apps Script editor:
// Triggers (clock icon) → Add Trigger → function "onTrackerEdit" → event
// source "From spreadsheet" → event type "On edit" → Save. That's what
// makes a value typed straight into the sheet reach Supabase within
// moments. Skipping it isn't a problem: the sheet stays fully correct and
// the app still shows manual edits via its normal 10s poll — Supabase's
// copy will just catch up on the next add/edit/delete/import made through
// the website instead of immediately.
//
// Simple (automatic) `onEdit(e)` triggers are sandboxed and can't call
// UrlFetchApp, which is why this has to be installed as an installable
// trigger rather than just working automatically like readTracker_'s
// backfill does.
function onTrackerEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== TRACKER_TAB_NAME) return;
    if (e.range.getRow() < 2) return; // header row — nothing to sync

    const jobs = withLock_(function () { return readAll_(); });
    resyncAllJobsToSupabase_(jobs);
  } catch (err) {
    console.error('onTrackerEdit sync failed: ' + err);
  }
}

function getLeetcodeSheet_() {
  return SpreadsheetApp.openById(LEETCODE_SHEET_ID).getSheetByName(LEETCODE_TAB_NAME);
}

function getLeetcodeProgress_() {
  const sheet = getLeetcodeSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { total: 0, solved: 0, inProgress: 0, notStarted: 0, percent: 0, byWeek: [], problems: [] };

  const values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  const byWeekMap = {};
  const problems = values.map(function (row, i) {
    const [week, day, weekTheme, topic, dayFocus, problem, link, difficulty, concept, status] = row;
    if (!problem) return null;

    const key = String(week);
    if (!byWeekMap[key]) byWeekMap[key] = { week: key, theme: weekTheme, total: 0, solved: 0 };
    byWeekMap[key].total += 1;
    if (status === 'Solved ✅') byWeekMap[key].solved += 1;

    return {
      row: i + 2,
      week: week,
      day: day,
      weekTheme: weekTheme,
      topic: topic,
      dayFocus: dayFocus,
      problem: problem,
      link: link,
      difficulty: difficulty,
      concept: concept,
      status: status || 'Not Started',
    };
  }).filter(Boolean);

  const total = problems.length;
  const solved = problems.filter(function (p) { return p.status === 'Solved ✅'; }).length;
  const inProgress = problems.filter(function (p) { return p.status === 'In Progress'; }).length;
  const notStarted = total - solved - inProgress;

  return {
    total: total,
    solved: solved,
    inProgress: inProgress,
    notStarted: notStarted,
    percent: total ? Math.round((solved / total) * 1000) / 10 : 0,
    byWeek: Object.keys(byWeekMap).sort().map(function (k) { return byWeekMap[k]; }),
    problems: problems,
  };
}

function buildJobsContext_(jobs) {
  const counts = {};
  VALID_STATUSES.forEach(function (s) { counts[s] = 0; });
  jobs.forEach(function (j) { counts[j.status] = (counts[j.status] || 0) + 1; });

  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const appliedToday = jobs.filter(function (j) { return j.dateApplied === today; }).length;

  const lines = jobs.slice(0, 400).map(function (j) {
    const parts = [j.company, j.role, 'stage: ' + j.status];
    if (j.dateApplied) parts.push('applied ' + j.dateApplied);
    if (j.interviewStatus) parts.push('interview status: ' + j.interviewStatus);
    if (j.notes) parts.push('comment: ' + j.notes);
    return '- ' + parts.filter(Boolean).join(' | ');
  });

  return 'Today\'s date: ' + today + '\nApplied today: ' + appliedToday +
    '\nCounts by stage: ' + JSON.stringify(counts) + '\n\nJobs (most recent first):\n' + lines.join('\n');
}

function buildNotesContext_(notes) {
  if (!notes || !notes.length) return '';
  const lines = notes.slice(0, 100).map(function (n) {
    const stamp = (n.updated_at || n.created_at || '').slice(0, 10);
    return '- [' + stamp + '] ' + String(n.content || '').replace(/\s+/g, ' ').slice(0, 500);
  });
  return '\n\nGeneral strategy notes, not tied to a specific job (most recent first):\n' + lines.join('\n');
}

// `history` is the prior turns of this chat session, sent by the client as
// [{role: 'user'|'ai', text: string}, ...] — this is what makes it a real
// multi-turn assistant instead of a one-shot Q&A.
function askGroq_(question, history, jobs, notes) {
  const apiKey = getGroqKey_();
  if (!apiKey) {
    return { ok: false, error: 'No Groq API key set. In Apps Script, go to Project Settings → Script Properties, add GROQ_API_KEY. See SETUP.md.' };
  }

  const context = buildJobsContext_(jobs) + buildNotesContext_(notes);
  const systemPrompt = 'You are a sharp, concise job-search assistant embedded in the user\'s job tracker app. ' +
    'You can see their full pipeline below — every job\'s stage and their own notes/comments — plus their ' +
    'general job-search strategy notes. ' +
    'Answer naturally and specifically using this data (mention companies/roles by name when relevant). ' +
    'When asked where they\'re failing or what to improve, look for patterns across rejected/stalled jobs ' +
    '(stage they keep dying at, missing follow-ups, recurring feedback in comments) rather than a generic answer. ' +
    'Keep answers tight: short paragraphs or bullet points, no markdown headers. ' +
    'If asked something the data can\'t answer, say so plainly rather than guessing.\n\n' + context;

  const messages = [{ role: 'system', content: systemPrompt }];
  (history || []).slice(-12).forEach(function (m) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
  });
  messages.push({ role: 'user', content: question });

  const res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify({ model: GROQ_MODEL, messages: messages, temperature: 0.4, max_tokens: 800 }),
  });

  const status = res.getResponseCode();
  let data;
  try {
    data = JSON.parse(res.getContentText());
  } catch (err) {
    return { ok: false, error: 'Groq returned an unreadable response.' };
  }
  if (status !== 200) {
    return { ok: false, error: (data.error && data.error.message) || 'Groq request failed (' + status + ')' };
  }
  const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { ok: true, answer: answer || 'No response from Groq.' };
}

// One-off, focused analysis of a single job — distinct from askGroq_'s open
// chat: this always asks the same two things (likely reason, concrete next
// step) about whatever's pasted into that job's notes (e.g. a rejection
// email), and is never written back automatically — the client only saves
// the result to notes once the user explicitly confirms.
function analyzeRejection_(job) {
  const apiKey = getGroqKey_();
  if (!apiKey) {
    return { ok: false, error: 'No Groq API key set. In Apps Script, go to Project Settings → Script Properties, add GROQ_API_KEY. See SETUP.md.' };
  }

  const prompt = 'A job application has the details below. The notes may contain a pasted rejection email or ' +
    'recruiter message.\n\n' +
    'Company: ' + (job.company || 'Unknown') + '\n' +
    'Role: ' + (job.role || 'Unknown') + '\n' +
    'Current stage: ' + (job.status || 'unknown') + '\n' +
    'Notes / pasted message:\n' + (job.notes ? job.notes : '(none)') + '\n\n' +
    'In 4-6 sentences: (1) state the most likely reason for this outcome based on the text — quote or ' +
    'paraphrase the specific line that suggests it if there is one, or say plainly if it\'s not stated; ' +
    '(2) give one concrete, specific next step this candidate should take. Be direct and practical. ' +
    'No headers, no markdown, no filler.';

  const res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a direct, specific job-search coach. No pleasantries, no hedging beyond what the evidence supports.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
    }),
  });

  const status = res.getResponseCode();
  let data;
  try {
    data = JSON.parse(res.getContentText());
  } catch (err) {
    return { ok: false, error: 'Groq returned an unreadable response.' };
  }
  if (status !== 200) {
    return { ok: false, error: (data.error && data.error.message) || 'Groq request failed (' + status + ')' };
  }
  const answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { ok: true, analysis: answer || 'No response from Groq.' };
}

function doGet(e) {
  try {
    const params = e.parameter || {};
    if (params.token !== SECRET_TOKEN) {
      return jsonOut_({ ok: false, error: 'Invalid token' });
    }

    if (params.action === 'ping') {
      const info = withLock_(function () {
        const sheet = getTrackerSheet_();
        return { sheet: sheet.getName(), count: Math.max(sheet.getLastRow() - 1, 0) };
      });
      return jsonOut_(Object.assign({ ok: true }, info));
    }

    if (params.action === 'leetcode') {
      return jsonOut_(Object.assign({ ok: true }, getLeetcodeProgress_()));
    }

    if (params.action === 'notes') {
      return jsonOut_({ ok: true, notes: listNotes_() });
    }

    const jobs = withLock_(function () { return readAll_(); });
    return jsonOut_({ ok: true, jobs: jobs });
  } catch (err) {
    // Apps Script returns an uncaught exception as an HTML error page, not
    // JSON — the client's res.json() would then throw a confusing parse
    // error instead of the real message. Always answer with JSON.
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Invalid JSON body' });
  }

  if (body.token !== SECRET_TOKEN) {
    return jsonOut_({ ok: false, error: 'Invalid token' });
  }

  const now = new Date().toISOString();

  try {
    if (body.action === 'create') {
      const job = body.payload || {};
      const created = withLock_(function () {
        const status = normalizeStatus_(job.status);
        return status === 'lead' ? appendLeadJob_(job, now) : appendTrackerJob_(job, now);
      });
      const fullJob = Object.assign({}, job, created);
      upsertJobToSupabase_(fullJob);
      return jsonOut_({ ok: true, job: fullJob });
    }

    if (body.action === 'update') {
      const payload = body.payload || {};
      const id = String(payload.id || '');
      let resyncAll = false;
      let syncedJob = null;

      const result = withLock_(function () {
        if (id.indexOf('l-') === 0) {
          const leadRow = parseInt(id.slice(2), 10);
          const promoting = payload.status && normalizeStatus_(payload.status) !== 'lead';
          const leadsSheet = getLeadsSheet_();
          if (promoting) {
            setAppliedCheckbox_(leadsSheet, leadRow, true);

            // Their onAppliedEdit trigger only fires for edits made through
            // the Sheets UI, never for this API call, so its copy-to-tracker
            // job has to happen here instead — same dedup rule it uses
            // (skip if this company+role pair is already in the tracker).
            const leadValues = leadsSheet.getRange(leadRow, 1, 1, LEADS_COLUMNS.length).getValues()[0];
            const leadObj = {};
            LEADS_COLUMNS.forEach(function (col, idx) { leadObj[col] = leadValues[idx]; });

            const trackerSheet = getTrackerSheet_();
            const lastTrackerRow = trackerSheet.getLastRow();
            const existingPairs = lastTrackerRow > 1
              ? trackerSheet.getRange(2, 1, lastTrackerRow - 1, 2).getValues()
              : [];
            const isDup = existingPairs.some(function (r) { return r[0] === leadObj.company && r[1] === leadObj.jobTitle; });

            if (!isDup) {
              const link = leadObj.linkedinUrl || leadObj.careersUrl || leadObj.email || '';
              const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
              trackerSheet.appendRow([leadObj.company, leadObj.jobTitle, today, 'Applied', '-', link]);
              applyStatusDropdown_(trackerSheet, trackerSheet.getLastRow());
            }
            resyncAll = true; // cross-sheet move — reconcile everything rather than hand-build the new row
            return { ok: true, promoted: true };
          }
          // Non-promoting edit of a still-a-lead row: update what we can.
          if (payload.company !== undefined) leadsSheet.getRange(leadRow, LCOL.company + 1).setValue(payload.company);
          if (payload.role !== undefined) leadsSheet.getRange(leadRow, LCOL.jobTitle + 1).setValue(payload.role);
          if (payload.location !== undefined) leadsSheet.getRange(leadRow, LCOL.location + 1).setValue(payload.location);
          if (payload.experience !== undefined) leadsSheet.getRange(leadRow, LCOL.experience + 1).setValue(payload.experience);
          resyncAll = true;
          return { ok: true };
        }

        const sheet = getTrackerSheet_();
        const row = findTrackerRowById_(sheet, id);
        if (row === -1) return { ok: false, error: 'Job not found' };

        const current = {};
        const rowValues = sheet.getRange(row, 1, 1, TRACKER_COLUMNS.length).getValues()[0];
        TRACKER_COLUMNS.forEach(function (col, idx) { current[col] = rowValues[idx]; });

        const updated = Object.assign({}, current, payload, { updatedAt: now });
        // Always normalize, not just when this edit touches status/date —
        // `current.status` is the sheet's raw label ("Applied", not
        // 'applied') and `current.dateApplied` can be a real Date object on
        // older rows. Editing e.g. just notes must not send those back
        // un-normalized: the client trusts this response and replaces its
        // local job with it verbatim, so a raw label here would make the
        // job vanish from its board column until the next poll silently
        // fixed it.
        updated.status = normalizeStatus_(payload.status || current.status);
        updated.dateApplied = formatDate_(updated.dateApplied);
        if (updated.interviewStatus === '-') updated.interviewStatus = '';
        sheet.getRange(row, 1, 1, TRACKER_COLUMNS.length).setValues([rowFromTrackerJob_(updated)]);
        syncedJob = updated;
        return { ok: true, job: updated };
      });

      if (syncedJob) upsertJobToSupabase_(syncedJob);
      if (resyncAll) resyncAllJobsToSupabase_(withLock_(function () { return readAll_(); }));

      return jsonOut_(result);
    }

    if (body.action === 'delete') {
      const id = String((body.payload || {}).id || '');
      let notFound = false;

      withLock_(function () {
        if (id.indexOf('l-') === 0) {
          const leadRow = parseInt(id.slice(2), 10);
          getLeadsSheet_().deleteRow(leadRow);
          return;
        }
        const sheet = getTrackerSheet_();
        const row = findTrackerRowById_(sheet, id);
        if (row === -1) { notFound = true; return; }
        sheet.deleteRow(row);
      });

      if (notFound) return jsonOut_({ ok: false, error: 'Job not found' });
      deleteJobFromSupabase_(id);
      return jsonOut_({ ok: true });
    }

    if (body.action === 'bulkImport') {
      const jobs = (body.payload && body.payload.jobs) || [];
      const count = withLock_(function () {
        let c = 0;
        jobs.forEach(function (job) {
          const status = normalizeStatus_(job.status);
          if (status === 'lead') appendLeadJob_(job, now); else appendTrackerJob_(job, now);
          c += 1;
        });
        return c;
      });
      resyncAllJobsToSupabase_(withLock_(function () { return readAll_(); }));
      return jsonOut_({ ok: true, count: count });
    }

    if (body.action === 'updateLeetcode') {
      const payload = body.payload || {};
      if (LEETCODE_STATUSES.indexOf(payload.status) === -1) {
        return jsonOut_({ ok: false, error: 'Invalid status' });
      }
      withLock_(function () {
        const lcSheet = getLeetcodeSheet_();
        lcSheet.getRange(payload.row, 10).setValue(payload.status);
      });
      return jsonOut_({ ok: true });
    }

    if (body.action === 'askAI') {
      const payload = body.payload || {};
      const question = payload.question || 'Give me a quick summary of my job search.';
      const jobs = withLock_(function () { return readAll_(); });
      const notes = listNotes_();
      const result = askGroq_(question, payload.history, jobs, notes);
      return jsonOut_(result);
    }

    if (body.action === 'analyzeJob') {
      const result = analyzeRejection_(body.payload || {});
      return jsonOut_(result);
    }

    if (body.action === 'createNote') {
      const note = createNote_((body.payload || {}).content);
      return jsonOut_({ ok: true, note: note });
    }

    if (body.action === 'updateNote') {
      const payload = body.payload || {};
      const note = updateNote_(payload.id, payload.content);
      return jsonOut_({ ok: true, note: note });
    }

    if (body.action === 'deleteNote') {
      deleteNote_((body.payload || {}).id);
      return jsonOut_({ ok: true });
    }

    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}
