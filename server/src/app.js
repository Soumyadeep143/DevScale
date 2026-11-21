import cors from 'cors';
import express from 'express';
import { extractJobs } from '../../supabase/functions/ai/parseJobs.ts';
import { extractContacts } from '../../supabase/functions/ai/parseContacts.ts';
import { bearer } from './auth.js';
import { makeRateLimiter } from './rateLimit.js';

const MAX_TEXT = 60_000;

// All the pieces (sign-in check, AI call, page reader) are passed in, so the same app runs for real
// and in tests with fakes.
export function createApp({ config, verify, callModel, callChat, fetchPage, limiter }) {
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

  // The job-search assistant. The browser sends the question, recent chat and the person's own jobs
  // (already loaded under their sign-in); nothing is stored here.
  app.post('/api/ask', async (req, res) => {
    const token = bearer(req.headers.authorization);
    let user;
    try { if (!token) throw new Error('no token'); user = await verify(token); }
    catch { return res.status(401).json({ ok: false, error: 'Please sign in again.' }); }
    if (!allow(user.sub)) return res.status(429).json({ ok: false, error: 'Too many requests. Wait a minute and try again.' });
    if (!callChat) return res.status(501).json({ ok: false, error: 'The assistant is not enabled on this server.' });

    const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
    if (!question) return res.status(400).json({ ok: false, error: 'Ask a question first.' });
    const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs.slice(0, 400) : [];
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
    const clip = (v, n = 300) => String(v ?? '').replace(/\s+/g, ' ').slice(0, n);

    const counts = {};
    jobs.forEach((j) => { const k = clip(j?.status, 30) || 'unknown'; counts[k] = (counts[k] || 0) + 1; });
    const today = new Date().toISOString().slice(0, 10);
    const lines = jobs.map((j) => {
      const parts = [clip(j?.company, 100), clip(j?.role, 150), `stage: ${clip(j?.status, 30)}`];
      if (j?.dateApplied) parts.push(`applied ${clip(j.dateApplied, 10)}`);
      if (j?.interviewStatus) parts.push(`interview status: ${clip(j.interviewStatus, 60)}`);
      if (j?.notes) parts.push(`comment: ${clip(j.notes, 400)}`);
      return '- ' + parts.filter(Boolean).join(' | ');
    });
    const appliedToday = jobs.filter((j) => j?.dateApplied === today).length;
    const system =
      "You are a sharp, concise job-search assistant embedded in the user's job tracker app. " +
      "You can see their full pipeline below: every job's stage and their own notes/comments. " +
      'Answer naturally and specifically using this data (mention companies/roles by name when relevant). ' +
      "When asked where they're failing or what to improve, look for patterns across rejected/stalled jobs " +
      '(stage they keep dying at, missing follow-ups, recurring feedback in comments) rather than a generic answer. ' +
      'Keep answers tight: short paragraphs or bullet points, no markdown headers. ' +
      "If asked something the data can't answer, say so plainly rather than guessing.\n\n" +
      `Today's date: ${today}\nApplied today: ${appliedToday}\nCounts by stage: ${JSON.stringify(counts)}\n\nJobs:\n${lines.join('\n')}`;
    const messages = [{ role: 'system', content: system }];
    history.forEach((m) => messages.push({ role: m?.role === 'user' ? 'user' : 'assistant', content: clip(m?.text, 4000) }));
    messages.push({ role: 'user', content: question.slice(0, 2000) });

    try {
      return res.json({ ok: true, answer: await callChat(messages) });
    } catch (e) {
      const status = [429, 502].includes(e?.status) ? e.status : 400;
      return res.status(status).json({ ok: false, error: e instanceof Error ? e.message : 'The assistant could not answer.' });
    }
  });

  // malformed JSON bodies and anything unexpected: a clean message, never a stack trace
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'That is too much text at once.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'That request was not valid.' });
    return res.status(500).json({ ok: false, error: 'Something went wrong on the server.' });
  });
  return app;
}
