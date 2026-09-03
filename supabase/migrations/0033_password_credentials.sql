-- ============================================================================
-- Password / credential monitoring for the external platform
-- ============================================================================
-- Rule 1 on the floor is that nobody's password is ever allowed to lapse.
-- The platform itself is managed elsewhere; this is a synchronised view of it
-- so members can act on their own account and the Team Leader can oversee
-- every expiry in one place.
--
-- Password lifetime is 60 days from the moment it is reset. The clock is
-- restarted only when the Team Leader CONFIRMS a member's reset, never by the
-- member's own claim — otherwise the countdown records an intention rather
-- than a verified fact.

-- One row per member: the current state of their platform credentials.
create table if not exists public.credential_status (
  profile_id            uuid primary key references public.profiles(id) on delete cascade,
  -- Null until a first reset is confirmed (or the Team Leader seeds a
  -- baseline for someone who was already set up before this existed).
  last_reset_at         timestamptz,
  -- MFA is mandatory and takes priority; the passkey is mandatory second.
  mfa_configured        boolean not null default false,
  mfa_confirmed_at      timestamptz,
  passkey_configured    boolean not null default false,
  passkey_confirmed_at  timestamptz,
  updated_at            timestamptz not null default now()
);

alter table public.credential_status enable row level security;

-- Everyone can read everyone's status: this is a shared compliance board,
-- and members chase each other on it as much as the Team Leader does.
create policy "credential_status_select" on public.credential_status
  for select using (true);

-- Writes always go through the API routes (service role), which decide who
-- may change what. No direct client write path.
create policy "credential_status_write_tl" on public.credential_status
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );

-- A member's claim that they have reset, with a screenshot as proof, and the
-- Team Leader's decision on it. Kept as a log rather than a single mutable
-- row so the reset history stays auditable.
create table if not exists public.password_resets (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  submitted_at    timestamptz not null default now(),
  -- The moment the member says the reset happened; the 60 days run from here
  -- once confirmed, not from when the Team Leader got round to reviewing it.
  reset_at        timestamptz not null,
  proof_path      text,
  status          text not null default 'pending',
  reviewed_by     uuid references public.profiles(id),
  reviewed_at     timestamptz,
  review_note     text
);

create index if not exists password_resets_profile_idx on public.password_resets (profile_id);
create index if not exists password_resets_status_idx  on public.password_resets (status);

alter table public.password_resets enable row level security;

create policy "password_resets_select" on public.password_resets
  for select using (true);

create policy "password_resets_write_tl" on public.password_resets
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );

-- Private bucket for reset screenshots. Same posture as leave-documents and
-- task-photos: no storage.objects policies at all, so there is no direct
-- client access — every read goes through an API route that authorises the
-- caller first and then mints a short-lived signed URL.
insert into storage.buckets (id, name, public)
values ('password-proofs', 'password-proofs', false)
on conflict (id) do nothing;
