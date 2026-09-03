-- ============================================================================
-- Member Tasks: per-task approval + photo proof, and feedback on a decline
-- ============================================================================
-- Three additions, all idempotent so a partial earlier run is safe:
--
-- 1. member_tasks.requires_approval — whether a submission needs the Team
--    Leader to sign off. Defaults TRUE, which is exactly how every task
--    behaved before this migration, so existing rows are unchanged.
-- 2. member_tasks.requires_photo — whether the member must attach a photo
--    as proof when submitting.
-- 3. member_task_completions.photo_path + review_note — the uploaded proof,
--    and the Team Leader's reason when declining (mirrors the leave
--    request's review_note, which the member sees on the rejected row).

alter table public.member_tasks
  add column if not exists requires_approval boolean not null default true,
  add column if not exists requires_photo    boolean not null default false;

alter table public.member_task_completions
  add column if not exists photo_path  text,
  add column if not exists review_note text;

-- Private bucket for task proof photos. No storage.objects policies on
-- purpose — same posture as leave-documents: zero direct client access,
-- every read goes through an API route that checks "are you the owner, or
-- the Team Leader?" before it will mint a short-lived signed URL.
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', false)
on conflict (id) do nothing;
