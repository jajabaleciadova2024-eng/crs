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
   Hire, approve/reject any leave request, edit organization-wide settings.
2. **OIC** — manage workstation assignments, approve/reject leave requests,
   view all schedules/leave, own review preferences.
3. **Associate** — view own workstation assignment, file leave requests, view
   own leave history, manage own account/notification settings.

The first Team Leader account was created via `scripts/seed.mjs` (PSID `337912`,
Jerick Salinas). Team Leaders add everyone else from the `/team` page in the app
— no more manual seeding needed for new members.

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
      team/                 roster management (Team Leader only)
      workstations/         station list CRUD (Team Leader/OIC)
      settings/              account, notifications, org settings, review prefs, associate tenure groups
    api/
      team/route.ts          server route: creates auth user + profile (service role)
      leave/route.ts          file a leave request + notify approvers
      leave/[id]/route.ts      approve/reject a leave request + notify the associate
      schedule/generate/route.ts  auto-shuffle: generates the next schedule week
      keepalive/route.ts      hit by Vercel Cron daily to prevent Supabase auto-pause
  components/               Sidebar, ui.tsx (Panel/Pill/Card/Button/Avatar), SignOutButton
  lib/
    auth.ts                 requireProfile()/requireRole() route guards
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
scripts/seed.mjs                     one-off: seeds workstations + first Team Leader
vercel.json                          Vercel Cron config (keep-alive)
```

## Database schema

See `supabase/migrations/0001_init.sql` for the full source of truth. Tables:

- `profiles` — PSID, name, email, mobile, role, `is_immune`, `is_active`,
  `tenure_group` (`new_hire` | `tenured`, manual, Team Leader only — see
  Settings → Associate groups; not yet consumed by the auto-shuffle rule)
- `workstations` — the rotating stations (Screener, Collecting Officer,
  Releasing Officer, PACD, Electronic Endorsement, Premium Annotation — seeded,
  but editable/expandable from `/workstations`)
- `schedule_weeks` + `assignments` — one row per station per week. `/schedule`
  supports manual reassignment **and** auto-generation via "Generate next
  week" (`POST /api/schedule/generate`, Team Leader/OIC only): fills the
  current week if empty, otherwise generates the week after the latest one
  on record (spaced by `org_settings.schedule_cadence`). Associates flagged
  `is_immune` keep their previous station; everyone else is shuffled across
  the remaining open stations. See `src/lib/schedule.ts` for the pure
  assignment logic (unit-tested).
- `leave_requests` — type, date range, reason, status (pending/approved/rejected)
- `org_settings` — single row, Team-Leader-editable (leave types, schedule
  cadence, require-reason toggle, approver roles)
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
```

Get the Supabase values from Supabase → Project Settings → API. Get SMTP
credentials from Hostinger → Emails → your mailbox → "Configuration" (or
webmail settings) — the host/port/username/password. All of these need to be
set as Environment Variables in the Vercel project for deploys too.

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
- **Associate tenure grouping**: ✅ done — Settings → "Associate groups"
  (Team Leader only), manual Tenured/New Hire label per associate
  (`profiles.tenure_group`), no auto-promotion.
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
- **Every redirectTo URL must be allow-listed in Supabase, including the
  invite flow's.** `resetPasswordForEmail`/`inviteUserByEmail` both take a
  `redirectTo`, and Supabase rejects any target not on its allow list with
  `"requested path is invalid"` — this is what "error request path is
  invalid" means if you see it right after accepting an invite. Both
  `/api/team/route.ts` (member invites) and `scripts/seed.mjs` now pass an
  explicit `redirectTo` (root `/`, via `NEXT_PUBLIC_SITE_URL` or the
  request's own origin) instead of relying on Supabase's default Site URL.
  Add all of these under Supabase → Authentication → URL Configuration →
  Redirect URLs (wildcards supported):
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
