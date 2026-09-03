-- ============================================================================
-- Credential status is Team-Leader-only, not a shared board
-- ============================================================================
-- 0033 opened both tables to every authenticated reader on the theory that
-- the team would police itself. That was wrong: a member's MFA state, their
-- password expiry and their reset screenshots are their own business, and
-- only the Team Leader has any reason to see everybody's.
--
-- The app reads these through the service-role client, which bypasses RLS,
-- so this does not change what any page renders — it closes the direct
-- client path, without which hiding the panel in the UI would be theatre.

drop policy if exists "credential_status_select" on public.credential_status;
create policy "credential_status_select_own_or_tl" on public.credential_status
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );

drop policy if exists "password_resets_select" on public.password_resets;
create policy "password_resets_select_own_or_tl" on public.password_resets
  for select using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );
