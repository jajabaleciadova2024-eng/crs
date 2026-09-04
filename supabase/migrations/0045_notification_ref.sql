-- ============================================================================
-- 0045 — tie a notification to the thing it is about
-- ============================================================================
-- A notification carried who and what type, never WHICH. So nothing could
-- answer "has this been dealt with?", and a notice stayed unread until
-- somebody clicked it by hand — the bell kept counting work that was already
-- finished while the sidebar badge beside it, which is a live query, had
-- already dropped to zero. The two disagreed permanently.
--
-- ref_id points at whatever the notification is about: a completion, a leave
-- request, a password reset, a task. Deliberately NO foreign key — the target
-- table differs by type, and a notice should survive the row it refers to
-- (a deleted task's "submitted" notice becomes history, not an error).

alter table public.notifications
  add column if not exists ref_id uuid;

comment on column public.notifications.ref_id is
  'The row this notification is about — completion, leave request, password reset, task. No FK: the table varies by type.';

-- Resolving a notice looks it up by (type, ref_id), so that is the index.
create index if not exists notifications_ref_idx
  on public.notifications (type, ref_id)
  where ref_id is not null;
