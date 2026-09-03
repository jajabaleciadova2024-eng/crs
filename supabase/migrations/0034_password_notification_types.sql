-- Enum additions live alone: a value added to an enum cannot be used by
-- other statements in the same transaction on older Postgres.
alter type public.notification_type add value if not exists 'password_reset_submitted';
alter type public.notification_type add value if not exists 'password_reset_reviewed';
alter type public.notification_type add value if not exists 'password_expiring';
