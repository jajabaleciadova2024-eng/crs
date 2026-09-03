-- ============================================================================
-- MFA / passkey proof screenshots
-- ============================================================================
-- MFA is mandatory and must be evidenced: without an MFA screenshot on file a
-- member cannot report a password reset, and the Team Leader cannot confirm
-- one. The passkey is strongly wanted but not a gate — a member with MFA but
-- no passkey can still be confirmed.
--
-- Both live in the existing private password-proofs bucket.

alter table public.credential_status
  add column if not exists mfa_proof_path      text,
  add column if not exists passkey_proof_path  text;
