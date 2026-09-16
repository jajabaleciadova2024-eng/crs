-- Notification types for the daily task-deadline reminder cron: a task due
-- today/tomorrow (task_due) and a task past its deadline (task_overdue).
alter type public.notification_type add value if not exists 'task_due';
alter type public.notification_type add value if not exists 'task_overdue';
