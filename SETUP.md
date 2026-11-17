# DevScale — Setup (Supabase)

Data lives in Supabase Postgres, protected by Row Level Security. The browser talks to
Supabase directly (anon key + your login). The AI assistant runs in a Supabase Edge
Function so the Groq key never reaches the browser.

## 1. Create the project and schema
1. Create a project at [supabase.com](https://supabase.com).
2. Apply every file in [`supabase/migrations/`](supabase/migrations/) in filename order
   (SQL Editor, `supabase db push`, or the Supabase MCP). Together they create `jobs`, `leads`, `notes`,
   `leetcode_problems`, `profiles` (peer codes), `peer_connections` and `contacts`, all with RLS, plus the
   functions listed in [docs/api.md](docs/api.md).
3. **Authentication.** People create their own account on the sign-in screen (**Create an account**). In the
   Supabase dashboard:
   - **Authentication → Sign In / Providers → Email:** keep "Allow new users to sign up" **on** and
     "Confirm email" **on**. Set the minimum password length to 8 or more, and turn on leaked-password protection.
   - **Authentication → URL Configuration:** set **Site URL** to your production URL, and add every address the app
     is served from to **Redirect URLs** (for example `http://localhost:5173/**`, `http://127.0.0.1:5173/**`
     and `https://your-app.vercel.app/**`). Confirmation and reset links only work for listed addresses.
   - Supabase's built-in email sender is limited to a few emails per hour. For real use, add your own SMTP account
     under **Authentication → SMTP Settings** (see [Emails](#9-emails)).
   Every account automatically gets a unique peer code (visible on the Peers tab). You can still add a user
   yourself under Authentication → Users → Add user.

## 2. Frontend env
Copy `client/.env.example` to `client/.env.local` and fill in the Project URL and the **anon** key
(Project Settings → API). Never put the `service_role` key in a `VITE_*` variable.
Set the same two variables in Vercel.

## 3. AI assistant (Edge Function)
```
supabase link --project-ref <ref>
supabase secrets set GROQ_API_KEY=<your groq key>
supabase functions deploy ai
```

## 4. Import existing Google Sheets data (one time)
While the old Apps Script is still deployed:
```
cd client
APPS_SCRIPT_URL=... APPS_SCRIPT_TOKEN=... SUPABASE_URL=... \
SUPABASE_SERVICE_KEY=... IMPORT_USER_ID=<your auth user uuid> \
node scripts/import-from-sheets.mjs --dry-run   # then again without --dry-run
```

## 5. External lead scrapers
Insert into `public.leads` using the service-role key and set `user_id` explicitly.
Leads with `applied = false` show up in the app's Lead column.

## 6. Peers, sharing and contacts
- **Peers tab:** share your peer code, or enter someone else's, to connect. Only *accepted* peers can see anything
  you mark **Peer**; removing a peer, or switching a lead/contact back to **Personal**, revokes access immediately.
- **Leads:** each lead is Personal (default) or Peer. Peers can view a shared lead and import it as their *own* copy
  (their own status and history). Application statuses are never shared.
- **Contacts:** same Personal/Peer model. Peers see name, email, phone, company, designation and LinkedIn — not your
  notes — and can save a copy but never edit or delete yours.
- All access rules live in the database (RLS + `SECURITY DEFINER` functions), not in the UI. See [docs/api.md](docs/api.md).

## 7. Abuse protection for open sign-up
Anyone can register, so also set these in the Supabase dashboard (the app's own limits on peer requests are already in the database):
- **Authentication → Attack Protection:** enable **CAPTCHA** (Turnstile or hCaptcha) and **leaked-password protection**. CAPTCHA also needs a small frontend change that is not built yet.
- **Authentication → Sign In / Providers → Email:** minimum password length 8 or more.
- **Authentication → Rate Limits:** review the sign-up and email limits (they are per IP).

## 8. Tests
```
cd client
npm test                 # frontend (Vitest)
npm run lint && npm run build
supabase test db         # pgTAP database tests in supabase/tests/database (needs the Supabase CLI + Docker)

# Live end-to-end checks. They create throwaway users and delete them afterwards; the auth one sends no email.
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... node scripts/e2e-sharing.mjs
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... node scripts/e2e-auth.mjs
```
The service key is only for the end-to-end script and scrapers. Never commit it or put it in a `VITE_*` variable.

## 9. Emails
Two separate things send mail:

**A. Confirmation and password-reset emails — sent by Supabase Auth through your SMTP account.**
1. Pick a provider that gives you SMTP credentials. **Brevo** works without owning a domain (verify a single
   sender address); **Resend** needs a verified domain; **Gmail** works with an app password but has low limits
   and sends "from" your Gmail address.
2. Dashboard → **Authentication → SMTP Settings**: enable custom SMTP and enter the host, port (465 or 587),
   username, password and the sender name/address. Supabase's built-in sender is capped at **2 emails per hour**
   for the whole project, and custom SMTP starts at **30 per hour** (raise it under Authentication → Rate Limits).
3. Dashboard → **Authentication → Email Templates**: paste [`supabase/templates/confirmation.html`](supabase/templates/confirmation.html)
   into *Confirm signup* and [`supabase/templates/recovery.html`](supabase/templates/recovery.html) into *Reset password*
   (subjects: "Confirm your DevScale account" / "Reset your DevScale password").

**B. Welcome email and new-sign-in alert — sent by the `notify` Edge Function.** These go through your provider's
**web API** (not SMTP), because outbound SMTP from Edge Functions is not guaranteed by Supabase. Supported: `resend`, `brevo`.
1. Generate a long random string for `NOTIFY_SECRET` (for example `openssl rand -hex 32`).
2. Deploy and configure the function (needs the Supabase CLI):
   ```
   supabase secrets set NOTIFY_SECRET=<the random string> EMAIL_PROVIDER=brevo EMAIL_API_KEY=<provider API key> \
     EMAIL_FROM="DevScale <hello@yourdomain.com>" APP_URL=https://your-app.vercel.app
   supabase functions deploy notify --no-verify-jwt
   ```
3. Apply the migration [`20261116000600_notifications.sql`](supabase/migrations/20261116000600_notifications.sql). It installs
   `pg_net` and the triggers, and **does nothing until step 4**.
4. In the SQL Editor, store the two secrets the triggers use (same random string as `NOTIFY_SECRET`):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify', 'notify_url');
   select vault.create_secret('<the random string>', 'notify_secret');
   ```
- A user gets one welcome email, sent when their email is confirmed. A sign-in alert is sent on a new sign-in, at most
  once per 30 minutes, and not during the first 5 minutes of a new account. To turn emails off, delete the two Vault secrets.
- Emails to reserved test domains (`example.com`, `*.test`, `*.invalid`, `localhost`) are skipped.
- Email problems never block signing up or signing in: each trigger catches its own errors.
