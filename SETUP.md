# Job Tracker — Setup

Your job data lives in a Google Sheet. This app talks to it through a small
script that Google hosts for free (Google Apps Script). No database, no
hosting bill, no separate backend to maintain. Editing the sheet by hand and
using the app are fully two-way — either one updates the other.

## 1. Create the sheet

Use either of your existing spreadsheets, or create a new blank one at
sheets.google.com. You don't need to create the "Jobs" tab yourself — the
script creates it automatically the first time it runs.

## 2. Add the script

1. In your Google Sheet, click **Extensions → Apps Script**.
2. Delete anything in the editor (`Code.gs`) and paste the entire contents of
   [`apps-script/Code.gs`](apps-script/Code.gs) from this project.
3. A `SECRET_TOKEN` constant is already filled in near the top of the file.
   Change it to any random string of your own — just make sure it matches
   what you enter in the app later (and never commit your real value).
4. Click **Save** (Ctrl+S).

## 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Fill in:
   - Description: `Job Tracker API`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**.
5. Google will ask you to authorize the script — click **Authorize access**,
   pick your account, click **Advanced → Go to Job Tracker (unsafe)** (this
   warning appears because it's your own unpublished script, not because
   anything is actually unsafe), then **Allow**.
6. Copy the **Web app URL** it gives you — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

Keep this URL and the token — you'll paste both into the app's Setup screen
the first time you open it.

## 4. (Optional) Turn on the AI assistant

The assistant is powered by [Groq](https://console.groq.com) — fast, and has
a generous free tier. The key lives only in Apps Script's server-side
storage, never in the browser.

1. Go to [console.groq.com/keys](https://console.groq.com/keys), sign in,
   create an API key, copy it.
2. Back in the Apps Script editor: **Project Settings** (gear icon, left
   sidebar) → scroll to **Script Properties** → **Add script property**.
   - Property: `GROQ_API_KEY`
   - Value: the key you copied
3. Save. No redeploy needed — script properties are read live.

Skip this step if you don't want the assistant; the rest of the app works
fine without it.

## 5. (Optional) Turn on Notes + the Supabase mirror

Two extra features are backed by [Supabase](https://supabase.com) (a free hosted
Postgres database): the standalone **Notes** tab (general strategy notes, not
tied to one job), and a live mirror of your jobs in a real database — useful
if you ever want to query or build on top of your data outside Google Sheets.
Google Sheets stays the single source of truth either way; Supabase is only
ever written *to*, never read *from* by the sheet or the app's own display.

1. Go to [supabase.com](https://supabase.com), sign in, and create a new
   project (the free tier is plenty).
2. Open the **SQL Editor** and run:
   ```sql
   create table notes (
     id uuid primary key default gen_random_uuid(),
     content text not null,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   alter table notes enable row level security;

   create table jobs (
     id text primary key,
     company text,
     role text,
     status text,
     date_applied text,
     interview_status text,
     contact text,
     source text,
     location text,
     experience text,
     posted_time text,
     notes text,
     created_at text,
     updated_at text,
     synced_at timestamptz
   );
   alter table jobs enable row level security;
   ```
   Enabling row-level security with no policies means the tables are locked
   down from the public `anon` key entirely — only the `service_role` key
   (server-side only, see next step) can read or write them.
3. In your Supabase project: **Project Settings → API**. Copy the **Project
   URL** and the **`service_role`** secret key (not the `anon` key — the
   `anon` key is meant to be public-safe, `service_role` is the one that
   bypasses row-level security and must stay private).
4. Back in the Apps Script editor: **Project Settings** → **Script
   Properties** → **Add script property**, twice:
   - `SUPABASE_URL` → your Project URL
   - `SUPABASE_SERVICE_KEY` → the `service_role` key
5. Save. No redeploy needed. Notes now works, and every add/edit/delete/import
   made through the website mirrors into the `jobs` table automatically.
6. *(Optional, for hand-typed sheet edits to reach Supabase quickly too)*: in
   the Apps Script editor, click the **Triggers** icon (clock, left sidebar)
   → **Add Trigger** → choose function `onTrackerEdit` → event source **From
   spreadsheet** → event type **On edit** → **Save**. Without this, a manual
   edit typed straight into the sheet still shows up correctly on the website
   (via its normal polling) — it just won't reach the Supabase mirror until
   the next time you add, edit, delete, or import something from the website.

Skip this whole section if you don't want Notes or the Supabase mirror — the
rest of the app works fine without it; the Notes tab will just show a message
explaining it isn't set up.

## 6. Run the app locally

```
cd client
npm run dev -- --host
```

- On your laptop, open the `Local` URL it prints (e.g. `http://localhost:5173`).
- On your phone (same Wi-Fi as your laptop), open the `Network` URL it prints
  (e.g. `http://192.168.1.23:5173`).

The first time you open it, paste in the Web App URL and token from step 3.
They're saved in the browser (localStorage), so you only do this once per
device/browser.

## 7. Deploy to Vercel (access from anywhere, not just your Wi-Fi)

The app is a static site — it talks straight to Google from the browser, so
there's nothing to host except static files. Vercel's free tier is plenty.

```
npm install -g vercel     # one-time
vercel login              # opens a browser to sign in — do this yourself
cd client
vercel --prod              # deploys client/ as-is, no server needed
```

Answer the first-run prompts (link to a new project is fine, defaults work —
Vercel auto-detects Vite). You'll get a permanent `https://your-app.vercel.app`
URL that works from any device, on or off your home Wi-Fi. Re-run
`vercel --prod` from `client/` any time you want to push updates.

The Setup screen (URL + token) is entered per-browser, so open the Vercel URL
on your phone once and connect it there too.

## 8. Import your existing applications (optional, one-time)

Open your old spreadsheet, select your data rows (not the header), copy
(Ctrl+C), then in Job Tracker go to **Import** and paste. It auto-detects
which of your two old sheet formats you're pasting from:

- `Company | Role | Date Applied | Status | Interview Status | Job Link/Mail`
- `Company | Recruitment Email | Job Title | Experience | Location | Posted Time | LinkedIn Job URL | Careers Page URL | Email Source URL | Applied | ... | Posted Timestamp`

After that, everything — adding, editing, moving stages, deleting — happens
in the app and is written straight back to your Google Sheet. You never need
to open Sheets manually again, but the data is always sitting there in plain
rows if you ever want to look, and the **Notes** field on each job doubles as
a free-text comment column — edit it in the app or type straight into the
sheet's `notes` column. The AI assistant reads it too.

## Two-way sync, in plain terms

- App → Sheet: instant. Every add/edit/delete/move writes straight to the row.
- Sheet → App: the app polls every 10 seconds while the tab is open and
  visible (backing off to every 30 seconds if the tracker starts reporting
  errors, e.g. under heavy concurrent use), and refreshes immediately the
  moment you switch back to it. Type a new row by hand, or edit a
  `status`/`notes` cell directly — it'll show up in the app within a few
  seconds, and gets a proper `id` assigned automatically the next time it's
  read.
- App/Sheet → Supabase: if you completed step 5, every add/edit/delete/import
  made through the website also mirrors into Supabase's `jobs` table right
  after the sheet write. A manual sheet edit reaches Supabase immediately too
  if you installed the `onTrackerEdit` trigger, or on the next website-driven
  change otherwise. Supabase never writes back to the sheet or the app — it's
  a one-way mirror, which is what keeps this safe from sync loops.

## Redeploying after you edit Code.gs

If you ever change `apps-script/Code.gs`, paste the new version into the
Apps Script editor, then **Deploy → Manage deployments → edit (pencil) →
New version → Deploy**. The URL stays the same.
