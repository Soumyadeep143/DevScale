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

## 5. Run the app locally

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

## 6. Deploy to Vercel (access from anywhere, not just your Wi-Fi)

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

## 7. Import your existing applications (optional, one-time)

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
  visible, and refreshes immediately the moment you switch back to it. Type a
  new row by hand, or edit a `status`/`notes` cell directly — it'll show up
  in the app within a few seconds, and gets a proper `id` assigned
  automatically the next time it's read.

## Redeploying after you edit Code.gs

If you ever change `apps-script/Code.gs`, paste the new version into the
Apps Script editor, then **Deploy → Manage deployments → edit (pencil) →
New version → Deploy**. The URL stays the same.
