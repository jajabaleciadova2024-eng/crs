-- ============================================================================
-- Roster & Leave — initial schema
-- Roles: team_leader (highest) > oic > associate
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('team_leader', 'oic', 'associate');
create type public.leave_type as enum ('sick', 'vacation', 'emergency', 'other');
create type public.leave_status as enum ('pending', 'approved', 'rejected');
create type public.schedule_cadence as enum ('weekly', 'biweekly');

-- ---------------------------------------------------------------------------
-- profiles — one row per auth.users, holds roster + role info
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  psid text not null unique,
  first_name text not null,
  middle_name text,
  last_name text not null,
  email text not null unique,
  mobile_number text,
  role public.app_role not null default 'associate',
  is_immune boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_psid_idx on public.profiles (psid);

-- ---------------------------------------------------------------------------
-- workstations
-- ---------------------------------------------------------------------------
create table public.workstations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- schedule_weeks + assignments
-- ---------------------------------------------------------------------------
create table public.schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,
  generated_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  schedule_week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  workstation_id uuid not null references public.workstations (id) on delete cascade,
  associate_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (schedule_week_id, workstation_id),
  unique (schedule_week_id, associate_id)
);

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  associate_id uuid not null references public.profiles (id) on delete cascade,
  leave_type public.leave_type not null,
  start_date date not null,
  end_date date not null,
  reason text,
  status public.leave_status not null default 'pending',
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_dates_valid check (end_date >= start_date)
);

create index leave_requests_associate_idx on public.leave_requests (associate_id);
create index leave_requests_status_idx on public.leave_requests (status);

-- ---------------------------------------------------------------------------
-- org_settings — single row, Team Leader editable
-- ---------------------------------------------------------------------------
create table public.org_settings (
  id uuid primary key default gen_random_uuid(),
  schedule_cadence public.schedule_cadence not null default 'weekly',
  leave_types text[] not null default array['sick', 'vacation', 'emergency', 'other'],
  require_leave_reason boolean not null default true,
  approver_roles public.app_role[] not null default array['team_leader', 'oic']::public.app_role[],
  updated_at timestamptz not null default now()
);

-- seed the single settings row
insert into public.org_settings (schedule_cadence) values ('weekly');

-- ---------------------------------------------------------------------------
-- notification_prefs — one row per profile
-- ---------------------------------------------------------------------------
create table public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  on_own_leave_status_change boolean not null default true,
  on_schedule_published boolean not null default true,
  on_new_leave_to_review boolean not null default true,
  remind_pending_after_hours int,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Helper functions
-- ============================================================================

-- Returns the role of the currently authenticated user (bypasses RLS via
-- security definer so policies below can call it without recursion).
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_leader_or_oic()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('team_leader', 'oic');
$$;

-- PSID -> email lookup, used by the login page so users can sign in with
-- either their PSID or their email. SECURITY DEFINER so it can be queried
-- pre-auth from a public (anon-key) client without exposing the whole table.
create or replace function public.email_for_psid(lookup_psid text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.profiles where psid = lookup_psid and is_active = true;
$$;

grant execute on function public.email_for_psid(text) to anon, authenticated;

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger org_settings_set_updated_at
  before update on public.org_settings
  for each row execute function public.set_updated_at();

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.workstations enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.assignments enable row level security;
alter table public.leave_requests enable row level security;
alter table public.org_settings enable row level security;
alter table public.notification_prefs enable row level security;

-- ---- profiles ----
create policy "profiles_select_own_or_leadership"
  on public.profiles for select
  using (id = auth.uid() or public.is_leader_or_oic());

create policy "profiles_update_own_basic_fields"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_team_leader_full_write"
  on public.profiles for all
  using (public.current_role() = 'team_leader')
  with check (public.current_role() = 'team_leader');

-- ---- workstations ----
create policy "workstations_select_all"
  on public.workstations for select
  using (auth.uid() is not null);

create policy "workstations_write_leadership"
  on public.workstations for all
  using (public.is_leader_or_oic())
  with check (public.is_leader_or_oic());

-- ---- schedule_weeks ----
create policy "schedule_weeks_select_all"
  on public.schedule_weeks for select
  using (auth.uid() is not null);

create policy "schedule_weeks_write_leadership"
  on public.schedule_weeks for all
  using (public.is_leader_or_oic())
  with check (public.is_leader_or_oic());

-- ---- assignments ----
create policy "assignments_select_all"
  on public.assignments for select
  using (auth.uid() is not null);

create policy "assignments_write_leadership"
  on public.assignments for all
  using (public.is_leader_or_oic())
  with check (public.is_leader_or_oic());

-- ---- leave_requests ----
create policy "leave_requests_select_own_or_leadership"
  on public.leave_requests for select
  using (associate_id = auth.uid() or public.is_leader_or_oic());

create policy "leave_requests_insert_own"
  on public.leave_requests for insert
  with check (associate_id = auth.uid());

create policy "leave_requests_update_leadership_not_self"
  on public.leave_requests for update
  using (public.is_leader_or_oic() and associate_id <> auth.uid())
  with check (public.is_leader_or_oic() and associate_id <> auth.uid());

-- ---- org_settings ----
create policy "org_settings_select_all"
  on public.org_settings for select
  using (auth.uid() is not null);

create policy "org_settings_write_team_leader"
  on public.org_settings for update
  using (public.current_role() = 'team_leader')
  with check (public.current_role() = 'team_leader');

-- ---- notification_prefs ----
create policy "notification_prefs_select_own"
  on public.notification_prefs for select
  using (profile_id = auth.uid());

create policy "notification_prefs_write_own"
  on public.notification_prefs for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================================
-- Member provisioning note:
-- The /team "add member" flow (server-side, service role) does this in order:
--   1. supabase.auth.admin.inviteUserByEmail(email) -> creates the auth.users
--      row and emails the invite link; returns the new user's id.
--   2. insert into public.profiles using that same id, with PSID/name/
--      mobile/role supplied by the Team Leader.
-- Because the profiles row is created *after* the real auth.users id exists,
-- no separate id-reconciliation trigger is needed. We still auto-provision a
-- notification_prefs row whenever a profile is created, so /settings has
-- somewhere to read/write defaults immediately.
-- ============================================================================
create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_prefs (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();
