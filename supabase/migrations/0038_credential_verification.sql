-- ============================================================================
-- The Team Leader verifies MFA and passkey proofs
-- ============================================================================
-- Until now a green tick meant only "a file was uploaded": the member
-- self-certified, and the Team Leader never saw it. A tick has to mean it was
-- checked, so both proofs get their own review state, mirroring the reset's.
--
-- Uploading (or replacing) a proof leaves it UNVERIFIED — a new file has not
-- been looked at, whatever the old one's state was. That is enforced in the
-- upload route, not just here.

alter table public.credential_status
  add column if not exists mfa_verified          boolean not null default false,
  add column if not exists mfa_verified_by       uuid references public.profiles(id),
  add column if not exists mfa_verified_at       timestamptz,
  add column if not exists mfa_review_note       text,
  add column if not exists passkey_verified      boolean not null default false,
  add column if not exists passkey_verified_by   uuid references public.profiles(id),
  add column if not exists passkey_verified_at   timestamptz,
  add column if not exists passkey_review_note   text;
