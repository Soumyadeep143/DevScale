# DevScale API reference (Supabase)

There is no custom backend. The browser talks to Supabase (PostgREST + Auth) with the user's session; **all
authorization is enforced in Postgres** by Row Level Security and `SECURITY DEFINER` functions. Every function derives
the caller from `auth.uid()` — no user or owner id is ever accepted from the client — and is not executable by `anon`.

Errors use SQLSTATE codes: `28000` not authenticated · `P0002` not found (also returned for "exists but not yours",
so ids cannot be probed) · `22023` invalid argument · `23505` conflict.

## Tables (owner-only RLS: `user_id = auth.uid()`)
| Table | Purpose | Notes |
|---|---|---|
| `leads` | Postings not yet applied to | `visibility` `personal` (default) or `peer`; `description`, `job_url` (http/https only) |
| `jobs` | Tracked applications | One company+role per user. `source_lead_id` links an imported copy to the original (cleared if it is deleted). Never shared. |
| `contacts` | People you talk to | Required: name, email, phone_number, company_name. `visibility` personal/peer. |
| `notes`, `leetcode_problems` | Private to the user | Not shareable |
| `profiles` | `display_name`, permanent unique `peer_code` | A user can read only their own row and edit only `display_name` |
| `peer_connections` | One row per user pair; status `pending/accepted/rejected/removed` | Read-only for clients; changed only through the functions below |

## Peer functions
| Function | What it does |
|---|---|
| `my_peer_code()` → text | The caller's code (`PEER-XXXXXX`) |
| `connect_with_peer(p_code)` → connection | Sends a request. Case-insensitive. **An unknown code returns an empty row (all columns NULL), not an error** — the failed guess has to be recorded for the rate limit, and an error would roll that record back; the client shows "Invalid peer code". Errors: self, already connected, request already sent, and the limits below. If the other user had already requested you, this accepts. A rejected/removed pair starts over as a new pending request. |
| `respond_to_request(p_id, p_accept)` → connection | Receiver accepts or rejects a pending request |
| `remove_peer(p_id)` → void | Either side removes an accepted peer; the sender cancels a pending request |
| `list_peers()` → rows | Pending and accepted connections with the other user's display name and code, `direction` incoming/outgoing |

`are_peers(a, b)` is internal (not granted to clients).

### Limits (open sign-up protection)
Per user, enforced in `connect_with_peer` (SQLSTATE `54000`, message shown to the user):
| Limit | Value |
|---|---|
| Wrong peer codes | 10 per hour — the 11th attempt is refused **even with a correct code** |
| New requests | 20 per hour |
| Requests waiting at once | 10 (cancel one to free a slot) |
| Asking someone who declined | wait 24 hours (the person who declined may still reach out) |

Display names (`profiles.display_name`) are limited to 1–60 characters with no control characters; sign-up input is trimmed and cut to fit. Attempt logs live in the `private` schema, which clients cannot reach.

## Lead sharing
| Function | What it does |
|---|---|
| `shared_leads_with_me()` → rows | Peer-visible leads of accepted peers, with `owner_display_name` and `already_imported`. Never includes the owner's `applied` state. |
| `import_shared_lead(p_lead_id, p_status)` → `{table, row}` | Copies the lead into **your** data. `p_status` `lead` → a personal lead; `applied`/`interviewing`/`offer`/`rejected` → a tracked job. Dedups on company+role. Never changes the original. |
| `promote_lead(p_lead_id, p_status)` → job | Moves your own lead into `jobs` (existing behaviour; now also carries description and job URL). |

Change a lead's visibility with a plain update: `from('leads').update({ visibility }).eq('id', id)` (RLS lets only the owner).

## Contact sharing
| Function | What it does |
|---|---|
| `shared_contacts_with_me()` → rows | Peer-visible contacts of accepted peers with `owner_display_name`, `already_saved`. **Excludes the owner's notes.** |
| `duplicate_contact(p_id)` → contact | Copies it into your personal contacts (empty notes). If you already have that email, returns yours instead. |

Own contacts are managed with ordinary table calls (`insert/update/delete` on `contacts`); visibility is a plain update. Pasting many contacts is one multi-row `insert` — atomic, so a batch containing one invalid row adds nothing. Every row in a batch must carry the same columns (PostgREST fills a key missing from only some rows with `NULL`, not the column default); the client normalises this.

## Access matrix
| Action | Owner | Accepted peer | Other user |
|---|---|---|---|
| View personal lead/contact | yes | no | no |
| View peer lead/contact | yes | yes (via functions) | no |
| Edit / delete original | yes | no | no |
| Import / duplicate into own data | — | yes | no |
| Manage own application status | yes | own copy only | no |
| Manage own peer connections | yes | — | no |

Access is re-checked on every call, so removing a peer or switching to Personal takes effect immediately.
Records an importer already copied stay with the importer.

## Scrapers
External scrapers insert into `leads` with the service-role key and must set `user_id`. `visibility` defaults to
`personal`; set `visibility: 'peer'` explicitly to share.

## Accounts (Supabase Auth)
Handled by Supabase Auth with the anon key; the client wrappers are in `client/src/lib/auth.js`.
- **Sign up** with a name (stored as `display_name`, which becomes the profile name), email and password (8–72 characters). Email confirmation is required before the first sign-in; the response is identical whether or not the address already has an account.
- **Sign in:** a wrong password and an unknown email return the same error. An unconfirmed account gets `email_not_confirmed` (the UI offers "resend").
- **Forgot password:** always succeeds the same way for known and unknown addresses. The emailed link signs the user in and opens the "choose a new password" screen; the app stays closed until a new password is saved. A saved reset ends all other sessions. A link works once.
- Confirmation and reset emails go through the SMTP account set in the Supabase dashboard (templates in `supabase/templates/`).

## Edge Functions
| Function | Called by | Notes |
|---|---|---|
| `ai` | The signed-in user (JWT required) | Groq gateway. Reads only the caller's rows through their session (RLS applies). Needs `GROQ_API_KEY`. |
| `notify` | Database triggers only (header `x-notify-secret`, no JWT) | Sends the welcome email (once, when the email is confirmed) and the new-sign-in alert (at most one per 30 minutes, not in a new account's first 5 minutes). The recipient is looked up from the auth database by user id — never taken from the request. Emails to reserved test domains are skipped. Sends through the Resend or Brevo web API. Inert until two Vault secrets (`notify_url`, `notify_secret`) exist; failures never block sign-up or sign-in. |
