-- Lets the Team Leader delete ANY leave request (pending, approved, or
-- rejected) — e.g. removing an approved leave that was entered in error.
-- The existing "leave_requests_delete_own_pending" policy stays as-is for
-- an associate cancelling their own still-pending request; this is
-- additive (Postgres RLS OR's together all policies for the same command).
create policy "leave_requests_delete_team_leader"
  on public.leave_requests for delete
  using (public.current_role() = 'team_leader');
