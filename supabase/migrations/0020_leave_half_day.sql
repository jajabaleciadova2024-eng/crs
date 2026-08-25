-- Adds a "Half Day" flag to leave requests, set via a checkbox on the
-- filing form (and editable while still pending). Purely descriptive —
-- doesn't affect date-range logic, conflict checking, or any day-counting
-- (this app has no leave-balance system to adjust).
alter table leave_requests
  add column if not exists is_half_day boolean not null default false;
