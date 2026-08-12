# CRS Naga Platform — Roster & Leave

Internal, role-based web app for a team of 15 + associates: view weekly workstation
assignments and file/approve leave requests. Built as the foundation phase —
database, auth, and role-based frontend — with more functionality (like
auto-generated weekly schedules) planned to layer on top later.

**Live**: https://crs.jajabaleciado.com (also on Vercel's default domain,
`crs-brown.vercel.app`)
**Repo**: https://github.com/jajabaleciadova2024-eng/crs
**Database/Auth**: Supabase project `jbtzabsbocoldzaldylq`
(https://supabase.com/dashboard/project/jbtzabsbocoldzaldylq)

---

## Roles

Highest → lowest authority:

1. **Team Leader** — full control: add/remove members, assign roles, manage
   workstations, view/manually edit weekly schedules, set the "immune" flag,
   approve/reject any leave request, edit organization-wide settings.
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
      settings/              account, notifications, org settings, review prefs
    api/team/route.ts       server route: creates auth user + profile (service role)
  components/               Sidebar, ui.tsx (Panel/Pill/Card/Button/Avatar), SignOutButton
  lib/
    auth.ts                 requireProfile()/requireRole() route guards
    database.types.ts       hand-authored schema types (see gotcha below)
    supabase/
      client.ts             browser client
      server.ts              server component/route client
      admin.ts                service-role client (server-only, bypasses RLS)
      middleware.ts           session refresh + route guard logic
  proxy.ts                   Next.js 16's replacement for middleware.ts
supabase/migrations/0001_init.sql   full schema, RLS policies, helper functions
scripts/seed.mjs                     one-off: seeds workstations + first Team Leader
```

## Database schema

See `supabase/migrations/0001_init.sql` for the full source of truth. Tables:

- `profiles` — PSID, name, email, mobile, role, `is_immune`, `is_active`
- `workstations` — the rotating stations (Screener, Collecting Officer,
  Releasing Officer, PACD, Electronic Endorsement, Premium Annotation — seeded,
  but editable/expandable from `/workstations`)
- `schedule_weeks` + `assignments` — one row per station per week; `is_immune`
  on a profile is meant to exclude that associate from future auto-shuffling
  (**the shuffle/auto-generate algorithm itself is not built yet** — `/schedule`
  is read + manual-reassign only, with a disabled "Generate next week" button
  as a placeholder)
- `leave_requests` — type, date range, reason, status (pending/approved/rejected)
- `org_settings` — single row, Team-Leader-editable (leave types, schedule
  cadence, require-reason toggle, approver roles)
- `notification_prefs` — per-user notification toggles (UI exists; no emails
  are actually sent yet — see Known gaps)

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
SUPABASE_SERVICE_ROLE_KEY=...       # server-only, used by /api/team and scripts/seed.mjs
```

Get these from Supabase → Project Settings → API. The same three need to be
set as Environment Variables in the Vercel project for deploys.

To re-run the seed script (idempotent-ish — skips the Team Leader invite if a
profile with that email already exists, upserts workstations by name):

```bash
node scripts/seed.mjs
```

## Known gaps / next steps

- **Weekly auto-shuffle**: not implemented. `/schedule` supports manual
  reassignment; the "Generate next week" button is a disabled placeholder.
  This was intentionally deferred — see plan history for the "immune" flag
  design intent.
- **Notifications**: `notification_prefs` UI exists and persists to the DB,
  but nothing actually sends an email/notification yet. Would need a
  Supabase Edge Function or similar triggered on leave status change /
  schedule publish.
- **No automated tests** yet.
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
