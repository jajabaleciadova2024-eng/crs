-- ============================================================================
-- 0048 — sample photos on a task: a guide for the proof members upload
-- ============================================================================
-- A task can require a photo as proof (0030), but nothing said what that
-- photo should actually show. Every member guessed, and the Team Leader
-- spent the review queue declining submissions that were of the right work
-- photographed the wrong way — a screen instead of the logbook, the whole
-- room instead of the counter.
--
-- These are the Team Leader's own example images, attached when the task is
-- created and shown to everyone it is assigned to, right where they pick
-- their own photo.
--
-- An ordered array rather than a child table, for the same reasons as
-- announcements.image_paths (0041): the samples belong wholly to the task,
-- are never queried on their own, and their order is the order they were
-- attached. They sit on the row every task query already selects.
alter table public.member_tasks
  add column if not exists sample_photo_paths text[] not null default '{}';

comment on column public.member_tasks.sample_photo_paths is
  'Ordered storage paths in the task-samples bucket — example images showing members what to upload as proof. Served as signed URLs; the bucket is private.';

-- Private bucket, same posture as task-photos and announcement-images: no
-- storage.objects policies exist at all, so there is no direct client
-- access. Every read is a signed URL minted server-side for a signed-in
-- member.
--
-- Separate from task-photos on purpose. These are the Team Leader's
-- instructions, readable by everyone the task is for; the photos in
-- task-photos are one member's evidence, readable only by them and the
-- Team Leader. Two audiences, two buckets.
insert into storage.buckets (id, name, public)
values ('task-samples', 'task-samples', false)
on conflict (id) do nothing;
