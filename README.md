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
- `schedule_weeks` + `assignments` — one row per station per week. `/schedule`
  supports manual reassignment **and** auto-generation via "Generate next
  week" (`POST /api/schedule/generate`, Team Leader only — OIC can view the
  schedule but not generate/reassign): fills the current week if empty,
  otherwise generates the week after the latest one on record (spaced by
  `org_settings.schedule_cadence`). Associates flagged
  `is_immune` keep their previous station; everyone else is shuffled across
  the remaining open stations. See `src/lib/schedule.ts` for the pure
  assignment logic (unit-tested). `/schedule` also shows an "On leave" flag
  on any assigned associate with approved leave overlapping the displayed
  week — visibility only, Team Leader decides whether/how to reassign via
  the same manual control (see Known gaps for what this doesn't do yet).
- `leave_requests` — type (free text, see `leave_type_configs` below), a
  primary date range (`start_date`/`end_date`), reason, status
  (pending/approved/rejected), plus:
  - `flagged_conflict` — set at submission time if a Vacation-behavior
    type overlapped another org-wide pending/approved request on any date
    (soft warning shown to the filer and a "Possible conflict" badge in the
    queue — never blocks submission).
  - `document_url` / `document_uploaded_at` — for Sick/Bereavement-behavior
    types, uploaded by the requester any time after filing (see Google
    Drive setup below).
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

# Leave document uploads (Sick/Bereavement) — src/lib/googleDrive.ts.
# Without these, the upload button shows a clear "not configured" error
# instead of failing silently.
GOOGLE_SERVICE_ACCOUNT_EMAIL=...          # from the service account's JSON key
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=...    # from the same JSON key — real or \n-escaped newlines both work
GOOGLE_DRIVE_FOLDER_ID=...                # the folder's ID from its Drive URL
```

Get the Supabase values from Supabase → Project Settings → API. Get SMTP
credentials from Hostinger → Emails → your mailbox → "Configuration" (or
webmail settings) — the host/port/username/password. All of these need to be
set as Environment Variables in the Vercel project for deploys too.

### Google Drive setup (for leave document uploads)

1. [console.cloud.google.com](https://console.cloud.google.com) → create/select
   a project → APIs & Services → Enable the **Google Drive API**.
2. Credentials → Create Credentials → **Service Account** → create it, then
   generate a JSON key and download it.
3. Create a Drive folder for the documents. Share it with the service
   account's email (from the JSON key, looks like
   `xxx@xxx.iam.gserviceaccount.com`) as **Editor**, and set the folder's
   general sharing to **Anyone with the link — Viewer** so uploaded files
   are actually reachable via their link.
4. From the JSON key, set `GOOGLE_SERVICE_ACCOUNT_EMAIL` (the `client_email`
   field) and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (the `private_key`
   field). Set `GOOGLE_DRIVE_FOLDER_ID` to the folder's ID (the string in
   its URL after `/folders/`).

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
