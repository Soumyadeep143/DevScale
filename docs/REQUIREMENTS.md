# DevScale — Product Requirements

Status key: **Done** (built and tested) · **Partial** · **Blocked** (needs a decision or data) · **Open** (not started)
Last updated: 2026-11-16

## 1. Purpose and scope
DevScale is a job-search workspace. A person tracks leads and applications, keeps contacts and notes, practises coding problems, and can share leads and contacts with trusted peers. Two workspaces: **Personal** (private) and **Team** (sharing between accepted peers).

Out of scope: a native mobile app, a recruiter-facing product, and any scraping of third-party sites from the browser.

## 2. Users and roles
| Role | Can do |
|---|---|
| Signed-out visitor | Sign up, sign in, request a password reset |
| Member | Everything in Personal; sees Team data only for peers whose connection is accepted |
| Peer | A member with an accepted connection; can see items the other marks as Peer-visible |

Access control is enforced in the database (row-level security). The client only chooses what to display.

## 3. Functional requirements

### 3.1 Authentication (FR-AUTH) — Clerk
Authentication is provided by Clerk; see `CLERK_MIGRATION.md`. **Code done; not yet live** (needs the Clerk and Supabase settings and the database migration applied).
| ID | Requirement | Status |
|---|---|---|
| AUTH-1 | A new person can create an account (Clerk sign-up) and must verify their email. | Code done; live check pending |
| AUTH-2 | Sign-in with email and password; password reset by emailed link; both handled by Clerk. | Code done; live check pending |
| AUTH-3 | Wrong email and wrong password are indistinguishable (Clerk's behaviour). | Provided by Clerk |
| AUTH-4 | Every signed-in user has a database account (profile, peer code) created on first sign-in. | Migration written, unapplied |
| AUTH-5 | Existing users keep all their data: they are imported into Clerk with their old id and linked once. Passwords carry over. | Script and migration written, unapplied |
| AUTH-6 | The app never opens until the database account exists; a failure shows an explanation with Retry and Sign out. | Done (tested) |
| AUTH-7 | Row-level security identifies the caller from the Clerk token only; a second sign-in cannot claim another user's data. | Migration + pgTAP test written, unrun |
| AUTH-8 | Sessions persist across reloads; Sign out ends the session. | Clerk; browser check pending |
| AUTH-9 | A build without a Clerk key shows an explanation, not a blank page. | Done |
| AUTH-10 | Welcome / new-sign-in emails: Clerk's own; the Supabase-triggered ones no longer fire. | Decision recorded |

### 3.2 Global shell (FR-SHELL)
Header with logo, Personal/Team segmented toggle, sync, and account menu (name, email, sign out). Desktop/tablet tab bar; phone bottom bar (Home, Leads, Contacts, More). The toggle sits directly below the compact header on phones. The URL hash holds workspace and tab. Light and dark themes (a header toggle; the choice is remembered, and with none saved it follows the system). **Done.** A notification bell is **Open** (no notification system exists). **Profile page** (account menu → Profile, at `#/profile`): how peers see you, your peer code, and Clerk's account screen for name, photo, email, phone, password, two-step sign-in and sessions; a changed name is copied to the profile peers read. **Done.**

### 3.3 Personal workspace pages (FR-PERS)
| Page | Requirement | Status |
|---|---|---|
| Dashboard | Greeting; Add Job / Import; KPI cards (Total, Applied, Interviewing, Rejected, Offers); activity chart with range filter; pipeline donut; recent applications; jobs currently interviewing; recent activity; recently added leads. All figures from the user's own data. | Done |
| Leads | Status tabs with counts; search by company, role, location; date filter; sort; Personal/Peer visibility (default Personal); share and un-share with confirmation; table on desktop, cards on mobile. | Done |
| Contacts | Required: name, email, phone, company. Optional: designation, LinkedIn, notes. Add, edit, delete, import, search (name/email/company), visibility filter, sort; table on desktop, cards on mobile. | Done |
| Board | One column per status (Lead, Applied, Interviewing, Offer, Rejected); drag and drop plus arrow buttons; search and source filter; moves change only the user's own record; a tracked job cannot return to Lead. | Done |
| Table | Sort, search, status filter, pagination (10/25/50), row selection, bulk move and delete (confirmed), CSV export, Import; cards on mobile. | Done |
| Graph | Insights (range 7d / 30d / 12 weeks / custom; over time, status split, by company, by source, conversion, monthly) and the existing network graph as a second tab. Conversion percentages are withheld below 5 applications. | Done |
| LeetCode | Solved, completion, in-progress, not-started, difficulty split, recent activity, by-week grid, problem list with status change, link to leetcode.com. | Done for stored data |
| Notes | List with search, create, edit, delete; title is the first line; list-first on mobile. | Done; categories **Blocked** |
| Guide | Resource cards, one per existing guide section. | Done; content is stale (see 6) |

### 3.4 Team workspace (FR-TEAM)
Overview, shared Leads, shared Contacts, Peers (codes, requests, accept/decline/remove), Activity and Guide. Built by a separate workstream. Rules: importing a shared lead or contact creates the importer's own copy; nothing they do with it is visible to the owner; making an item Personal revokes peer access immediately. Rate limits apply to peer requests and wrong peer codes.

## 4. Non-functional requirements
- **Privacy/security:** row-level security on every table; `anon` has no table access; no `TRUNCATE/REFERENCES/TRIGGER` for signed-in users; CSV export neutralises formula injection; no third-party calls with company or personal data.
- **Responsive:** 1280 px and up (full nav, multi-column), 768–1279 px (compact nav, two-column), 360–767 px (bottom nav, stacked, no horizontal page scroll). **Needs a manual pass on real devices.**
- **Accessibility:** keyboard focus rings, labelled controls, dialogs trap focus, drag and drop has a button alternative.
- **Performance:** data polled every 10 s while the tab is visible; backs off to 30 s after repeated failures. The production bundle is above 500 kB and should be code-split (**Open**).
- **Quality gates:** `npx vitest run`, `npx oxlint`, `npx vite build` must pass. Currently 27+ test files green.

## 5. Data model constraints
- `jobs.status` ∈ lead, applied, interviewing, offer, rejected. No interview date, no history table.
- Leads carry visibility (`personal` / `peer`); tracked jobs are always private.
- Notes are a single text field; no category or title column.
- LeetCode rows store status, difficulty, week, day, concept and `updated_at`; no acceptance rate, streak or contest data.

## 6. Open items and decisions needed
| # | Item | Needs |
|---|---|---|
| 1 | Clerk go-live | Follow `CLERK_MIGRATION.md` (keys, Supabase third-party auth, migration on a branch, user import) |
| 2 | Notes categories | Decision, then a migration |
| 3 | Upcoming interviews | Decision on an `interview_date` column |
| 4 | LeetCode acceptance, streak, contests, profile link | Decision on tracking or a username field |
| 5 | Guide content | It still describes Google Sheets as the source of truth; needs correct text |
| 6 | Notification bell | Decision |
| 7 | Company logos | Decision on an acceptable source, else initials stay |
| 8 | Bundle size | Code-splitting pass |
| 9 | Real-device responsive QA | Someone to open each page at the three widths |
