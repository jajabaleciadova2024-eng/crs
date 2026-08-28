-- ============================================================================
-- Break-time scheduling
--
-- Three staggered break slots (10 AM, 11 AM, 12 PM). Windows — not people —
-- are what go on break: whoever is seated at a window that day takes that
-- window's slot. Generated together with the weekly schedule and cleared with
-- it, so the two can never drift apart.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Assignments now name a specific window, not just a station. Nullable: rows
-- generated before this migration have no window, and the UI falls back to
-- showing the station alone.
-- ---------------------------------------------------------------------------
alter table public.assignments
  add column if not exists window_id uuid references public.workstation_windows(id) on delete set null;

create index if not exists assignments_window_idx on public.assignments (window_id);

-- ---------------------------------------------------------------------------
-- Break immunity — deliberately NOT profiles.is_immune. Rotation immunity
-- means "don't shuffle my station"; break immunity means "don't move my break
-- slot". Someone can need one without the other, so they get their own flag.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_break_immune boolean not null default false;

-- ---------------------------------------------------------------------------
-- One row per (day, window) that goes on break.
-- reliever_associate_id is set when the window would otherwise be left
-- unmanned — a single-window station like PACD, or a priority station down to
-- its last manned window.
-- ---------------------------------------------------------------------------
create table if not exists public.break_assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_week_id uuid not null references public.schedule_weeks(id) on delete cascade,
  assignment_date date not null,
  window_id uuid not null references public.workstation_windows(id) on delete cascade,
  associate_id uuid not null references public.profiles(id) on delete cascade,
  break_slot text not null check (break_slot in ('10:00', '11:00', '12:00')),
  -- Who covers this window during the break, when it needs covering.
  reliever_associate_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- A window breaks at most once a day.
create unique index if not exists break_assignments_day_window_key
  on public.break_assignments (assignment_date, window_id);

create index if not exists break_assignments_week_idx on public.break_assignments (schedule_week_id);
create index if not exists break_assignments_date_idx on public.break_assignments (assignment_date);
create index if not exists break_assignments_associate_idx on public.break_assignments (associate_id, assignment_date);

-- ---------------------------------------------------------------------------
-- RLS: everyone reads their team's breaks (the floor needs to see them);
-- only the Team Leader writes.
-- ---------------------------------------------------------------------------
alter table public.break_assignments enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'break_assignments' and policyname = 'break_assignments_select_all'
  ) then
    create policy "break_assignments_select_all"
      on public.break_assignments for select
      using (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'break_assignments' and policyname = 'break_assignments_write_team_leader'
  ) then
    create policy "break_assignments_write_team_leader"
      on public.break_assignments for all
      using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
      )
      with check (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Station manning priority. Lower number = filled first when short-staffed,
-- and protected hardest when handing out breaks. From the floor notes:
-- 1 Collecting Officer, 2 PACD, 3 Releasing Officer.
--
-- can_be_pulled: Screeners can be borrowed to fill other stations when short
-- (down to 2, worst case 1). is_reliever: Electronic Endorsement is not a
-- fixed post — it floats and covers whoever is on break.
-- ---------------------------------------------------------------------------
alter table public.workstations
  add column if not exists man_priority integer,
  add column if not exists can_be_pulled boolean not null default false,
  add column if not exists is_reliever boolean not null default false,
  add column if not exists min_manned integer not null default 1;

update public.workstations set man_priority = 1 where lower(trim(name)) = 'collecting officer' and man_priority is null;
update public.workstations set man_priority = 2 where lower(trim(name)) = 'pacd' and man_priority is null;
update public.workstations set man_priority = 3 where lower(trim(name)) = 'releasing officer' and man_priority is null;

-- Screeners are the flex pool: pullable, and only 1 must stay behind.
update public.workstations set can_be_pulled = true, min_manned = 1 where lower(trim(name)) = 'screener';

-- Electronic Endorsement floats as the reliever and is never pulled elsewhere.
update public.workstations set is_reliever = true, can_be_pulled = false where lower(trim(name)) = 'electronic endorsement';
