// Reads settings from environment variables (see .env.example). Nothing secret lives in the code.
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

// "pk_test_ZGl2aW5l...$" is the Clerk publishable key; after the prefix it is the base64 of the
// Clerk sign-in domain, which is also the issuer of the session tokens.
export function issuerFromPublishableKey(key) {
  const m = /^pk_(?:test|live)_(.+)$/.exec(String(key || '').trim());
  if (!m) return '';
  try {
    const domain = Buffer.from(m[1], 'base64').toString('utf8').replace(/\$$/, '').trim();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? `https://${domain}` : '';
  } catch { return ''; }
}

export function readConfig(env = process.env) {
  const origins = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return {
    port: Number(env.PORT) || 8787,
    groqKey: env.GROQ_API_KEY || '',
    groqBase: (env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    model: env.GROQ_MODEL || 'openai/gpt-oss-120b',
    origins: origins.length ? origins : DEFAULT_ORIGINS,
    issuer: (env.CLERK_ISSUER || issuerFromPublishableKey(env.CLERK_PUBLISHABLE_KEY)).replace(/\/$/, ''),
    ratePerMinute: Number(env.RATE_LIMIT_PER_MINUTE) || 20,
  };
}

export function missingSettings(config) {
  const problems = [];
  if (!config.groqKey) problems.push('GROQ_API_KEY is not set.');
  if (!config.issuer) problems.push('Set CLERK_PUBLISHABLE_KEY (or CLERK_ISSUER) so sign-ins can be checked.');
  return problems;
}
