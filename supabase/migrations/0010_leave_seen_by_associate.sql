-- ============================================================================
-- Tracks whether the requesting associate has seen a decision (approve/
-- reject) on their own leave request yet, so the sidebar can show them a
-- badge on "Leave Requests" the same way the Team Leader gets one for
-- pending approvals. Defaults to true so existing rows don't retroactively
-- show a badge; the API route flips it to false when the Team Leader
-- decides a request, and the Leave Requests page flips it back to true
-- (via the service-role client) whenever the owner views it.
-- ============================================================================

alter table public.leave_requests
  add column seen_by_associate boolean not null default true;
