-- ============================================================================
-- "Poke": a Team Leader nudge for an outstanding task
-- ============================================================================
-- Fired from the Task Report against a member who has not submitted (or was
-- declined). Lands in their notification bell and links to /tasks.
--
-- Enum values cannot be added inside a transaction that then uses them in
-- the same statement batch on older Postgres, so this is deliberately its
-- own migration with nothing else in it.

alter type public.notification_type add value if not exists 'task_poke';
