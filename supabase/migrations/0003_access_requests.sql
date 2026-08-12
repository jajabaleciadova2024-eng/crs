-- ============================================================================
-- Self-service access requests
-- Public "Request access" form on /login inserts here (no auth). Team
-- Leader reviews from /access-requests; approving invites the person the
-- same way /team's "Add member" does.
-- ============================================================================

create type public.access_request_status as enum ('pending', 'approved', 'rejected');

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  mobile_number text,
  message text,
  status public.access_request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index access_requests_status_idx on public.access_requests (status);

alter table public.access_requests enable row level security;

-- Anyone (including anon, pre-auth) can submit a request.
create policy "access_requests_insert_anyone"
  on public.access_requests for insert
  with check (true);

-- Only Team Leader/OIC can see or act on requests.
create policy "access_requests_select_leadership"
  on public.access_requests for select
  using (public.is_leader_or_oic());

create policy "access_requests_update_leadership"
  on public.access_requests for update
  using (public.is_leader_or_oic())
  with check (public.is_leader_or_oic());
