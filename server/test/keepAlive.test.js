import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepAliveSettings, startKeepAlive, MIN_SECONDS } from '../src/keepAlive.js';

test('turns itself on from Render\'s address, every 10 minutes by default', () => {
  assert.deepEqual(keepAliveSettings({ RENDER_EXTERNAL_URL: 'https://devscale.onrender.com/' }), { url: 'https://devscale.onrender.com/health', seconds: 600 });
});
test('stays off locally, over plain http, or when switched off', () => {
  assert.equal(keepAliveSettings({}), null);
  assert.equal(keepAliveSettings({ RENDER_EXTERNAL_URL: 'http://localhost:8787' }), null);
  assert.equal(keepAliveSettings({ RENDER_EXTERNAL_URL: 'https://x.onrender.com', KEEP_ALIVE: 'off' }), null);
});
test('refuses to hammer the server: a tiny interval is raised to the minimum', () => {
  assert.equal(keepAliveSettings({ KEEP_ALIVE_URL: 'https://x.onrender.com', KEEP_ALIVE_SECONDS: '0.2' }).seconds, MIN_SECONDS);
  assert.equal(keepAliveSettings({ KEEP_ALIVE_URL: 'https://x.onrender.com', KEEP_ALIVE_SECONDS: '5' }).seconds, MIN_SECONDS);
});
test('pings /health, survives errors, and never overlaps', async () => {
  const logs = []; const calls = []; let release; let tick;
  const k = startKeepAlive({ url: 'https://x.onrender.com/health', seconds: 600 }, {
    fetchImpl: (u) => { calls.push(u); return calls.length === 1 ? new Promise((r) => { release = () => r({ ok: true }); }) : Promise.resolve({ ok: true }); },
    log: (m) => logs.push(m), schedule: (fn) => { tick = fn; return { unref() {} }; },
  });
  const first = tick(); tick(); // second tick while the first is still running
  assert.equal(calls.length, 1);
  release(); await first;
  await k.ping.call(null); // a later ping runs again
  assert.equal(calls.length, 2);
  const bad = startKeepAlive({ url: 'https://x.onrender.com/health', seconds: 60 }, { fetchImpl: async () => { throw new Error('down'); }, log: (m) => logs.push(m), schedule: () => ({ unref() {} }) });
  await bad.ping();
  assert.match(logs.at(-1), /could not reach/);
});
