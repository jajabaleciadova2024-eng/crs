-- ============================================================================
-- Narrow OIC from "manage" to "view all, act on nothing" for workstations,
-- schedule generation/reassignment, and leave approve/reject. Team Leader
-- keeps full write access to all three; OIC keeps read access (still sees
-- all schedules/leave, just can't act) via the existing *_select_all /
-- leave_requests_select_own_or_leadership policies, which are untouched.
--
-- These policies are the actual enforcement layer, not just the UI: several
-- of these writes happen via direct client-side Supabase calls (schedule
-- reassign, workstation edit/add/retire) with no server route in between,
-- so RLS is what actually blocks OIC here, not just hidden buttons.
-- ============================================================================

drop policy "workstations_write_leadership" on public.workstations;
create policy "workstations_write_team_leader"
  on public.workstations for all
  using (public.current_role() = 'team_leader')
  with check (public.current_role() = 'team_leader');

drop policy "schedule_weeks_write_leadership" on public.schedule_weeks;
create policy "schedule_weeks_write_team_leader"
  on public.schedule_weeks for all
  using (public.current_role() = 'team_leader')
  with check (public.current_role() = 'team_leader');

drop policy "assignments_write_leadership" on public.assignments;
create policy "assignments_write_team_leader"
  on public.assignments for all
  using (public.current_role() = 'team_leader')
  with check (public.current_role() = 'team_leader');

drop policy "leave_requests_update_leadership_not_self" on public.leave_requests;
create policy "leave_requests_update_team_leader_not_self"
  on public.leave_requests for update
  using (public.current_role() = 'team_leader' and associate_id <> auth.uid())
  with check (public.current_role() = 'team_leader' and associate_id <> auth.uid());
