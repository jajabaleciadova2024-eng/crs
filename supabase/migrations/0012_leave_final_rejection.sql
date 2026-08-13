-- ============================================================================
-- Lets the Team Leader end the reject -> re-upload -> re-review cycle on a
-- pre-approved-type (Sick/Bereavement) request for good, instead of it
-- being reopenable forever every time the associate uploads a new
-- document. A normal rejection (final_rejection = false, the default)
-- still reopens for re-review once a document shows up, same as before;
-- a final rejection (final_rejection = true) never does, regardless of
-- what gets uploaded afterward.
-- ============================================================================

alter table public.leave_requests
  add column final_rejection boolean not null default false;
