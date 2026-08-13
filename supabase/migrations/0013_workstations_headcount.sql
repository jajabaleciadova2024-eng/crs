-- Fixed per-station headcount, set once on the Workstations page instead of
-- re-typed every time in the "Generate next week" modal. The modal now only
-- lets the Team Leader split this fixed number into Tenured/New Hire.
alter table workstations add column if not exists headcount integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workstations_headcount_positive'
  ) then
    alter table workstations add constraint workstations_headcount_positive check (headcount > 0);
  end if;
end $$;
