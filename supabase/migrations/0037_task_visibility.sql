-- ============================================================================
-- Task rows are not public to the whole team
-- ============================================================================
-- 0023 gave both task tables `select using (true)`, so any signed-in member
-- could read, straight from the browser:
--   * every other member's completions, including the review_note — which is
--     the Team Leader's decline reason written to that person;
--   * tasks assigned individually to somebody else.
--
-- Same class of leak as the credential board fixed in 0036. Every read in the
-- app goes through the service-role client, which bypasses RLS, so no page
-- changes behaviour — this only closes the direct client path.

drop policy if exists "member_task_completions_select" on public.member_task_completions;
drop policy if exists "completions_select" on public.member_task_completions;
create policy "completions_select_own_or_tl" on public.member_task_completions
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );

-- A task assigned to everyone stays visible to everyone; one assigned to a
-- named person is that person's business and the Team Leader's.
drop policy if exists "member_tasks_select" on public.member_tasks;
create policy "member_tasks_select_relevant" on public.member_tasks
  for select using (
    assign_to = 'all'
    or assign_to = auth.uid()::text
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );
