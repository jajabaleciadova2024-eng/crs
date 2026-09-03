-- ============================================================================
-- 0043 — drop exclusions that no longer mean anything
-- ============================================================================
-- Team Leaders stopped being assignable to tasks, so any of their ids sitting
-- in member_tasks.excluded_ids now excuse somebody who was never going to be
-- assigned. The edit modal counted them and could not show them — "1
-- excluded" with no name struck through — because the chip list no longer
-- contains that person.
--
-- The API refuses to store one now; this clears the ones already written, so
-- the count is right without waiting for each task to be edited and saved.
update public.member_tasks t
set excluded_ids = coalesce(
  (
    select array_agg(x)
    from unnest(t.excluded_ids) as x
    where exists (
      select 1 from public.profiles p
      where p.id = x and p.is_active and p.role <> 'team_leader'
    )
  ),
  '{}'::uuid[]
)
where exists (
  select 1 from unnest(t.excluded_ids) as x
  where not exists (
    select 1 from public.profiles p
    where p.id = x and p.is_active and p.role <> 'team_leader'
  )
);
