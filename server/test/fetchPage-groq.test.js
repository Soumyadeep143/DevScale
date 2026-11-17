import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFetchPage } from '../src/fetchPage.js';
import { makeCallModel } from '../src/groq.js';

const html = (s = '<p>hello</p>') => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }), body: new Response(s).body });
const redirect = (to) => ({ ok: false, status: 302, headers: new Headers({ location: to }), body: null });
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];

test('opens an ordinary public page', async () => {
  const page = makeFetchPage({ lookup: publicDns, fetchImpl: async () => html('<p>Job</p>') });
  assert.equal(await page('https://careers.example.com/job/1'), '<p>Job</p>');
});

test('refuses internal and unsafe addresses before making any request', async () => {
  let requests = 0;
  const page = makeFetchPage({ lookup: publicDns, fetchImpl: async () => { requests++; return html(); } });
  for (const u of [
    'http://localhost/x', 'http://127.0.0.1/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest/meta-data', 'http://192.168.1.1/',
    'http://[::1]/', 'http://metadata/', 'http://2130706433/', 'file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)',
    'https://example.com:8443/x', 'https://user:pass@example.com/', 'not a url',
  ]) await assert.rejects(page(u), /can’t be opened/, u);
  assert.equal(requests, 0);
});

test('refuses a public-looking name that resolves to a private address (DNS trick)', async () => {
  for (const address of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '192.168.0.9', '172.16.5.5']) {
    const page = makeFetchPage({ lookup: async () => [{ address, family: 4 }], fetchImpl: async () => html() });
    await assert.rejects(page('https://innocent.example.com/'), /can’t be opened/, address);
  }
  const mixed = makeFetchPage({ lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }], fetchImpl: async () => html() });
  await assert.rejects(mixed('https://innocent.example.com/'), /can’t be opened/);
  const v6 = makeFetchPage({ lookup: async () => [{ address: '::1', family: 6 }], fetchImpl: async () => html() });
  await assert.rejects(v6('https://innocent.example.com/'), /can’t be opened/);
});

test('re-checks every redirect, so a redirect to an internal address is refused', async () => {
  const seen = [];
  const page = makeFetchPage({ lookup: publicDns, fetchImpl: async (u) => { seen.push(u); return redirect('http://169.254.169.254/latest'); } });
  await assert.rejects(page('https://example.com/'), /can’t be opened/);
  assert.deepEqual(seen, ['https://example.com/']);
});

test('follows a few normal redirects, then gives up', async () => {
  let n = 0;
  const ok = makeFetchPage({ lookup: publicDns, fetchImpl: async () => (n++ < 2 ? redirect('/next') : html('<p>done</p>')) });
  assert.equal(await ok('https://example.com/start'), '<p>done</p>');
  const loop = makeFetchPage({ lookup: publicDns, fetchImpl: async () => redirect('/again') });
  await assert.rejects(loop('https://example.com/'), /redirected too many times/);
});

test('explains pages it cannot read', async () => {
  const status = (code) => makeFetchPage({ lookup: publicDns, fetchImpl: async () => ({ ok: false, status: code, headers: new Headers(), body: null }) });
  await assert.rejects(status(403)('https://example.com/'), /HTTP 403/);
  const pdf = makeFetchPage({ lookup: publicDns, fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers({ 'content-type': 'application/pdf' }), body: new Response('x').body }) });
  await assert.rejects(pdf('https://example.com/a.pdf'), /isn’t a web page/);
  const gone = makeFetchPage({ lookup: async () => { throw new Error('ENOTFOUND'); }, fetchImpl: async () => html() });
  await assert.rejects(gone('https://nope.example.com/'), /could not be found/);
});

test('reads at most about 1.5 MB of a huge page', async () => {
  const big = 'x'.repeat(5_000_000);
  const page = makeFetchPage({ lookup: publicDns, fetchImpl: async () => html(big) });
  const got = await page('https://example.com/');
  assert.ok(got.length <= 1_500_000, `read ${got.length}`);
});

test('model call: right request, and errors are mapped without ever exposing the key', async () => {
  let sent;
  const call = makeCallModel({ key: 'SECRET-KEY', base: 'https://api.test/v1', model: 'openai/gpt-oss-120b', fetchImpl: async (u, init) => { sent = { u, init }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"jobs":[]}' } }] }) }; } });
  assert.equal(await call('sys', 'user'), '{"jobs":[]}');
  assert.equal(sent.u, 'https://api.test/v1/chat/completions');
  assert.equal(sent.init.headers.Authorization, 'Bearer SECRET-KEY');
  const body = JSON.parse(sent.init.body);
  assert.deepEqual([body.temperature, body.response_format.type, body.reasoning_effort], [0, 'json_object', 'low']);

  const failing = (status, data = {}) => makeCallModel({ key: 'SECRET-KEY', base: 'x', model: 'm', fetchImpl: async () => ({ ok: false, status, json: async () => data }) });
  await assert.rejects(failing(401)('s', 'u'), (e) => e.status === 502 && /key was rejected/.test(e.message) && !e.message.includes('SECRET-KEY'));
  await assert.rejects(failing(429)('s', 'u'), (e) => e.status === 429 && /rate-limiting/.test(e.message));
  await assert.rejects(failing(400, { error: { message: 'model not found' } })('s', 'u'), (e) => e.status === 502 && e.message === 'model not found');
  const offline = makeCallModel({ key: 'SECRET-KEY', base: 'x', model: 'm', fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); } });
  await assert.rejects(offline('s', 'u'), (e) => e.status === 502 && !e.message.includes('ECONNREFUSED'));
  const other = makeCallModel({ key: 'k', base: 'x', model: 'grok-4', fetchImpl: async (u, init) => { sent = JSON.parse(init.body); return { ok: true, json: async () => ({}) }; } });
  assert.equal(await other('s', 'u'), '');
  assert.equal('reasoning_effort' in sent, false); // only for the gpt-oss models
});

import { extractJobs } from '../../supabase/functions/ai/parseJobs.ts';
test('a job board that answers 403 keeps the link and says so (no model call)', async () => {
  const link = 'https://www.naukri.com/job-listings-python-developer-acme-bengaluru-2-to-5-years-123456789012';
  const out = await extractJobs(link, {
    callModel: async () => { throw new Error('model must not be called'); },
    fetchPage: async () => { throw new Error('The site didn’t let me open that link (HTTP 403). Paste the job text instead.'); },
  });
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].careersUrl, link);
  assert.equal(out.records[0].experience, '2-5 years');
  assert.match(out.notices[0], /Naukri doesn’t allow/);
});
test('other fetch failures still surface as errors', async () => {
  await assert.rejects(extractJobs('https://example.com/job/1', { callModel: async () => '[]', fetchPage: async () => { throw new Error('That site could not be found.'); } }), /could not be found/);
});
