// DevScale AI gateway (replaces askGroq_ / analyzeRejection_ in the old Code.gs).
// Deployed with verify_jwt = true: only a signed-in user can call it, and all
// data reads go through that user's JWT so RLS scopes them to their own rows.
// Secret needed:  supabase secrets set GROQ_API_KEY=...
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractJobs, isBlockedHost, isPrivateIp } from './parseJobs.ts';
import { extractContacts } from './parseContacts.ts';

// Groq retires models over time (the previous default, llama-3.3-70b-versatile, is gone). Override without a
// redeploy of code: supabase secrets set GROQ_MODEL=<id>. Current options: GET https://api.groq.com/openai/v1/models
const GROQ_MODEL = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';
const STAGES = ['lead', 'applied', 'interviewing', 'offer', 'rejected'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function groq(messages: unknown[], maxTokens: number, opts: { json?: boolean; temperature?: number } = {}) {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('No Groq API key set. Run: supabase secrets set GROQ_API_KEY=...');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL, messages, temperature: opts.temperature ?? 0.4, max_tokens: maxTokens,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      // gpt-oss models think before answering, and that thinking counts against max_tokens: keep it short
      // so the visible answer is never cut off.
      ...(GROQ_MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
    }),
  });
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('Groq returned an unreadable response.');
  if (!res.ok) throw new Error(data.error?.message || `Groq request failed (${res.status})`);
  return data.choices?.[0]?.message?.content || 'No response from Groq.';
}

// Opens a public web page for the "paste a link" case. The request comes from inside Supabase's network,
// so it is locked down: http(s) only, ports 80/443 only, no private or internal addresses (checked on the
// name AND on what it resolves to, at every redirect), a few redirects at most, a time limit and a size cap.
async function fetchPage(rawUrl: string): Promise<string> {
  let url = rawUrl;
  for (let hop = 0; hop <= 3; hop++) {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || (u.port && u.port !== '80' && u.port !== '443') || u.username || u.password) throw new Error('That link can’t be opened.');
    if (isBlockedHost(u.hostname)) throw new Error('That link can’t be opened.');
    try { // also refuse names that point at private addresses
      const ips = await Deno.resolveDns(u.hostname, 'A');
      if (ips.some(isPrivateIp)) throw new Error('That link can’t be opened.');
    } catch (e) { if (e instanceof Error && e.message === 'That link can’t be opened.') throw e; }
    const res = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DevScaleBot/1.0)', Accept: 'text/html,application/xhtml+xml' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location')!, url).toString(); continue; }
    if (!res.ok) throw new Error(`The site didn’t let me open that link (HTTP ${res.status}). Paste the job text instead.`);
    if (!/text\/html|application\/xhtml/i.test(res.headers.get('content-type') || '')) throw new Error('That link isn’t a web page.');
    const reader = res.body?.getReader();
    if (!reader) throw new Error('That page was empty.');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < 1_500_000) { // read at most ~1.5 MB
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value); total += value.length;
    }
    await reader.cancel().catch(() => {});
    return new TextDecoder().decode(new Uint8Array(await new Blob(chunks).arrayBuffer()).subarray(0, 1_500_000)); // a single huge chunk is cut too
  }
  throw new Error('That link redirected too many times.');
}

function jobsContext(jobs: any[]) {
  const counts: Record<string, number> = Object.fromEntries(STAGES.map((s) => [s, 0]));
  jobs.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
  const today = new Date().toISOString().slice(0, 10);
  const appliedToday = jobs.filter((j) => j.date_applied === today).length;
  const lines = jobs.slice(0, 400).map((j) => {
    const parts = [j.company, j.role, `stage: ${j.status}`];
    if (j.date_applied) parts.push(`applied ${j.date_applied}`);
    if (j.interview_status) parts.push(`interview status: ${j.interview_status}`);
    if (j.notes) parts.push(`comment: ${j.notes}`);
    return '- ' + parts.filter(Boolean).join(' | ');
  });
  return `Today's date: ${today}\nApplied today: ${appliedToday}\nCounts by stage: ${JSON.stringify(counts)}\n\nJobs (most recent first):\n${lines.join('\n')}`;
}

function notesContext(notes: any[]) {
  if (!notes.length) return '';
  const lines = notes.slice(0, 100).map((n) => {
    const stamp = String(n.updated_at || n.created_at || '').slice(0, 10);
    return `- [${stamp}] ${String(n.content || '').replace(/\s+/g, ' ').slice(0, 500)}`;
  });
  return `\n\nGeneral strategy notes, not tied to a specific job (most recent first):\n${lines.join('\n')}`;
}

