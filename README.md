# CRS Naga

Internal, role-based web app for a team of 15 + associates: view weekly workstation
assignments and file/approve leave requests. Started as a foundation phase —
database, auth, and role-based frontend — now with auto-generated weekly
schedules, associate tenure grouping, and email notifications layered on top.

**Live**: https://crs.jajabaleciado.com (also on Vercel's default domain,
`crs-brown.vercel.app`)
**Repo**: https://github.com/jajabaleciadova2024-eng/crs
**Database/Auth**: Supabase project `jbtzabsbocoldzaldylq`
(https://supabase.com/dashboard/project/jbtzabsbocoldzaldylq)

---

## Roles

Highest → lowest authority:

1. **Team Leader** — full control: add/remove members, assign roles, manage
   workstations, view/manually edit weekly schedules, generate the next
   week's schedule, set the "immune" flag, group associates as Tenured/New
   Hire, approve/reject any leave request, edit organization-wide settings,
   and use **Preview mode** (sidebar → "Preview as") to see the entire app
   exactly as OIC or Associate would — nav, page access, buttons, even the
   User Guide content — for testing without a second account. Purely a
   UI/UX aid: the underlying session and every API route's own permission
   check still use the real Team Leader role regardless of what's being
   previewed (see `requireProfileWithPreview` in `src/lib/auth.ts`).
2. **OIC** — view-only across the board beyond their own account: sees all
   schedules and all leave requests (not just their own), but **cannot**
   generate/reassign the schedule, add/edit workstations, or approve/reject
   leave — those are Team Leader only as of `0005_restrict_oic_write_access.sql`.
   Manages own account/notification settings.
3. **Associate** — view own workstation assignment, file leave requests, view
   own leave history, manage own account/notification settings.

The first Team Leader account was created via `scripts/seed.mjs` (PSID `337912`,
Jerick Salinas). Team Leaders add everyone else either from the `/team` page,
or by approving a self-service request submitted from the login page (see
"Access requests" below) — no more manual seeding needed for new members.

## Tech stack

- **Frontend**: Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind CSS 4
- **Backend/DB/Auth**: Supabase (Postgres + Auth + Row Level Security)
- **Hosting**: Vercel, custom subdomain via CNAME
- Node.js 24 locally (`C:\Program Files\nodejs` — wasn't on PATH by default on
  this machine; added to the User PATH env var during setup)

## Project structure

```
src/
  app/
    login/                 PSID-or-email login (public)
    (app)/                 everything behind auth, wrapped by layout.tsx
      page.tsx             dashboard
      schedule/            weekly station × associate grid
      leave/                leave request queue + associate's own filing form
      team/                 roster management + associate tenure grouping (Team Leader only)
      workstations/         station list CRUD (Team Leader only)
      settings/              account, notifications, org settings
    api/
      team/route.ts          server route: creates auth user + profile (service role)
      leave/route.ts          file a leave request + notify approvers
      leave/[id]/route.ts      approve/reject a leave request + notify the associate
      schedule/generate/route.ts  auto-shuffle: generates the next schedule week
      keepalive/route.ts      hit by Vercel Cron daily to prevent Supabase auto-pause
  components/               Sidebar, ui.tsx (Panel/Pill/Card/Button/Avatar), SignOutButton
  lib/
    auth.ts                 requireProfile()/requireRole() route guards + Team-Leader-only preview-mode override
    database.types.ts       hand-authored schema types (see gotcha below)
    schedule.ts              pure auto-shuffle assignment algorithm (unit-tested, schedule.test.ts)
    scheduleDates.ts          Asia/Manila-timezone week math (unit-tested)
    holidays.ts              TL-managed holidays from DB
    payPeriod.ts              semi-monthly (1-15 / 16-end) grouping for leave history (unit-tested)
    email.ts                 Resend REST API wrapper (no-ops if RESEND_API_KEY unset)
    notify.ts                notification triggers: leave status change, new leave to review, schedule published
    supabase/
      client.ts             browser client
      server.ts              server component/route client
      admin.ts                service-role client (server-only, bypasses RLS)
      middleware.ts           session refresh + route guard logic
  proxy.ts                   Next.js 16's replacement for middleware.ts
supabase/migrations/0001_init.sql   full schema, RLS policies, helper functions
supabase/migrations/0002_tenure_group.sql   adds profiles.tenure_group (new_hire/tenured)
supabase/migrations/0005_restrict_oic_write_access.sql   narrows OIC to view-only (workstations/schedule/leave writes -> Team Leader only)
supabase/migrations/0006_leave_overhaul.sql   leave_type -> text, org_settings.leave_type_configs, leave_request_ranges, document_url, flagged_conflict, self edit/cancel RLS
supabase/migrations/0007_leave_documents_storage.sql   document_url -> document_path, creates the private leave-documents Storage bucket
supabase/migrations/0008_access_requests_psid.sql   adds access_requests.psid
supabase/migrations/0009_multi_per_station.sql   allows >1 associate per workstation per week (drops the old 1-per-station unique constraint)
scripts/seed.mjs                     one-off: seeds workstations + first Team Leader
vercel.json                          Vercel Cron config (keep-alive)
```

## Database schema

See `supabase/migrations/0001_init.sql` for the full source of truth. Tables:

- `profiles` — PSID, name, email, mobile, role, `is_immune`, `is_active`,
  `tenure_group` (`new_hire` | `tenured`, associates only, manual, managed
  from Team & Roles alongside role/immune — not yet consumed by the
  auto-shuffle rule)
- `workstations` — the rotating stations (Screener, Collecting Officer,
  Releasing Officer, PACD, Electronic Endorsement, Premium Annotation — seeded,
  but editable/expandable from `/workstations`)
- `schedule_weeks` + `assignments` — one row per associate-station
  assignment per week; a station can now have more than one associate
  (`0009_multi_per_station.sql`), an associate is still limited to one
  station per week. `/schedule` supports manual reassignment **and**
  auto-generation via "Generate next week" (`POST /api/schedule/generate`,
  Team Leader only — OIC can view the schedule but not generate/reassign),
  which opens a planning modal for per-station headcount + tenured/new-hire
  targets before generating: fills the current week if empty, otherwise
  generates the week after the latest one on record (spaced by
  `org_settings.schedule_cadence`). Associates flagged `is_immune` keep
  their previous station (counting toward its headcount); remaining seats
  fill from the tenured/new-hire pools per the quota, then any still-open
  seats from whoever's left. See `src/lib/schedule.ts` for the pure
  assignment logic (unit-tested, both the legacy no-quota path and the
  quota path). `/schedule` also shows an "On leave" flag on any assigned
  associate with approved leave overlapping the displayed week —
  visibility only, Team Leader decides whether/how to reassign via the
  same manual control.
- `leave_requests` — **has two FKs to `profiles`** (`associate_id` and
  `reviewed_by`) — any query embedding `profiles(...)` on this table
  **must** disambiguate with `profiles!leave_requests_associate_id_fkey(...)`
  (or `..._reviewed_by_fkey`), otherwise PostgREST errors
  (`PGRST201`) and the query returns `null` — see the Known gaps entry
  above for the bug this caused. Type (free text, see `leave_type_configs`
  below), a primary date range (`start_date`/`end_date`), reason, status
  (pending/approved/rejected), plus:
  - `flagged_conflict` — set at submission time if a Vacation-behavior
    type overlapped another org-wide pending/approved request on any date
    (soft warning shown to the filer and a "Possible conflict" badge in the
    queue — never blocks submission).
  - `document_path` / `document_uploaded_at` — for Sick/Bereavement-behavior
    types, uploaded by the requester any time after filing to a private
    Supabase Storage bucket (`leave-documents`; `src/lib/documentStorage.ts`).
    `document_path` is a storage path, not a public URL — there's no direct
    client access to the bucket at all (no `storage.objects` RLS policies),
    everything goes through `/api/leave/[id]/document`: `POST` to upload
    (owner only), `GET` to fetch short-lived signed view/download links
    (owner **or Team Leader** only — OIC doesn't get document access).
    Links expire in 60 seconds and are generated fresh on every click, never
    stored. A monthly cron (`GET /api/leave-documents-cleanup`, protected by
    `CRON_SECRET`) deletes documents older than `DOCUMENT_RETENTION_DAYS`
    (default 30) so Storage doesn't grow unbounded — the `leave_requests`
    row itself is untouched, just the attached file.
  - `leave_request_ranges` (child table) — extra non-consecutive date
    ranges beyond the primary one, for "a few days here, a few days there"
    requests. RLS mirrors the parent (owner can only add/remove while
    still pending).
  - OIC sees everyone's requests (view-only) but only Team Leader can
    approve/reject (`leave_requests_update_team_leader_not_self` RLS
    policy, double-checked in `/api/leave/[id]`).
  - The requester (any role) can edit or cancel their **own** request
    while it's still `pending` (`leave_requests_update_own_pending` /
    `leave_requests_delete_own_pending` RLS) — locked once approved/rejected.
- `org_settings` — single row, Team-Leader-editable: schedule cadence,
  require-reason toggle, approver roles, and `leave_type_configs` (jsonb) —
  a Team-Leader-editable list of `{key, label, behavior}`, where behavior is
  one of:
  - `review` — standard: Team Leader approves/rejects manually (default for
    Emergency/Other)
  - `vacation_conflict` — org-wide "1 person on leave per day" conflict
    checking against every other request of any type with this behavior
    (default for Vacation)
  - `auto_approve_document` — no review expected; the requester uploads
    supporting documentation (medical certificate, proof of event, etc.)
    (default for Sick/Bereavement)
  See `src/lib/leaveTypes.ts` for the shared types/defaults, edited from
  Settings → Organization settings.
- `access_requests` — self-service "Request access" submissions from the
  login page (name, email, mobile, optional message). Anyone can insert
  (public, unauthenticated — RLS `access_requests_insert_anyone`); only
  Team Leader/OIC can read (`access_requests_select_leadership`). Reviewed
  from `/access-requests` (Team Leader only): approving always creates an
  **Associate** account (role is hardcoded server-side in the approve
  route — not client-supplied) and runs the exact same invite as `/team`'s
  "Add member" (`src/lib/inviteMember.ts`, shared by both), just needs a
  PSID assigned first. Rejecting just marks the row. Team Leader/OIC
  accounts are never created through this form — those are only ever added
  directly from `/team`, which stays gated to Team Leader only (page-level
  `requireRole` + RLS `profiles_team_leader_full_write`; OIC cannot edit any
  profile but their own, even via direct API/SQL access, since RLS enforces
  it independent of the UI). A pending-count badge shows in the sidebar nav
  item and a Dashboard card, and `notifyLeadersNewAccessRequest` emails all
  active Team Leaders when one comes in (same no-op-if-unconfigured behavior
  as the other notifications).
- `notification_prefs` — per-user notification toggles. Now wired to real
  emails via Resend (see `src/lib/email.ts` / `src/lib/notify.ts`): fires on
  leave status change, new leave request needing review, and schedule
  publish. Requires `RESEND_API_KEY` (see Local development below) — without
  it, sends are skipped with a console warning instead of failing.

RLS is enabled on every table. Two `security definer` helper functions
(`current_role()`, `is_leader_or_oic()`) back most policies. A third,
`email_for_psid()`, lets the login page resolve a PSID to an email before
calling Supabase Auth's normal email+password sign-in.

## Local development

```bash
cd "J:\Claude Projects\CRS Naga Platform"
npm run dev
```

Needs `.env.local` (not committed — see `.gitignore`) with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...       # server-only, used by /api/team, /api/keepalive, and scripts/seed.mjs

# Email notifications — src/lib/email.ts tries SMTP first, then Resend, then
# no-ops with a console warning if neither is configured.
SMTP_HOST=smtp.hostinger.com        # Hostinger mailbox SMTP host
SMTP_PORT=465                       # 465 = SSL, 587 = STARTTLS
SMTP_USER=you@yourdomain.com        # full Hostinger mailbox address
SMTP_PASS=...                       # mailbox password (or app-specific password if 2FA is on)
# RESEND_API_KEY=...                # alternative to SMTP — https://resend.com, free tier 3k/mo
NOTIFICATIONS_FROM_EMAIL=...        # optional, defaults to SMTP_USER (or Resend's onboarding sender if using Resend)

# Leave document cleanup cron (src/app/api/leave-documents-cleanup) —
# Vercel auto-sends this as a Bearer header on cron-triggered requests once
# CRON_SECRET is set as an env var; the route refuses to run without it.
CRON_SECRET=...                     # any random string — generate one, doesn't need to mean anything
# DOCUMENT_RETENTION_DAYS=30        # optional, defaults to 30
```

Get the Supabase values from Supabase → Project Settings → API. Get SMTP
credentials from Hostinger → Emails → your mailbox → "Configuration" (or
webmail settings) — the host/port/username/password. All of these need to be
set as Environment Variables in the Vercel project for deploys too.

Leave documents (medical certificates, bereavement proof) live in a private
Supabase Storage bucket — no separate service/credentials needed, unlike the
Google Drive approach this briefly used. See the `leave_requests` bullet
under Database schema below for how access/cleanup work.

To re-run the seed script (idempotent-ish — skips the Team Leader invite if a
profile with that email already exists, upserts workstations by name):

```bash
node scripts/seed.mjs
```

To run the test suite:

```bash
npm test
```

## Known gaps / next steps

- **Leave queue appearing empty on every account**: ✅ fixed a real bug —
  `leave_requests` has two foreign keys to `profiles` (`associate_id` and
  `reviewed_by`). Every query embedding `profiles(first_name, last_name)`
  was ambiguous about which FK to follow; PostgREST refused the query
  entirely (`PGRST201: more than one relationship was found`) and returned
  `null`, which the app treated as "no requests" — silently emptying the
  queue for every account (Team Leader's global view happened to still work
  for approving because... actually it hit the exact same bug too; the
  fix is the same one-liner in three places). Fixed by naming the FK
  explicitly: `profiles!leave_requests_associate_id_fkey(...)` in
  `src/app/(app)/leave/page.tsx`, `leave/history/page.tsx`, and the
  Dashboard. Verified live against a real associate account (generated a
  magiclink session server-side with the admin client, ran the exact query
  as them) before and after the fix.
- **Per-station headcount + tenure quotas when generating, OIC included,
  manual immune placement required**: ✅ done. "Generate next week" opens a
  planning modal (`GenerateButton.tsx`) listing every active workstation
  with Headcount/Tenured/New Hire number inputs, live-subtracting against
  total active headcount (Team Leader + OIC + associates) and total
  tenured/new-hire associates as you type.
  - **OIC is included** in the assignable pool (eligible for headcount/
    fallback seating, per explicit instruction) — Team Leader is not, they
    don't rotate through stations. Tenure targeting still only pulls from
    associates (OIC/Team Leader don't have a meaningful tenure group), but
    OIC can still fill a plain headcount seat via fallback.
  - **Immune carryover is no longer automatic.** Every currently-immune,
    active, non-Team-Leader member must be explicitly placed at a station
    in the modal — a required step, hard-enforced server-side in
    `POST /api/schedule/generate` (returns a 400 listing exactly who's
    still unplaced if you try to generate without placing all of them). No
    more falling back to "wherever they were last week."
  - `src/lib/schedule.ts`'s `generateAssignments` accepts optional `quotas`
    and `immunePlacements`: explicit immune placements seat first (counting
    toward that station's headcount), then tenured/new-hire pools fill each
    station's targets, then any still-open seats fill from whoever's left
    regardless of tenure (coverage over a strict-but-empty seat). Calling
    it with neither param keeps the original one-per-station,
    automatic-carryover behavior byte-for-byte (all pre-existing tests
    untouched); quotas without immunePlacements falls back to
    carryover-from-last-week for immune seating specifically. 14 tests
    total covering all three modes.
  - Required allowing more than one associate per station per week —
    `0009_multi_per_station.sql` drops the old 1-per-station unique
    constraint (an associate can still only be on one station per week).
  - `/schedule` shows a persistent headcount/tenure stats strip (Team
    Leader only).
- **Schedule week = Philippine Monday–Friday, with regular holidays flagged**:
  ✅ done. `src/lib/scheduleDates.ts` computes "today"/week boundaries in
  Asia/Manila (fixed UTC+8, no DST) rather than the server's own clock —
  this matters because Vercel's servers run UTC, which could put "today" a
  day off from what a PH-based Team Leader expects late at night. The work
  week is Monday–Friday now (was the full Mon–Sun calendar week), used
  consistently by `/schedule`, `/api/schedule/generate`, and the Dashboard.
  `src/lib/holidays.ts              TL-managed holidays from DB
  dates + Easter-based Maundy Thursday/Good Friday + "last Monday of
  August" for National Heroes Day, all unit-tested) and flags any that
  fall within the displayed week on `/schedule`. **Eid'l Fitr and Eid'l
  Adha are lunar-calendar and only fixed by Presidential Proclamation each
  year — they can't be computed.** Add announced dates to
- **Leave history (Team Leader)**: ✅ done — `/leave/history`, linked from
  Leave Requests. Approved leave grouped into semi-monthly periods (1st–15th,
  16th–end of month), most recent first (`src/lib/payPeriod.ts`, unit-tested).
- **Team & Roles ordering**: ✅ done — roster sorted numerically by PSID
  (lowest to highest), already included every role (Team Leader, OIC,
  associates), just wasn't ordered that way before.
- **Page-load delay**: ✅ fixed a real perf bug — `requireProfile()`/
  `requireProfileWithPreview()` was called independently by both the
  `(app)` layout and every page (each doing its own `getUser()` + profile
  `select`), on top of the proxy middleware's own session check — 2-3
  redundant Supabase round-trips on every navigation. `requireProfileWithPreview`
  is now wrapped in React's `cache()` (`src/lib/auth.ts`) so the layout and
  page share one result per request. Also parallelized previously-sequential
  independent queries via `Promise.all` on the pages that had the most
  (`/`, `/leave`, `/schedule`, `/settings`, `/access-requests`) instead of
  awaiting them one after another.
- **Weekly auto-shuffle**: ✅ done — see `/schedule`'s "Generate next week"
  button, `src/app/api/schedule/generate/route.ts`, and `src/lib/schedule.ts`.
  The exact rule for factoring `tenure_group` into placement (vs. just
  `is_immune`) is still undecided — currently tenure grouping is captured
  but not consumed by the algorithm.
- **Associate tenure grouping**: ✅ done — Team & Roles' "Tenure" column
  (Team Leader only), manual Tenured/New Hire label per associate
  (`profiles.tenure_group`), no auto-promotion.
- **Leave request editing/cancelling, conflict warnings, type-specific
  behavior, and document uploads**: ✅ done — see the `leave_requests` bullet
  above and `0006_leave_overhaul.sql`. Specifically **not** built: the
  auto-shuffle algorithm doesn't yet automatically exclude associates with
  approved leave for the target week (the "On leave" flag on `/schedule` is
  visibility-only — Team Leader reassigns manually); and there's still no
  leave-balance/yearly-summary view, just the flat queue.
- **Notifications**: ✅ done — see `src/lib/email.ts` / `src/lib/notify.ts`.
  Sends via SMTP (e.g. a Hostinger mailbox) if `SMTP_HOST`/`SMTP_USER`/
  `SMTP_PASS` are set, else via Resend if `RESEND_API_KEY` is set. Fires on:
  leave status change (to the associate), new leave request (to approvers
  with the pref on), schedule published (to everyone with the pref on).
  Until credentials are set, sends no-op with a console warning rather than
  failing the request.
- **Automated tests**: ✅ started — Vitest (`npm test`), currently covering
  `src/lib/schedule.ts`'s auto-shuffle logic. No integration/E2E tests yet.
- **Keep-alive**: ✅ done. `vercel.json` defines a daily Vercel Cron job
  (`0 0 * * *`, the max frequency on the Hobby plan) hitting
  `GET /api/keepalive`, which does a trivial `org_settings` read via the
  admin client — real DB activity, so it resets Supabase's 7-day auto-pause
  clock. No extra env vars needed; Vercel Cron authenticates automatically
  when the route lives in the deployed project.

## Gotchas hit during setup (useful if debugging weirdness later)

- **Next.js 16 renamed `middleware.ts` → `proxy.ts`** (function `proxy`
  instead of `middleware`). This project already uses the new convention
  (`src/proxy.ts`) — don't recreate a `middleware.ts`.
- **Supabase client is deliberately untyped.** Passing a hand-authored
  `Database` generic into `createBrowserClient`/`createServerClient`
  (`@supabase/ssr` + `@supabase/supabase-js` versions in use here) collapses
  every query result to `never` — reproduced in isolation, independent of the
  schema's actual shape; looks like an upstream generic-resolution bug in this
  package combo. Workaround: clients are created without the `<Database>`
  generic, and joined/computed columns are cast through `any` at the call
  site (see the `eslint-disable @typescript-eslint/no-explicit-any` comments
  at the top of a few page files). `database.types.ts` is kept as reference
  documentation for row shapes even though it's not wired into the clients.
- **`PGRST002` / "Could not query the database for the schema cache"** right
  after running the migration: this was Supabase's Data API "Exposed
  schemas" setting needing a forced re-save (Project Settings → Data API →
  Settings tab → re-click Save on Exposed schemas even if `public` already
  looked checked) — a stale config that a plain project restart did not fix.
