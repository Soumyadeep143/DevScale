// Keeps a free Render service awake by calling its own public /health address now and then.
// Render puts a free service to sleep after ~15 minutes with no incoming traffic, so a call every
// 10 minutes is enough. It is deliberately NOT every 200 ms: that would be 5 requests a second
// (400,000+ a day) for no benefit, and would eat the instance's CPU and bandwidth.
export const MIN_SECONDS = 30;
export const DEFAULT_SECONDS = 600;

export function keepAliveSettings(env = process.env) {
  if (/^(off|false|0)$/i.test(String(env.KEEP_ALIVE || ''))) return null;
  const base = String(env.KEEP_ALIVE_URL || env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (!/^https:\/\/[^\s/]+/i.test(base)) return null; // only runs when there is a public https address (Render sets one)
  const asked = Number(env.KEEP_ALIVE_SECONDS) || DEFAULT_SECONDS;
  return { url: `${base}/health`, seconds: Math.max(MIN_SECONDS, asked) };
}

export function startKeepAlive({ url, seconds }, { fetchImpl = fetch, log = console.log, schedule = setInterval } = {}) {
  let busy = false;
  const ping = async () => {
    if (busy) return; // never let calls pile up
    busy = true;
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) log(`keep-alive: ${url} answered ${res.status}`);
    } catch (e) {
      log(`keep-alive: could not reach ${url} (${e?.name || 'error'})`);
    } finally { busy = false; }
  };
  const timer = schedule(ping, seconds * 1000);
  timer?.unref?.();
  return { ping, stop: () => clearInterval(timer) };
}