// The `sub` claim of an already-verified bearer token ('' if absent or malformed).
function subjectOf(authHeader: string): string {
  try {
    const part = authHeader.replace(/^Bearer\s+/i, '').split('.')[1];
    if (!part) return '';
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const sub = JSON.parse(json).sub;
    return typeof sub === 'string' ? sub : '';
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    // Sign-in is Clerk's. The platform gateway (verify_jwt = true) has already checked the token's
    // signature through Supabase's third-party-auth integration; here we only require that it names a user.
    if (!subjectOf(authHeader)) return json({ ok: false, error: 'Not signed in' }, 401);

    const { action, payload = {} } = await req.json();

    if (action === 'askAI') {
      const question = payload.question || 'Give me a quick summary of my job search.';
      const [{ data: jobs, error: e1 }, { data: leads }, { data: notes }] = await Promise.all([
        supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(400),
        supabase.from('leads').select('company, role, created_at').eq('applied', false).limit(100),
        supabase.from('notes').select('content, created_at, updated_at').order('updated_at', { ascending: false }).limit(100),
      ]);
      if (e1) throw e1;
      const all = [
        ...(jobs ?? []),
        ...(leads ?? []).map((l) => ({ company: l.company, role: l.role, status: 'lead' })),
      ];
      const system =
        "You are a sharp, concise job-search assistant embedded in the user's job tracker app. " +
        "You can see their full pipeline below — every job's stage and their own notes/comments — plus their " +
        'general job-search strategy notes. ' +
        'Answer naturally and specifically using this data (mention companies/roles by name when relevant). ' +
        "When asked where they're failing or what to improve, look for patterns across rejected/stalled jobs " +
        '(stage they keep dying at, missing follow-ups, recurring feedback in comments) rather than a generic answer. ' +
        'Keep answers tight: short paragraphs or bullet points, no markdown headers. ' +
        "If asked something the data can't answer, say so plainly rather than guessing.\n\n" +
        jobsContext(all) + notesContext(notes ?? []);
      const messages: unknown[] = [{ role: 'system', content: system }];
      (payload.history ?? []).slice(-12).forEach((m: any) =>
        messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: String(m.text ?? '') }));
      messages.push({ role: 'user', content: String(question) });
      return json({ ok: true, answer: await groq(messages, 1600) });
    }

    if (action === 'analyzeJob') {
      const job = payload;
      const prompt =
        'A job application has the details below. The notes may contain a pasted rejection email or recruiter message.\n\n' +
        `Company: ${job.company || 'Unknown'}\nRole: ${job.role || 'Unknown'}\nCurrent stage: ${job.status || 'unknown'}\n` +
        `Notes / pasted message:\n${job.notes || '(none)'}\n\n` +
        'In 4-6 sentences: (1) state the most likely reason for this outcome based on the text — quote or ' +
        "paraphrase the specific line that suggests it if there is one, or say plainly if it's not stated; " +
        '(2) give one concrete, specific next step this candidate should take. Be direct and practical. ' +
        'No headers, no markdown, no filler.';
      const analysis = await groq([
        { role: 'system', content: 'You are a direct, specific job-search coach. No pleasantries, no hedging beyond what the evidence supports.' },
        { role: 'user', content: prompt },
      ], 1000);
      return json({ ok: true, analysis });
    }

    if (action === 'parseJobs') {
      // Free text (or a link) in, job records in the 12-column schema out. Nothing is saved here: the app
      // shows the result for review. The steps and rules live in parseJobs.ts, shared with the Node server.
      try {
        const out = await extractJobs(String(payload.text ?? ''), {
          callModel: (system, user) => groq([{ role: 'system', content: system }, { role: 'user', content: user }], 4000, { json: true, temperature: 0 }),
          fetchPage,
        });
        return json({ ok: true, ...out });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : 'Could not read that.' });
      }
    }

    if (action === 'parseContacts') {
      try {
        const out = await extractContacts(String(payload.text ?? ''), {
          callModel: (system, user) => groq([{ role: 'system', content: system }, { role: 'user', content: user }], 4000, { json: true, temperature: 0 }),
        });
        return json({ ok: true, ...out });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : 'Could not read that.' });
      }
    }

    return json({ ok: false, error: 'Unknown action' }, 400);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
  }
});