- **Supabase's free-tier invite email has a low rate limit** — a few failed
  seed attempts in a row will trip "email rate limit exceeded." Space out
  invite attempts if you hit this.
- **API routes are excluded from the auth-guard middleware.**
  `src/proxy.ts`'s matcher used to cover `/api/*` too, which silently broke
  any API route hit without a session cookie — including Vercel Cron's
  `/api/keepalive` ping (redirected to `/login` instead of ever reaching the
  DB — the keep-alive likely never actually worked until this was fixed) and
  the public `/api/access-requests` submit endpoint. Every API route already
  does its own `getUser()`/role check inside the handler, so excluding `/api`
  from the middleware matcher doesn't remove any protection — it just stops
  a redundant guard from blocking unauthenticated requests that are supposed
  to reach the route.
- **Email link prefetching silently burns one-time invite/reset tokens —
  fixed via a manual-click confirm page.** Beyond the corporate-scanner case
  below, this turned out to also happen with plain personal Gmail (some
  combination of Gmail's own safety scanning / an extension / antivirus),
  making Supabase's default flow (email links straight to their `/verify`
  GET endpoint, auto-consuming the token) unreliable enough that it kept
  failing even after the redirect fixes below. **Fix**: `src/app/auth/confirm/`
  is a page that does *not* auto-consume anything on load — it requires an
  explicit button click before calling `supabase.auth.verifyOtp({ token_hash,
  type })`. A prefetching bot fetches the page's HTML but never clicks the
  button, so the token survives until the real human does. This requires
  changing Supabase's email templates (Authentication → Emails) so the link
  points at our confirm page instead of `{{ .ConfirmationURL }}`:
  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite">Accept invitation</a>
  ```
  (swap `type=invite` for `type=recovery` in the "Reset Password" template).
  `/auth/confirm` then routes to `/reset-password` once the token's verified
  and a session exists — `/reset-password` itself needs no changes, it
  already picks up any established session regardless of which flow created
  it.
- **Corporate email security scanners can silently break invite/reset links.**
  Supabase's invite and password-reset links are one-time-use (`/verify`
  consumes the token on first GET). Some corporate mail gateways (Microsoft
  Defender for Office 365 "Safe Links", Proofpoint, etc.) auto-follow links
  in incoming email to scan them *before* the recipient ever opens their
  inbox — this consumes the one-time token, so the real user's click then
  fails with `"Email link is invalid or has expired"` /
  `"One-time token not found"` even though the email genuinely arrived and
  nothing is misconfigured. Diagnose via Supabase → Authentication → Logs:
  look for a `/verify` request completing (`user_signedup` or similar)
  within seconds of the `user_invited`/reset email being sent, followed by a
  second `/verify` failing — that gap is the signature of a scanner beating
  the human to the link. **Fix**: the account is usually already
  created/confirmed by that first scanner hit, so the affected person can
  just use `/forgot-password` to set their own password instead of
  re-clicking the dead invite link. If it keeps happening on the same
  corporate domain, their IT admin needs to exclude Supabase's auth domain
  from link-prefetching/scanning.
- **Invite/reset redirectTo must land on a public page, not `/`.** The auth
  token from an invite or password-reset link arrives as a URL *fragment*
  (`#access_token=...`), which browsers never send to the server. `/` is
  guarded by `src/proxy.ts` middleware, which only runs server-side — it
  never sees that fragment, sees no session, and bounces to `/login` before
  client JS gets a chance to process the token. `/api/team/route.ts` and
  `scripts/seed.mjs` both point `redirectTo` at `/reset-password` instead —
  a public page that waits for the browser to turn the fragment into a real
  session, then shows a "set password" form (works for both invites and
  actual password resets).
