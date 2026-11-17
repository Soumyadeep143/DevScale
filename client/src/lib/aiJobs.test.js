import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { looksLikeRows, normalizeRecords, recordToJob, recordsToTsv } from './aiJobs';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
import { supabase } from './supabase';
import { aiErrorMessage, parseJobsWithAI } from './api';

const rec = (o = {}) => ({
  company: 'KLA', recruitmentEmail: '', jobTitle: 'Software Engineer (Full Stack)', experience: "2-3 years (Bachelor's) / 1-2 years (Master's)", location: 'Chennai, India',
  postedTime: 'Posted Today', linkedinUrl: '', careersUrl: 'https://kla.wd1.myworkdayjobs.com/Search/job/Chennai-India/SWE_2643323?bid=370&source=Job_Board_LinkedIn',
  emailSourceUrl: '', applied: '', postedTimestamp: '', ...o,
});

describe('recordToJob', () => {
  it('maps the 12-column record to a job the app can import, like the old "Job leads sheet" import', () => {
    expect(recordToJob(rec())).toMatchObject({
      company: 'KLA', role: 'Software Engineer (Full Stack)', status: 'lead', location: 'Chennai, India', postedTime: 'Posted Today',
      source: 'Careers Page', contact: expect.stringContaining('kla.wd1.myworkdayjobs.com'), jobUrl: expect.stringContaining('?bid=370'), dateApplied: '',
    });
  });
  it('Applied stays blank (a lead) unless the record says TRUE', () => {
    expect(recordToJob(rec()).status).toBe('lead');
    expect(recordToJob(rec({ applied: 'TRUE' })).status).toBe('applied');
  });
  it('picks contact and source like the old import: LinkedIn, then careers, then email', () => {
    expect(recordToJob(rec({ linkedinUrl: 'https://in.linkedin.com/jobs/view/1' }))).toMatchObject({ contact: 'https://in.linkedin.com/jobs/view/1', source: 'LinkedIn' });
    expect(recordToJob(rec({ careersUrl: '', recruitmentEmail: 'hr@kla.com' }))).toMatchObject({ contact: 'hr@kla.com', source: 'Email', jobUrl: '' });
    expect(recordToJob(rec({ careersUrl: '' }))).toMatchObject({ contact: '', source: 'AI import' });
  });
  it('keeps a recruiter email that a link would otherwise push out of the contact slot', () => {
    expect(recordToJob(rec({ recruitmentEmail: 'hr@kla.com' })).notes).toBe('Recruiter: hr@kla.com');
    expect(recordToJob(rec({ careersUrl: '', recruitmentEmail: 'hr@kla.com' })).notes).toBe('');
  });
  it('falls back to the timestamp when there is no posted-time wording', () => {
    expect(recordToJob(rec({ postedTime: '', postedTimestamp: '2026-11-17 09:30:00' })).postedTime).toBe('2026-11-17 09:30:00');
  });
});

describe('recordsToTsv: ready to paste into Google Sheets', () => {
  it('starts with the exact 12 headers, tab-separated, and has exactly 12 fields in every row', () => {
    const lines = recordsToTsv([rec(), rec({ company: 'Entrata', recruitmentEmail: 'a@b.com', emailSourceUrl: 'https://entrata.com/careers', applied: 'TRUE', postedTimestamp: '2026-11-17 09:30:00' })]).split('\n');
    expect(lines[0]).toBe('Company\tRecruitment Email\tJob Title\tExperience\tLocation\tPosted Time\tLinkedIn URL\tCareers URL\tEmail Source URL\tApplied\t(unused)\tPosted Timestamp');
    expect(lines).toHaveLength(3);
    for (const l of lines) expect(l.split('\t')).toHaveLength(12);
  });
  it('leaves the (unused) column empty and keeps empty cells as consecutive tabs', () => {
    const row = recordsToTsv([rec()]).split('\n')[1].split('\t');
    expect(row[0]).toBe('KLA');
    expect(row[1]).toBe(''); // no recruitment email
    expect(row[10]).toBe(''); // unused
    expect(row[7]).toContain('?bid=370&source=Job_Board_LinkedIn'); // URL preserved
  });
  it('can never break the row structure: tabs and line breaks inside a value become spaces', () => {
    const row = recordsToTsv([rec({ company: 'A\tB\nC' })]).split('\n');
    expect(row).toHaveLength(2);
    expect(row[1].split('\t')[0]).toBe('A B C');
  });
  it('its output round-trips through the app\'s own Import parser', async () => {
    const { parsePastedJobs } = await import('./parseImport');
    const tsv = recordsToTsv([rec({ linkedinUrl: 'https://in.linkedin.com/jobs/view/1' })]);
    const { jobs, format } = parsePastedJobs(tsv, 'auto');
    expect(format).toBe('sheet2');
    expect(jobs[0]).toMatchObject({ company: 'KLA', role: 'Software Engineer (Full Stack)', location: 'Chennai, India', source: 'LinkedIn', status: 'lead' });
  });
});

