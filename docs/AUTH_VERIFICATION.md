> **Superseded 2026-11-16:** authentication moved to Clerk (see `CLERK_MIGRATION.md`). This report describes the Supabase Auth investigation; its SMTP findings no longer apply to sign-up. The probe script it mentions was removed.

# Authentication — end-to-end verification (2026-11-16)

Target: the Supabase project in `client/.env.local`. Method: live calls to the Auth API with the public anon key, code review, and the unit tests. No secret keys were available.

## Result in one line
Sign-up works at the API and database level for the address tested. **The reason a new user fails is not yet pinned down**, because the only deliverable address I could test is the project owner's. The checks below find it in minutes.

## What was verified
| Check | How | Result |
|---|---|---|
| Sign-ups enabled; email provider on; confirmation required | `GET /auth/v1/settings` | Pass |
| Server rejects weak passwords with no account or email | `POST /auth/v1/signup` with a 3-character password | Pass (422 `weak_password`) |
| Fake addresses are refused | sign-up to an `example.com` address | Refused (`email_address_invalid`): only deliverable domains work |
| A real sign-up creates the user and runs the profile trigger | one sign-up to a plus-address of the owner's email | Pass: HTTP 200, user created, `confirmation_sent_at` set. A failing `handle_new_user` trigger would have returned a database error here. |
| Auth unit tests (screens, error mapping, reset, session context) | `vitest` | 49 pass |
| Error mapping covers real server failures | new tests | Pass (extended, see Fixes) |

## What could not be verified
| Gap | Why |
|---|---|
| The confirmation email arrives and its link signs the user in | The Gmail connector needs re-authentication in this session. |
| Delivery to an address that is **not** a project team member | I won't send mail to strangers, and two further probes to the owner's address were blocked by this session's permissions. |
| Email send rate limit | Same. |
| Redirect after confirming (allowed redirect URLs / Site URL) | Needs the emailed link. |
| Password-reset email and the recovery screen against the live project | Needs a confirmed account and an inbox. |
| Sign-in, sign-out and persistence in a real browser | No browser session available. |
| Server-side checks in `client/scripts/e2e-auth.mjs` (unconfirmed sign-in, no enumeration, profile creation, RLS isolation) | Needs `SUPABASE_SERVICE_KEY`. |

## Likely causes of "new users cannot sign up", most likely first
1. **Email delivery.** The project may still use Supabase's built-in mail service: it only delivers to project team members and allows very few emails per hour. A stranger's sign-up then fails with `email_address_not_authorized`, `over_email_send_rate_limit` or "Error sending confirmation email". The app used to show all three as "Something went wrong". *Fix:* Dashboard → Authentication → SMTP Settings → add a real SMTP provider (the repo already sends mail through Resend for notifications).
2. **Redirect URLs.** The app sends the user back to `window.location.origin`. If that URL is not in Authentication → URL Configuration → Redirect URLs (and Site URL points elsewhere, e.g. localhost), the confirmation link lands on the wrong site and the user never gets in.
3. **Hosted settings differ from `supabase/config.toml`.** `config.toml` now says sign-ups on and confirmation on, and the live project agrees. Re-check after any change, because config.toml is not applied to a hosted project automatically.
4. **Migrations not applied** (profile trigger, hardening). Not the cause for the tested address: the trigger ran.

## Fixes made
- `client/src/lib/auth.js`: sign-up and sign-in now give distinct, actionable messages for undeliverable address, invalid address, email-send failure (5xx / `unexpected_failure`) and duplicate account. Unknown errors still show a generic line, and the code and status now go to the browser console for support reports.
- `client/src/lib/auth.test.js`: five new cases for those mappings.
- `client/scripts/probe-signup.mjs`: a diagnostic you can run yourself, including a real sign-up with an address you own.

## Run these now (about 10 minutes)
1. `cd client && node --env-file=.env.local scripts/probe-signup.mjs <an-address-that-is-NOT-a-team-member>`. It prints the exact failure and what to change.
2. In the dashboard open Authentication → SMTP Settings and URL Configuration and compare with section "Likely causes".
3. With the service key, run `SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_KEY=… node client/scripts/e2e-auth.mjs` for the server-side checks above.
4. In a browser: sign up with a fresh address, click the email link, confirm you land signed in on the dashboard; sign out; request a reset and complete it.

## Clean-up needed
One throwaway user was created in your project: display name "E2E Probe", an address of the form `devshare68+devscale-e2e-<number>@gmail.com`, unconfirmed. Delete it in Authentication → Users.
