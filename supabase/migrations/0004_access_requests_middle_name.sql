-- Adds middle name to access_requests, matching profiles' middle_name field
-- so approved requests carry the full name through to the created profile.

alter table public.access_requests
  add column middle_name text;
