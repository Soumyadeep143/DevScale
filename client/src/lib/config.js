const KEY = 'jobtracker.config';

// This is a personal single-user tool — the connection is baked in so the
// app just opens and works, no setup step. The tradeoff: this URL/token
// ship in the public JS bundle, readable by anyone who inspects devtools.
// Fine for now; swap for real per-user auth if this ever needs to scale
// beyond one person.
const DEFAULT_CONFIG = {
  url: 'https://script.google.com/macros/s/AKfycbxQ7ljZplib8C3BKVv04URTAUBEwYiGqO_WtUgp5aP9_JEvLR-ckpEKpewJ0kjr_lBP/exec',
  token: '53MaZ1Z3Y8RmzXK9Nyk9iB45',
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
  return DEFAULT_CONFIG;
}

export function setConfig({ url, token }) {
  localStorage.setItem(KEY, JSON.stringify({ url: url.trim(), token: token.trim() }));
}

export function clearConfig() {
  localStorage.removeItem(KEY);
}