- **Every redirectTo URL must also be allow-listed in Supabase.**
  `resetPasswordForEmail`/`inviteUserByEmail` both take a `redirectTo`, and
  Supabase rejects any target not on its allow list with `"requested path is
  invalid"` — this is what that error means if you see it right after
  accepting an invite. Add all of these under Supabase → Authentication →
  URL Configuration → Redirect URLs (wildcards supported):
  ```
  https://crs.jajabaleciado.com/**
  https://crs-brown.vercel.app/**
  ```
  and set **Site URL** (same page) to `https://crs.jajabaleciado.com`. The
  wildcard form covers `/`, `/reset-password`, and anything added later — no
  need to list each path individually. If testing invites/resets from local
  dev, also add your `http://localhost:3000/**`.
  Optionally set `NEXT_PUBLIC_SITE_URL=https://crs.jajabaleciado.com` in
  `.env.local`/Vercel if you ever want invite links to point somewhere other
  than the request's own origin (e.g. always the canonical domain even when
  someone adds a member from the Vercel preview URL).
- **Windows path-with-spaces** broke the `preview_start` dev-server launch
  config when pointed at `J:\Claude Projects\CRS Naga Platform` directly. Fixed
  by creating a junction (`J:\CRSNagaPlatform` → the real folder, via
  `mklink /J`) and pointing `.claude/launch.json`'s `--prefix` at that instead.
  The junction is cosmetic/local-tooling only — it's not part of the deployed
  app.

## Deployment

Vercel auto-deploys from `main` on push (`git push origin main`). No manual
Vercel CLI login was completed — the project was connected and deployed via
the Vercel dashboard instead (GitHub import). The custom domain
`crs.jajabaleciado.com` is a CNAME pointed at Vercel's edge, added via
Vercel project Settings → Domains.
