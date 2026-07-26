const KEY = 'jobtracker.config';

// This is a personal single-user tool — the connection is baked in via build-time
// env vars (VITE_APPS_SCRIPT_URL / VITE_APPS_SCRIPT_TOKEN, set in .env.local for
// dev and in the Vercel project settings for prod) so the app just opens and
// works, no setup step. The tradeoff: this URL/token still ship in the built JS
// bundle, readable by anyone who inspects devtools — env vars only keep them out
// of the source/git history, not out of the deployed site. Fine for now; swap
// for real per-user auth if this ever needs to scale beyond one person.
const DEFAULT_CONFIG = {
  url: import.meta.env.VITE_APPS_SCRIPT_URL || '',
  token: import.meta.env.VITE_APPS_SCRIPT_TOKEN || '',
};

export function getConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.url && parsed.token) return parsed;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_CONFIG.url && DEFAULT_CONFIG.token ? DEFAULT_CONFIG : null;
}

export function setConfig({ url, token }) {
  localStorage.setItem(KEY, JSON.stringify({ url: url.trim(), token: token.trim() }));
}

export function clearConfig() {
  localStorage.removeItem(KEY);
}
