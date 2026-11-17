import { lookup as dnsLookup } from 'node:dns/promises';
import { isBlockedHost, isPrivateIp } from '../../supabase/functions/ai/parseJobs.ts';

const REFUSED = 'That link can’t be opened.';
const MAX_BYTES = 1_500_000;

// Opens a public web page for the "paste a link" case. The request comes from inside this server's network,
// so it is locked down: http(s) only, ports 80/443 only, no private or internal addresses (checked on the
// name AND on every address it resolves to, at every redirect), a few redirects, a time limit and a size cap.
export function makeFetchPage({ fetchImpl = fetch, lookup = dnsLookup } = {}) {
  return async function fetchPage(rawUrl) {
    let current = rawUrl;
    for (let hop = 0; hop <= 3; hop++) {
      let u;
      try { u = new URL(current); } catch { throw new Error(REFUSED); }
      if (!/^https?:$/.test(u.protocol) || (u.port && u.port !== '80' && u.port !== '443') || u.username || u.password) throw new Error(REFUSED);
      if (isBlockedHost(u.hostname)) throw new Error(REFUSED);
      let addrs;
      try { addrs = await lookup(u.hostname, { all: true }); } catch { throw new Error('That site could not be found.'); }
      if (!addrs.length || addrs.some((a) => isPrivateIp(a.address) || a.family === 6 && /^(::1|f[cd]|fe80|::ffff:)/i.test(a.address))) throw new Error(REFUSED);

      const res = await fetchImpl(current, {
        redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DevScaleBot/1.0)', Accept: 'text/html,application/xhtml+xml' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), current).toString(); continue; }
      if (!res.ok) throw new Error(`The site didn’t let me open that link (HTTP ${res.status}). Paste the job text instead.`);
      if (!/text\/html|application\/xhtml/i.test(res.headers.get('content-type') || '')) throw new Error('That link isn’t a web page.');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('That page was empty.');
      const chunks = [];
      let total = 0;
      while (total < MAX_BYTES) { // read at most ~1.5 MB
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value); total += value.length;
      }
      await reader.cancel().catch(() => {});
      return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_BYTES)); // a single huge chunk is cut too
    }
    throw new Error('That link redirected too many times.');
  };
}