describe('normalizeRecords (the app re-checks what comes back)', () => {
  it('cleans records and drops non-jobs', () => {
    const out = normalizeRecords([rec({ careersUrl: 'javascript:x', recruitmentEmail: 'nope' }), {}, null, 'x']);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ careersUrl: '', recruitmentEmail: '' });
    expect(normalizeRecords('not a list')).toEqual([]);
  });
});

describe('looksLikeRows', () => {
  it('recognises tab- and comma-separated rows, and not prose', () => {
    expect(looksLikeRows('Acme\tDev\tJuly 24\tSent\t-\thr@acme.com')).toBe(true);
    expect(looksLikeRows('a,b,c,d,e\n1,2,3,4,5')).toBe(true);
    expect(looksLikeRows('We are hiring a Backend Engineer in Pune. Apply now!\nResponsibilities: build APIs.')).toBe(false);
    expect(looksLikeRows('')).toBe(false);
  });
});

describe('parseJobsWithAI: three routes, one result shape', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_AI_SERVER_URL', ''); vi.stubEnv('VITE_AI_API_KEY', ''); window.Clerk = { session: { getToken: vi.fn().mockResolvedValue('clerk-token') } }; globalThis.fetch = vi.fn(); });
  afterEach(() => { vi.unstubAllEnvs(); delete window.Clerk; });
  const serverReply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

  it('uses the AI server when its address is set: sends the Clerk token, returns records and importable jobs', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'http://localhost:8787/');
    fetch.mockResolvedValue(serverReply({ ok: true, records: [rec({ careersUrl: 'ftp://bad' })], truncated: true, notices: ['The page says this job may already be filled or closed.'] }));
    const r = await parseJobsWithAI('https://kla.example/job/1');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:8787/api/parse-jobs');
    expect(init.headers.Authorization).toBe('Bearer clerk-token');
    expect(JSON.parse(init.body)).toEqual({ text: 'https://kla.example/job/1' });
    expect(r.records[0].careersUrl).toBe(''); // re-checked
    expect(r.jobs[0]).toMatchObject({ company: 'KLA', role: 'Software Engineer (Full Stack)', status: 'lead' });
    expect(r.truncated).toBe(true);
    expect(r.notices).toHaveLength(1);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('says what to do when the AI server is not running', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'http://localhost:8787');
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(parseJobsWithAI('x')).rejects.toThrow(/Couldn’t reach the AI server at http:\/\/localhost:8787.*npm start/);
  });

  it('passes on the server\'s own message (rate limit, sign-in, bad text)', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'http://localhost:8787');
    fetch.mockResolvedValue(serverReply({ ok: false, error: 'Too many requests. Wait a minute and try again.' }, 429));
    await expect(parseJobsWithAI('x')).rejects.toThrow('Too many requests');
    fetch.mockResolvedValue(serverReply(null, 500));
    await expect(parseJobsWithAI('x')).rejects.toThrow(/returned an error \(500\)/);
  });

  it('asks the person to sign in again when there is no Clerk session, without calling the server', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'http://localhost:8787');
    window.Clerk = { session: null };
    await expect(parseJobsWithAI('x')).rejects.toThrow('Please sign in again.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to the deployed Supabase function when no server or key is set', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true, records: [rec()], truncated: false }, error: null });
    const r = await parseJobsWithAI('text');
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ai', { body: { action: 'parseJobs', payload: { text: 'text' } } });
    expect(r.jobs).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('turns a refusal from the function into an error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: false, error: 'No Groq API key set.' }, error: null });
    await expect(parseJobsWithAI('x')).rejects.toThrow('No Groq API key set.');
  });
});

describe('aiErrorMessage', () => {
  it('names the real cause instead of a CORS error', () => {
    expect(aiErrorMessage({ message: 'Edge Function returned a non-2xx status code', context: { status: 404 } })).toMatch(/isn.t deployed/);
    expect(aiErrorMessage({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })).toMatch(/Couldn.t reach the AI service/);
    expect(aiErrorMessage({ message: 'Failed to fetch' })).toMatch(/Couldn.t reach/);
    expect(aiErrorMessage({ context: { status: 401 }, message: 'x' })).toMatch(/rejected your sign-in/);
  });
  it('passes other messages through', () => {
    expect(aiErrorMessage({ message: 'Groq is busy' })).toBe('Groq is busy');
    expect(aiErrorMessage({})).toBe('AI request failed');
  });
});
