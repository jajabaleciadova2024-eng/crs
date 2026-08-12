-- Lets the applicant supply their PSID on the request-access form (e.g. if
-- already assigned by HR before onboarding), instead of the Team Leader
-- always having to type it fresh at approval time. Still editable/overridable
-- by the Team Leader when approving.

alter table public.access_requests
  add column psid text;
