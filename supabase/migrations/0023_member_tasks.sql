-- ============================================================================
-- Member Tasks — required tasks with optional deadline-based schedule blocking
-- ============================================================================

-- ---------------------------------------------------------------------------
-- member_tasks — tasks created by Team Leader, assigned to all or individual
-- ---------------------------------------------------------------------------
create table public.member_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  deadline date,
  assign_to text not null default 'all',           -- 'all' or a specific profile UUID
  blocker_days_before integer not null default 0,   -- days before deadline to activate blocking
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index member_tasks_assign_to_idx on public.member_tasks (assign_to);
create index member_tasks_deadline_idx on public.member_tasks (deadline);

alter table public.member_tasks enable row level security;

-- Everyone can read tasks
create policy "member_tasks_select" on public.member_tasks
  for select using (true);

-- Only team_leader can manage tasks
create policy "member_tasks_insert" on public.member_tasks
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );
create policy "member_tasks_update" on public.member_tasks
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );
create policy "member_tasks_delete" on public.member_tasks
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );

-- ---------------------------------------------------------------------------
-- member_task_completions — tracks who completed which task
-- ---------------------------------------------------------------------------
create table public.member_task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.member_tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  completed_at timestamptz not null default now(),
  unique (task_id, profile_id)
);

create index member_task_completions_task_idx on public.member_task_completions (task_id);
create index member_task_completions_profile_idx on public.member_task_completions (profile_id);

alter table public.member_task_completions enable row level security;

-- Everyone can read completions
create policy "completions_select" on public.member_task_completions
  for select using (true);

-- Any authenticated user can mark their own completion
create policy "completions_insert" on public.member_task_completions
  for insert with check (profile_id = auth.uid());

-- Users can un-complete their own, TL can un-complete anyone's
create policy "completions_delete" on public.member_task_completions
  for delete using (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
  );
