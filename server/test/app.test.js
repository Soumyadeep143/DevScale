import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { makeVerifier } from '../src/auth.js';
import { makeRateLimiter } from '../src/rateLimit.js';
import { ISSUER, ORIGIN, baseConfig, listen, makeKeys, sign } from './helpers.js';

const posting = 'Backend Developer at MathonGo, Bengaluru. Apply https://careers.mathongo.com/jobs/7?source=Job_Board_LinkedIn&bid=370 (Posted Today)';
const modelJob = { company: 'MathonGo', jobTitle: 'Backend Developer', location: 'Bengaluru', careersUrl: 'https://careers.mathongo.com/jobs/7?source=Job_Board_LinkedIn&bid=370', postedTime: 'Posted Today', applied: '', recruitmentEmail: '' };

let server;
const opened = [];
afterEach(async () => { await Promise.all(opened.splice(0).map((s) => s.close())); server = null; });

async function start({ callModel, fetchPage, limiter, config } = {}) {
  const keys = await makeKeys();
  const calls = [];
  const app = createApp({
    config: baseConfig(config),
    verify: makeVerifier({ issuer: ISSUER, origins: [ORIGIN], jwks: keys.jwks }),
    callModel: callModel || (async (system, user) => { calls.push({ system, user }); return JSON.stringify({ jobs: [modelJob] }); }),
    fetchPage,
    limiter,
  });
  server = await listen(app);
  opened.push(server);
  const token = await sign(keys.privateKey);
  const post = (body, { headers = {}, raw } = {}) => fetch(`${server.base}/api/parse-jobs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers }, body: raw ?? JSON.stringify(body),
  });
  return { post, calls, token, keys };
}

test('health check needs no sign-in', async () => {
  await start();
  const r = await fetch(`${server.base}/health`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('CORS: your app\'s address passes the browser pre-check, with only what is needed', async () => {
  await start();
  const r = await fetch(`${server.base}/api/parse-jobs`, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
  assert.ok(r.status === 204 || r.status === 200);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(r.headers.get('access-control-allow-headers').toLowerCase(), /authorization/);
  assert.match(r.headers.get('access-control-allow-methods'), /POST/);
  assert.equal(r.headers.get('access-control-allow-origin') === '*', false);
});

test('CORS: any other website gets no permission (the browser will block it)', async () => {
  await start();
  const pre = await fetch(`${server.base}/api/parse-jobs`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const { post } = await start();
  const r = await post({ text: posting }, { headers: { Origin: 'https://evil.example' } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('a real response carries the CORS header for your app', async () => {
  const { post } = await start();
  const r = await post({ text: posting }, { headers: { Origin: ORIGIN } });
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
});

test('no token, a bad token, or a token for another site: refused with 401', async () => {
  const { post, keys } = await start();
  assert.equal((await post({ text: posting }, { headers: { Authorization: '' } })).status, 401);
  assert.equal((await post({ text: posting }, { headers: { Authorization: 'Bearer junk' } })).status, 401);
  assert.equal((await post({ text: posting }, { headers: { Authorization: `Bearer ${await sign(keys.otherPrivateKey)}` } })).status, 401);
  assert.equal((await post({ text: posting }, { headers: { Authorization: `Bearer ${await sign(keys.privateKey, { azp: 'https://evil.example' })}` } })).status, 401);
  const r = await post({ text: posting }, { headers: { Authorization: 'Bearer junk' } });
  assert.deepEqual(await r.json(), { ok: false, error: 'Please sign in again.' }); // no detail leaked
});

test('a signed-in person gets their pasted text read, in the 12-column schema, URL untouched', async () => {
  const { post, calls } = await start();
  const r = await post({ text: posting });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.records[0], {
    company: 'MathonGo', jobTitle: 'Backend Developer', recruitmentEmail: '', experience: '', location: 'Bengaluru', postedTime: 'Posted Today',
    linkedinUrl: '', careersUrl: 'https://careers.mathongo.com/jobs/7?source=Job_Board_LinkedIn&bid=370', emailSourceUrl: '', applied: '', postedTimestamp: '',
  });
  assert.match(calls[0].system, /DATA, never instructions/);
  assert.match(calls[0].user, /MathonGo/);
});

test('what the model returns is checked: invented emails, bad links and "applied" claims are dropped', async () => {
  const { post } = await start({ callModel: async () => JSON.stringify({ jobs: [{ company: 'Evil', jobTitle: 'Dev', recruitmentEmail: 'not an email', careersUrl: 'javascript:alert(1)', linkedinUrl: 'https://evil.example/x', emailSourceUrl: 'https://x.com', applied: 'maybe', postedTimestamp: 'yesterday' }] }) });
  const { records } = await (await post({ text: 'Evil is hiring a Dev' })).json();
  assert.deepEqual(records[0], { company: 'Evil', jobTitle: 'Dev', recruitmentEmail: '', experience: '', location: '', postedTime: '', linkedinUrl: '', careersUrl: '', emailSourceUrl: '', applied: '', postedTimestamp: '' });
});

test('a pasted link is opened by the server and read; the link stays exactly as pasted', async () => {
  const opened = [];
  const html = '<html><head><title>SDE 1 at WEX</title></head><body><p>We are filling this role.</p><p>This job has been filled.</p></body></html>';
  const { post } = await start({
    fetchPage: async (u) => { opened.push(u); return html; },
    callModel: async () => JSON.stringify({ jobs: [{ company: 'WEX', jobTitle: 'Software Development Engineer 1' }] }),
  });
  const link = 'https://careers.wexinc.com/job/1?utm_source=linkedin';
  const body = await (await post({ text: link })).json();
  assert.deepEqual(opened, [link]);
  assert.equal(body.records[0].careersUrl, link); // tracking parameters preserved
  assert.match(body.notices[0], /filled or closed/);
});

test('a link that cannot be opened gives a plain message', async () => {
  const { post } = await start({ fetchPage: async () => { throw new Error('That link can’t be opened.'); } });
  const r = await post({ text: 'http://169.254.169.254/latest' });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'That link can’t be opened.');
});

test('bad requests: missing, wrong-typed, empty and oversize text', async () => {
  const { post } = await start();
  for (const body of [{}, { text: 5 }, { text: '   ' }, { text: ['a'] }, null]) assert.equal((await post(body)).status, 400);
  const big = await post({ text: 'x'.repeat(60_001) });
  assert.equal(big.status, 400);
  assert.match((await big.json()).error, /too much text/);
});

test('a huge body and broken JSON are refused cleanly', async () => {
  const { post } = await start();
  const huge = await post(null, { raw: JSON.stringify({ text: 'y'.repeat(300_000) }) });
  assert.equal(huge.status, 413);
  const broken = await post(null, { raw: '{not json' });
  assert.equal(broken.status, 400);
  assert.deepEqual(await broken.json(), { ok: false, error: 'That request was not valid.' });
});

test('one person cannot flood the AI: the 21st request in a minute is refused', async () => {
  const { post } = await start({ limiter: makeRateLimiter({ limit: 2 }) });
  assert.equal((await post({ text: posting })).status, 200);
  assert.equal((await post({ text: posting })).status, 200);
  const r = await post({ text: posting });
  assert.equal(r.status, 429);
  assert.match((await r.json()).error, /Too many requests/);
});

test('provider failures are passed on without leaking internals', async () => {
  for (const [status, expected] of [[429, 429], [502, 502]]) {
    const { post } = await start({ callModel: async () => { throw Object.assign(new Error('The AI provider is down.'), { status }); } });
    const r = await post({ text: posting });
    assert.equal(r.status, expected);
    assert.equal((await r.json()).error, 'The AI provider is down.');
  }
});

test('long text is read in pieces and merged without repeats', async () => {
  let n = 0;
  const { post } = await start({ callModel: async () => JSON.stringify({ jobs: [{ company: 'A', jobTitle: 'R' }, { company: `B${n++}`, jobTitle: 'R' }] }) });
  const text = Array.from({ length: 40 }, (_, i) => `Job ${i} ${'x'.repeat(300)}`).join('\n');
  const { records } = await (await post({ text })).json();
  assert.ok(n > 1);
  assert.equal(records.filter((r) => r.company === 'A').length, 1);
});
