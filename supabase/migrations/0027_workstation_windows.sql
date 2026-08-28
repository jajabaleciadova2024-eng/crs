-- ============================================================================
-- Workstation windows
--
-- A station's headcount ("Collecting Officer = 4") was only ever a COUNT of
-- seats. In reality each station owns specific, physically numbered service
-- windows — CO is windows 10, 11, 12 and 13, not "four of something". The
-- numbers are non-contiguous (Releasing Officer is 18, 20, 21, 23 — there is
-- no 19 or 22), so they can't be derived from a count and have to be stored.
--
-- Labels are text, not integers: Electronic Endorsement's window is written
-- "EE" rather than a number. Ordering is handled in the app (numeric-aware,
-- see src/lib/windowOrder.ts) so 8 sorts before 10 instead of after it.
--
-- headcount stays on workstations for now — nothing reads windows yet, and
-- switching assignment over to windows is a separate change.
-- ============================================================================

create table if not exists public.workstation_windows (
  id uuid primary key default gen_random_uuid(),
  workstation_id uuid not null references public.workstations(id) on delete cascade,
  -- "27", "10", "EE" — a physical window's real-world label.
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- A physical window exists once on the floor, so its label is unique
-- org-wide, not just within its station.
create unique index if not exists workstation_windows_label_key
  on public.workstation_windows (lower(label));

create index if not exists workstation_windows_station_idx
  on public.workstation_windows (workstation_id);

-- ---------------------------------------------------------------------------
-- RLS: everyone reads (same as workstations — the schedule grid will need
-- them), only the Team Leader writes.
-- ---------------------------------------------------------------------------
alter table public.workstation_windows enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'workstation_windows' and policyname = 'workstation_windows_select_all'
  ) then
    create policy "workstation_windows_select_all"
      on public.workstation_windows for select
      using (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'workstation_windows' and policyname = 'workstation_windows_write_team_leader'
  ) then
    create policy "workstation_windows_write_team_leader"
      on public.workstation_windows for all
      using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
      )
      with check (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed the real floor layout. Matched on station name case-insensitively;
-- skips any station that isn't present, and any label already recorded, so
-- this is safe to re-run.
-- ---------------------------------------------------------------------------
insert into public.workstation_windows (workstation_id, label)
select w.id, v.label
from (values
  ('screener', '27'),
  ('screener', '28'),
  ('screener', '29'),
  ('collecting officer', '10'),
  ('collecting officer', '11'),
  ('collecting officer', '12'),
  ('collecting officer', '13'),
  ('premium annotation', '8'),
  ('premium annotation', '9'),
  ('pacd', '15'),
  ('releasing officer', '18'),
  ('releasing officer', '20'),
  ('releasing officer', '21'),
  ('releasing officer', '23'),
  ('electronic endorsement', 'EE')
) as v(station, label)
join public.workstations w on lower(trim(w.name)) = v.station
where not exists (
  select 1 from public.workstation_windows x where lower(x.label) = lower(v.label)
);
