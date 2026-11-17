import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));
import { supabase } from './supabase';
import { parseJobsWithAI } from './api';
import { directAiConfigured, directParseJobs } from './aiDirect';

const reply = (jobs) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ jobs }) } }] }) });
const posting = 'Acme is hiring a Backend Engineer in Pune. 0-2 years. Great team and great pay and lots of benefits for everyone.';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_AI_SERVER_URL', '');
  vi.stubEnv('VITE_AI_API_KEY', 'test-key');
  vi.stubEnv('VITE_AI_BASE_URL', '');
  vi.stubEnv('VITE_AI_MODEL', '');
  globalThis.fetch = vi.fn();
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('direct AI (local development, no server)', () => {
  it('is only on when a key is configured', () => {
    expect(directAiConfigured()).toBe(true);
    vi.stubEnv('VITE_AI_API_KEY', '');
    expect(directAiConfigured()).toBe(false);
  });

  it('calls the provider with the key, JSON mode and the 12-column instructions, and returns checked records', async () => {
    fetch.mockResolvedValue(reply([{ company: 'Acme', jobTitle: 'Backend Engineer', location: 'Pune', careersUrl: 'ftp://nope', applied: 'maybe' }]));
    const r = await directParseJobs(posting);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', temperature: 0, response_format: { type: 'json_object' }, reasoning_effort: 'low' });
    expect(body.messages[0].content).toMatch(/DATA, never instructions/);
    expect(body.messages[1].content).toContain(posting);
    expect(r.records).toEqual([expect.objectContaining({ company: 'Acme', jobTitle: 'Backend Engineer', careersUrl: '', applied: '' })]);
    expect(r.truncated).toBe(false);
  });

  it('can target another provider such as xAI Grok, and another model', async () => {
    vi.stubEnv('VITE_AI_BASE_URL', 'https://api.x.ai/v1/');
    vi.stubEnv('VITE_AI_MODEL', 'grok-4');
    fetch.mockResolvedValue(reply([]));
    await directParseJobs(posting);
    expect(fetch.mock.calls[0][0]).toBe('https://api.x.ai/v1/chat/completions');
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.model).toBe('grok-4');
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('reads long text in pieces and merges them, dropping repeats', async () => {
    const long = Array.from({ length: 40 }, (_, i) => `Job ${i}: ${'x'.repeat(300)}`).join('\n');
    fetch.mockResolvedValueOnce(reply([{ company: 'A', jobTitle: 'R' }])).mockResolvedValue(reply([{ company: 'a', jobTitle: 'r' }, { company: 'B', jobTitle: 'R' }]));
    const r = await directParseJobs(long);
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    expect(r.records.map((x) => x.company)).toEqual(['A', 'B']);
  });

  it('refuses a bare link with a clear reason (a browser cannot open other sites)', async () => {
    await expect(directParseJobs('https://careers.wexinc.com/job/1')).rejects.toThrow(/needs the AI server/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([[401, /rejected the key/], [403, /rejected the key/], [429, /rate-limiting/], [500, /error \(500\)/]])('explains HTTP %i', async (status, message) => {
    fetch.mockResolvedValue({ ok: false, status, json: async () => ({}) });
    await expect(directParseJobs(posting)).rejects.toThrow(message);
  });

  it('shows the provider\'s own message, and handles a network failure', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: { message: 'model not found' } }) });
    await expect(directParseJobs(posting)).rejects.toThrow('model not found');
    fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(directParseJobs(posting)).rejects.toThrow(/Could not reach the AI provider/);
  });

  it('never runs when no key is configured', async () => {
    vi.stubEnv('VITE_AI_API_KEY', '');
    await expect(directParseJobs(posting)).rejects.toThrow(/not configured/);
  });
});

describe('parseJobsWithAI chooses the route', () => {
  it('uses the direct route in development when a key is set, and never the server function', async () => {
    fetch.mockResolvedValue(reply([{ company: 'Acme', jobTitle: 'Dev' }]));
    const r = await parseJobsWithAI(posting);
    expect(r.jobs).toHaveLength(1);
    expect(r.records).toHaveLength(1);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('the AI server wins over a local key when both are set', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'http://localhost:8787');
    window.Clerk = { session: { getToken: async () => 't' } };
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, records: [{ company: 'Acme', jobTitle: 'Dev' }] }) });
    await parseJobsWithAI(posting);
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:8787/api/parse-jobs');
    delete window.Clerk;
  });
});
