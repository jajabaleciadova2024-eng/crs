-- ============================================================================
-- Member Tasks: an optional "when did you actually do this?" date
-- ============================================================================
-- Sits alongside requires_approval and requires_photo from 0030 as the third
-- per-task switch the Team Leader sets when creating the task.
--
-- Distinct from completed_at, which is when the row was submitted. This is
-- the date the member says the work was actually done, which can be earlier
-- (installed the app on Monday, got round to ticking the box on Thursday).

alter table public.member_tasks
  add column if not exists requires_completion_date boolean not null default false;

alter table public.member_task_completions
  add column if not exists completion_date date;
