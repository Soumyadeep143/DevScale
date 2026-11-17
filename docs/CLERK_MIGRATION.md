# Moving authentication to Clerk

Only authentication changes. Jobs, leads, contacts, notes, LeetCode, peers and sharing keep their tables and rules.
**Nothing has been applied to your project yet**: the code is ready, the database migration and the Clerk/Supabase settings are steps for you (the migration is unrun against a real database; test it on a branch first).

## How it works
- Clerk shows the sign-in / sign-up screens, sends its own verification and reset emails, and issues a session token.
- The app sends that token to Supabase on every request (`client/src/lib/supabase.js`). Supabase trusts it through its third-party-auth integration.
- The database maps the token's Clerk user id to the app's existing uuid user id (`public.clerk_identities`). All row-level security and sharing functions use `public.requesting_user_id()` instead of `auth.uid()`.
- On every sign-in the app calls `ensure_identity()`: it creates the profile for a new user, or links a migrated user to their existing data.
- Because Clerk sends the emails, **the SMTP/Resend setup from the sign-up problem is no longer needed for sign-up and reset.**

## Setup order (do these in order)
1. **Clerk dashboard**
   1. Create an application (email + password; require verified email).
   2. API keys → copy the **publishable** key.
   3. Integrations → **Supabase** → Activate. This adds the `role: authenticated` claim Supabase needs and shows your Clerk domain.
   4. Sessions → **Customize session token** → set: `{"external_id": "{{user.external_id}}"}` (so migrated users can be linked to their data).
2. **Supabase dashboard**: Authentication → Sign In / Providers → **Third-Party Auth** → Add provider → Clerk → paste the Clerk domain from step 1.3.
3. **Local app**: add to `client/.env.local`: `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`. Restart `npm run dev`. (The Clerk secret key is never used in the browser.)
4. **Database (on a branch or copy first)**: apply `supabase/migrations/20261116000700_clerk_auth.sql`, then run `supabase test db` (new test: `090_clerk_identity.test.sql`). The migration aborts and rolls back if any `auth.uid()` remains. It fails loudly (and changes nothing) if some row's owner has no profile.
5. **Existing users** (you said there is real data): run `client/scripts/import-users-to-clerk.mjs` (instructions at the top of the file): dry run first, then `--apply`. Do this before those people sign in with Clerk. Passwords carry over.
6. **Edge function**: redeploy `ai` (`supabase functions deploy ai`). It no longer calls Supabase Auth.
7. **Production**: set `VITE_CLERK_PUBLISHABLE_KEY` in the host's build settings; add your production URL to Clerk's allowed origins.
8. After everyone has moved: turn off sign-ups in Supabase Auth (Authentication → Sign In / Providers) so nobody can create a legacy account.

## Behaviour to know about
- A user created in Clerk without an `external_id` gets a fresh, empty account (a new profile and peer code).
- A second Clerk user can't be linked to an already-linked account: they get "This account is already linked to another sign-in".
- The welcome email and "new sign-in" alert (Supabase-triggered) don't fire for Clerk users; Clerk has its own sign-in notifications. The `notify` function and triggers are left in place, unused.
- Old Supabase sessions keep working until they expire, because a uuid-shaped token subject still resolves to that user.
- `client/scripts/e2e-auth.mjs` tests Supabase Auth and no longer reflects the app.
- Deleting a user in Clerk does not delete their data; remove their `profiles` row to cascade-delete it.

## What changed in the code
`lib/supabase.js` (token supplier), `main.jsx` (ClerkProvider), `context/JobsContext.jsx` (session from Clerk, identity setup), `components/AuthScreen.jsx` (Clerk forms), `components/MissingConfig.jsx`, `lib/clerkAppearance.js`, `lib/api.js` (`ensureIdentity`), `App.jsx` (no recovery screen). Removed: `lib/auth.js`, `ResetPassword`, `PasswordField`, `authStyles` and their tests.
