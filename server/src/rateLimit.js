// A simple per-person limit (a sliding window kept in memory) so one account cannot burn through the
// AI credits. It resets when the server restarts, which is fine for this purpose.
export function makeRateLimiter({ limit = 20, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map();
  return function allow(key) {
    const t = now();
    const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k); // tidy up
    return true;
  };
}
