import cors from 'cors';
import express from 'express';
import { extractJobs } from '../../supabase/functions/ai/parseJobs.ts';
import { extractContacts } from '../../supabase/functions/ai/parseContacts.ts';
import { bearer } from './auth.js';
import { makeRateLimiter } from './rateLimit.js';

const MAX_TEXT = 60_000;

// All the pieces (sign-in check, AI call, page reader) are passed in, so the same app runs for real
// and in tests with fakes.
export function createApp({ config, verify, callModel, fetchPage, limiter }) {
  const allow = limiter || makeRateLimiter({ limit: config.ratePerMinute });
  const app = express();
  app.disable('x-powered-by');

  // CORS: only your app's addresses may call this from a browser. Anything else gets no CORS headers,
  // so the browser blocks it. (Tools like curl send no Origin; they still need a valid sign-in.)
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.origins.includes(origin)),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  }));
  app.use(express.json({ limit: '200kb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  const route = (run) => async (req, res) => {
    // 1. who is asking? (a valid Clerk session token)
    const token = bearer(req.headers.authorization);
    let user;
    try { if (!token) throw new Error('no token'); user = await verify(token); }
    catch { return res.status(401).json({ ok: false, error: 'Please sign in again.' }); }

    // 2. not too often
    if (!allow(user.sub)) return res.status(429).json({ ok: false, error: 'Too many requests. Wait a minute and try again.' });

    // 3. what was sent
    const text = req.body?.text;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ ok: false, error: 'Paste some text first.' });
    if (text.length > MAX_TEXT) return res.status(400).json({ ok: false, error: 'That is too much text at once. Paste fewer jobs.' });

    // 4. read it
    try {
      const out = await run(text);
      return res.json({ ok: true, ...out });
    } catch (e) {
      const status = [429, 502].includes(e?.status) ? e.status : 400;
      return res.status(status).json({ ok: false, error: e instanceof Error ? e.message : 'Could not read that.' });
    }
  };
  app.post('/api/parse-jobs', route((text) => extractJobs(text, { callModel, fetchPage })));
  app.post('/api/parse-contacts', route((text) => extractContacts(text, { callModel })));

  // malformed JSON bodies and anything unexpected: a clean message, never a stack trace
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'That is too much text at once.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'That request was not valid.' });
    return res.status(500).json({ ok: false, error: 'Something went wrong on the server.' });
  });
  return app;
}
