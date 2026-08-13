-- ============================================================================
-- Lets the Team Leader attach a short note when rejecting a leave request,
-- so the associate knows why -- surfaced in the Queue/History status
-- column and in the rejection email (see src/lib/notify.ts).
-- ============================================================================

alter table public.leave_requests
  add column review_note text;
