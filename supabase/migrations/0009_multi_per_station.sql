-- Allows more than one associate per workstation per week, so the Team
-- Leader can set a headcount > 1 per station when generating a schedule
-- (see /schedule's "Generate next week" quota modal). An associate can
-- still only be assigned to ONE station per week — that constraint stays.

alter table public.assignments
  drop constraint if exists assignments_schedule_week_id_workstation_id_key;
