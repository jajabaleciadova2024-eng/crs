-- ============================================================================
-- 0042 — choose what a task blocks, and rate-limit nudges
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. What a blocking task actually blocks
-- ---------------------------------------------------------------------------
-- blocker_days_before already says WHEN a task starts blocking. It could not
-- say WHAT: every blocking task locked both the future schedule and leave
-- filing, so a task that only needed to gate one of them had to gate both.
-- Defaults are true on purpose — that is exactly how every existing task
-- behaves, so nothing changes until a Team Leader turns one off.
alter table public.member_tasks
  add column if not exists blocks_schedule boolean not null default true,
  add column if not exists blocks_leave    boolean not null default true;

comment on column public.member_tasks.blocks_schedule is
  'While blocking, hides future schedule dates and tomorrow''s station from the member.';
comment on column public.member_tasks.blocks_leave is
  'While blocking, stops the member filing a leave request.';

-- ---------------------------------------------------------------------------
-- 2. Nudge rate limiting
-- ---------------------------------------------------------------------------
-- A nudge is a notification with no cost to send and no memory, so the same
-- person could be poked about the same task as often as the button was
-- clicked. One row per (task, member) holding the LAST nudge is all that is
-- needed to enforce a cooldown; the history of every individual nudge is not
-- interesting, only how long ago the most recent one was.
create table if not exists public.task_pokes (
  task_id    uuid not null references public.member_tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  poked_by   uuid not null references public.profiles (id),
  poked_at   timestamptz not null default now(),
  primary key (task_id, profile_id)
);

alter table public.task_pokes enable row level security;

-- Read-only to the Team Leader; every write goes through the API on the
-- service-role client, which is also where the cooldown is enforced.
drop policy if exists "task_pokes_select_tl" on public.task_pokes;
create policy "task_pokes_select_tl" on public.task_pokes
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );
