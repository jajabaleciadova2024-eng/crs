-- ============================================================================
-- Extend notification_type for events that previously had no notification:
--   task_assigned     — TL creates a task assigned to you (or to all)
--   leave_submitted   — an associate files a leave request (to approvers)
--   leave_reviewed    — your leave request was approved/rejected
--   schedule_published — a new week's schedule was generated
--   post_new          — someone published a new Team Feed post
-- ============================================================================

alter type public.notification_type add value if not exists 'task_assigned';
alter type public.notification_type add value if not exists 'leave_submitted';
alter type public.notification_type add value if not exists 'leave_reviewed';
alter type public.notification_type add value if not exists 'schedule_published';
alter type public.notification_type add value if not exists 'post_new';
