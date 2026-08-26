-- ============================================================================
-- Task completion approval flow + schedule reveal timing notifications
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Add approval columns to member_task_completions (idempotent)
-- ---------------------------------------------------------------------------
alter table public.member_task_completions
  add column if not exists status text not null default 'pending',
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz;

create index if not exists member_task_completions_status_idx on public.member_task_completions (status);

-- TL can update completions (approve/reject)
do $$ begin
  if not exists (
    select 1 from pg_policies where policyname = 'completions_update_tl' and tablename = 'member_task_completions'
  ) then
    create policy "completions_update_tl" on public.member_task_completions
      for update using (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'team_leader')
      );
  end if;
end $$;

-- Backfill any existing completion rows as approved (they were auto-complete before)
update public.member_task_completions set status = 'approved' where status = 'pending';

-- ---------------------------------------------------------------------------
-- Extend notification_type enum for task notifications
-- ---------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'task_submitted';
alter type public.notification_type add value if not exists 'task_reviewed';
