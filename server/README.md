# DevScale AI server

A small Node server that reads pasted job text (or a link) with an AI model and returns it in your fixed
12-column schema. It exists so that:

- the AI key stays on the server, never in the browser;
- the browser can call it without CORS errors: it answers **only** the addresses in `ALLOWED_ORIGINS`;
- only signed-in DevScale users can use it (their Clerk session token is checked against Clerk's public
  keys, so no Clerk secret is needed), with a per-person rate limit.

## Run it

```bash
cd server
cp .env.example .env     # then edit .env: put your NEW Groq key in GROQ_API_KEY
npm install
npm start                # http://localhost:8787   (npm run dev restarts on changes)
```

Then tell the app where it is, in `client/.env.local`, and restart `npm run dev`:

```
VITE_AI_SERVER_URL=http://localhost:8787
```

Check it: <http://localhost:8787/health> should show `{"ok":true}`.

## Settings (`server/.env`)

| Variable | What it is |
|---|---|
| `GROQ_API_KEY` | The AI provider key. Server only; never put it in the client. |
| `CLERK_PUBLISHABLE_KEY` | Your Clerk publishable key (public). Tells the server which sign-ins to trust. |
| `ALLOWED_ORIGINS` | Browser addresses allowed to call it, comma-separated. Add your production site. |
| `PORT` | Default 8787. |
| `GROQ_MODEL` | Default `openai/gpt-oss-120b`. Groq retires models; list current ones at `https://api.groq.com/openai/v1/models`. |
| `GROQ_BASE_URL` | Default Groq. For xAI Grok use `https://api.x.ai/v1` plus a model from docs.x.ai. |
| `RATE_LIMIT_PER_MINUTE` | Default 20 per person. |

## What it does

`POST /api/parse-jobs` with `Authorization: Bearer <Clerk session token>` and `{ "text": "..." }`.
Reads the text, or opens it if it is just a link (public pages only; see below), and returns
`{ ok: true, records: [...], truncated, notices }`. Each record has the 12 columns
(Company, Recruitment Email, Job Title, Experience, Location, Posted Time, LinkedIn URL, Careers URL,
Email Source URL, Applied, (unused), Posted Timestamp). The app turns them into jobs for review, and can
copy them as tab-separated text for Google Sheets. Nothing is saved by the server.

The extraction rules (never guess an email, keep URLs whole, "Applied" only when stated, ...) live in
`supabase/functions/ai/parseJobs.ts`, shared with the Supabase function and the app, and everything the
model returns is re-checked before it is used.

## Link reading is locked down

The server fetches the page from its own network, so it refuses: anything but http(s) on ports 80/443,
addresses with credentials, `localhost`/internal names, private or link-local addresses (checked on the name
**and** on everything it resolves to, again at every redirect), more than 3 redirects, pages over ~1.5 MB,
and anything slower than 8 seconds.

## Deploying

Any host that runs Node 22.18+ works (Render, Railway, Fly.io, a VPS). Set the same variables there,
set `ALLOWED_ORIGINS` to your site's address, and set `VITE_AI_SERVER_URL` to the server's public
address when you build the app.

## Tests

`npm test` (Node's built-in runner, no extra packages).
