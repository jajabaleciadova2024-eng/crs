-- ============================================================================
-- Notification types for events that were happening silently
-- ============================================================================
-- Each of these affects somebody who was never told:
--   schedule_changed  — a manual move/swap/removal, or a holiday wiping a
--                       day, changes where a member sits. They found out by
--                       turning up at the wrong window.
--   leave_updated     — a member edits a pending request, or uploads the
--                       document the Team Leader was waiting on. The request
--                       otherwise sits looking unchanged.
--   credential_proof_submitted — an MFA or passkey screenshot needing the
--                       Team Leader's verification, which gates that
--                       member's next password reset.
--   password_expiring — fired by cron when a password enters its warning or
--                       blocking window. The type already existed and had
--                       never once been sent.

alter type public.notification_type add value if not exists 'schedule_changed';
alter type public.notification_type add value if not exists 'leave_updated';
alter type public.notification_type add value if not exists 'credential_proof_submitted';
