-- ============================================================================
-- Associate tenure grouping
-- Adds a Team-Leader-managed label distinguishing tenured associates from
-- new hires. Manual only (no auto-promotion by date). Not yet consumed by
-- any scheduling logic — captured now so the auto-shuffle algorithm can use
-- it later once the exact rule is decided.
-- ============================================================================

create type public.tenure_group as enum ('new_hire', 'tenured');

alter table public.profiles
  add column tenure_group public.tenure_group not null default 'new_hire';

-- No new RLS policies needed: this column rides on the existing
-- profiles_select_own_or_leadership / profiles_team_leader_full_write
-- policies from 0001_init.sql.
