-- ============================================================================
-- 0044 — more than one proof photo per submission
-- ============================================================================
-- photo_path held exactly one image, so a member proving two things — a
-- course certificate and the completion screen, say — had to pick which one
-- to send. An ordered array instead, in the order they attached them.
--
-- photo_path is kept and still written with the FIRST path. Two reasons: a
-- page loaded before this deploy keeps working, and nothing that reads it
-- (the CSV export's "WITH CERTIFICATE OF COMPLETION" column, the roster
-- table's "no photo attached" note) has to change in the same breath.

alter table public.member_task_completions
  add column if not exists photo_paths text[] not null default '{}';

comment on column public.member_task_completions.photo_paths is
  'Proof images in attachment order. photo_path mirrors the first for backward compatibility.';

-- Existing single uploads become one-element arrays.
update public.member_task_completions
set photo_paths = array[photo_path]
where photo_path is not null and cardinality(photo_paths) = 0;
