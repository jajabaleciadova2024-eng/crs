# Build Order — Workstation & Leave Management App

Living checklist of what's built and what's left. Update this file as work lands
(check items off in the same commit that finishes them) so it stays the single
source of truth instead of drifting out of sync in chat history.

## Stack
Next.js (App Router) + Supabase (Postgres, Auth, RLS) + Tailwind v4.

## Roles
`team_leader` (highest) > `oic` > `associate`. Team Leader and OIC are collectively
"leadership"/"approvers" (`isApprover()` in `src/lib/auth.ts`).

---

## ✅ Done

- [x] **Schema & RLS** (`supabase/migrations/0001_init.sql`) — `profiles`,
      `workstations`, `schedule_weeks`, `assignments`, `leave_requests`,
      `org_settings`, `notification_prefs`, all with row-level security policies
      scoped by role/ownership.
- [x] **Auth** — Supabase SSR client/middleware (`src/lib/supabase/*`), session
      guard + role helpers (`src/lib/auth.ts`), login page supporting sign-in by
      PSID or email (`src/app/login`).
- [x] **App shell** — sidebar nav, sign-out, shared UI primitives
      (`src/components/*`), protected `(app)` layout.
- [x] **Dashboard** (`src/app/(app)/page.tsx`).
- [x] **Team management** — list/add members, role edit, `/api/team` route using
      the service-role client to invite users via Supabase Auth
      (`src/app/(app)/team/*`, `src/app/api/team/route.ts`).
- [x] **Workstations CRUD** (`src/app/(app)/workstations/*`).
- [x] **Leave requests** — submit form, approve/reject actions, RLS prevents
      self-approval (`src/app/(app)/leave/*`).
- [x] **Settings** — account form, org settings (cadence, leave types, required
      reason, approver roles), notification-preference toggles
      (`src/app/(app)/settings/*`).
- [x] **Schedule page (read/manual)** — shows current week's assignments,
      manual reassignment form for leadership (`src/app/(app)/schedule/*`).
- [x] **Seed script** — provisions initial workstations + first Team Leader
      account via invite email (`scripts/seed.mjs`).

## 🚧 To Do

- [ ] **Auto-generate weekly schedule** — the "Generate next week" button in
      `src/app/(app)/schedule/page.tsx` is currently disabled
      ("Auto-shuffle logic ships in a later build"). Needs the rotation/shuffle
      algorithm: one associate per workstation, respect `is_immune` and active
      leave, honor `org_settings.schedule_cadence` (weekly/biweekly).
- [ ] **Notifications delivery** — `notification_prefs` toggles exist in the UI
      and DB but nothing actually sends email/SMS yet. No mailer/SMS provider
      is wired up (no Resend/nodemailer/Twilio dependency present). Needs:
      - a provider choice + integration
      - trigger points: leave status change, schedule published, new leave to
        review, optional `remind_pending_after_hours` reminder job.
- [ ] **Scheduled/cron trigger** for weekly generation + reminder emails (e.g.
      Supabase cron / Vercel cron hitting a route handler).
- [ ] **`.env.local` / `.env.example`** — none checked in; document required
      vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`) so a fresh clone can run `npm run dev` and
      `scripts/seed.mjs` without guessing.
- [ ] **Tests** — no test setup yet (unit or e2e).
- [ ] **README** — still the default `create-next-app` boilerplate; needs
      project-specific setup (Supabase project + migration + seed steps).
- [ ] **Biweekly cadence support** — schema/settings allow it
      (`org_settings.schedule_cadence`), but schedule page logic is hardcoded
      to the current week only; biweekly generation/view not implemented.
- [ ] **Leave/schedule conflict handling** — no visible logic yet ensuring an
      associate approved for leave is excluded from that week's assignment.

---

## Suggested next order of work

1. Auto-generate weekly schedule (core product gap, everything else assumes it exists).
2. Leave/schedule conflict handling (depends on #1).
3. Notifications delivery + triggers.
4. Cron wiring for weekly generation + reminders.
5. `.env.example` + real README (unblocks anyone else opening the repo).
6. Biweekly cadence support.
7. Tests.
