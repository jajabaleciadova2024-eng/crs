-- ============================================================================
-- 0041 — images on an announcement, and per-member exemptions on a task
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Announcement images
-- ---------------------------------------------------------------------------
-- An ordered list of storage paths rather than a child table: the images
-- belong wholly to the announcement, are never queried on their own, and
-- their order is the order the Team Leader attached them. An array keeps
-- them on the row the GET already selects, with no extra join.
alter table public.announcements
  add column if not exists image_paths text[] not null default '{}';

comment on column public.announcements.image_paths is
  'Ordered storage paths in the announcement-images bucket. Served as short-lived signed URLs — the bucket is private.';

-- Private bucket, same posture as task-photos and leave-documents: no
-- storage.objects policies exist at all, so there is no direct client
-- access. Every read is mediated by the API, which signs a URL only for a
-- signed-in member.
insert into storage.buckets (id, name, public)
values ('announcement-images', 'announcement-images', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Task exemptions
-- ---------------------------------------------------------------------------
-- assign_to answers "who is this for" with one value: 'all', or one member.
-- It cannot say "everyone except these three", which is what a Team Leader
-- needs after assigning a task to the whole team and then finding some of
-- them had already done it. Excusing them by hand had no expression at all:
-- the only options were to leave them chased for work they had finished, or
-- to delete the task and lose everyone else's submissions with it.
alter table public.member_tasks
  add column if not exists excluded_ids uuid[] not null default '{}';

comment on column public.member_tasks.excluded_ids is
  'Members exempted from this task. Applies on top of assign_to: they are not assigned it, not blocked by it, and cannot be nudged about it.';
