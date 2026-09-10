-- Tracks how many logins each member has been shown the automatic
-- leave-filing reminder for a given coverage period (e.g. "2026-09-15").
-- Same 3-showings-per-login pattern as announcement_seen (see 0040).
create table if not exists leave_reminder_seen (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  period text not null,
  view_count integer not null default 1,
  last_shown_login timestamptz,
  seen_at timestamptz not null default now(),
  unique (profile_id, period)
);

alter table leave_reminder_seen enable row level security;

create policy "leave_reminder_seen_select_own"
  on leave_reminder_seen for select
  using (profile_id = auth.uid());

create policy "leave_reminder_seen_insert_own"
  on leave_reminder_seen for insert
  with check (profile_id = auth.uid());

create policy "leave_reminder_seen_update_own"
  on leave_reminder_seen for update
  using (profile_id = auth.uid());
