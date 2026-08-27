-- ============================================================================
-- Station assignment audit trail
--
-- Assignments are mutable and, worse, DESTRUCTIBLE: clearing a schedule week
-- deletes the schedule_weeks row, which cascades every assignment under it
-- out of existence. Regenerating a week does the same. That makes it
-- impossible to answer "who was at Collecting Officer on March 8?" after the
-- fact — exactly the question an incident investigation asks.
--
-- This is an append-only log written by a trigger rather than from the API
-- routes, so it captures EVERY path that touches assignments (all four
-- schedule routes, future code, and manual SQL) instead of only the ones we
-- remembered to instrument.
--
-- Names are denormalized on purpose: a workstation can be renamed or
-- deactivated and a profile can be deactivated, but the history must still
-- read correctly years later. The id columns keep the join available while
-- the rows survive; the text columns keep it legible when they don't.
-- ============================================================================

create table if not exists public.assignment_history (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately NOT a foreign key: the assignment this describes is
  -- usually gone by the time anyone reads the history.
  assignment_id uuid,
  action text not null check (action in ('assigned', 'moved', 'reassigned', 'removed')),
  assignment_date date not null,
  schedule_week_id uuid,

  workstation_id uuid,
  workstation_name text,
  associate_id uuid,
  associate_name text,

  -- Populated for 'moved' / 'reassigned' so a row shows what changed.
  previous_workstation_id uuid,
  previous_workstation_name text,
  previous_associate_id uuid,
  previous_associate_name text,

  changed_by uuid references public.profiles(id),
  changed_by_name text,
  changed_at timestamptz not null default now()
);

create index if not exists assignment_history_date_idx on public.assignment_history (assignment_date desc);
create index if not exists assignment_history_associate_idx on public.assignment_history (associate_id, assignment_date desc);
create index if not exists assignment_history_workstation_idx on public.assignment_history (workstation_id, assignment_date desc);
create index if not exists assignment_history_changed_at_idx on public.assignment_history (changed_at desc);

-- ---------------------------------------------------------------------------
-- Trigger: record every insert / update / delete on assignments
-- ---------------------------------------------------------------------------
create or replace function public.log_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_actor uuid := auth.uid();
begin
  if (tg_op = 'INSERT') then
    v_action := 'assigned';
  elsif (tg_op = 'DELETE') then
    v_action := 'removed';
  else
    -- Nothing we track actually changed — don't write a noise row.
    if new.associate_id is not distinct from old.associate_id
       and new.workstation_id is not distinct from old.workstation_id
       and new.assignment_date is not distinct from old.assignment_date then
      return new;
    end if;
    if new.associate_id is distinct from old.associate_id then
      v_action := 'reassigned';
    else
      v_action := 'moved';
    end if;
  end if;

  if (tg_op = 'DELETE') then
    insert into public.assignment_history (
      assignment_id, action, assignment_date, schedule_week_id,
      workstation_id, workstation_name, associate_id, associate_name,
      changed_by, changed_by_name
    )
    select
      old.id, v_action, old.assignment_date, old.schedule_week_id,
      old.workstation_id, w.name, old.associate_id,
      trim(both ' ' from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
      v_actor,
      trim(both ' ' from coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, ''))
    from (select 1) dummy
    left join public.workstations w on w.id = old.workstation_id
    left join public.profiles p on p.id = old.associate_id
    left join public.profiles a on a.id = v_actor;
    return old;
  end if;

  insert into public.assignment_history (
    assignment_id, action, assignment_date, schedule_week_id,
    workstation_id, workstation_name, associate_id, associate_name,
    previous_workstation_id, previous_workstation_name,
    previous_associate_id, previous_associate_name,
    changed_by, changed_by_name
  )
  select
    new.id, v_action, new.assignment_date, new.schedule_week_id,
    new.workstation_id, w.name, new.associate_id,
    trim(both ' ' from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
    case when tg_op = 'UPDATE' then old.workstation_id end,
    case when tg_op = 'UPDATE' then pw.name end,
    case when tg_op = 'UPDATE' then old.associate_id end,
    case when tg_op = 'UPDATE'
      then trim(both ' ' from coalesce(pp.first_name, '') || ' ' || coalesce(pp.last_name, '')) end,
    v_actor,
    trim(both ' ' from coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, ''))
  from (select 1) dummy
  left join public.workstations w on w.id = new.workstation_id
  left join public.profiles p on p.id = new.associate_id
  left join public.workstations pw on pw.id = (case when tg_op = 'UPDATE' then old.workstation_id end)
  left join public.profiles pp on pp.id = (case when tg_op = 'UPDATE' then old.associate_id end)
  left join public.profiles a on a.id = v_actor;

  return new;
end;
$$;

drop trigger if exists assignments_audit on public.assignments;
create trigger assignments_audit
  after insert or update or delete on public.assignments
  for each row execute function public.log_assignment_change();

-- ---------------------------------------------------------------------------
-- RLS: leadership reads it; nobody writes, updates, or deletes it directly.
-- The trigger is SECURITY DEFINER, so it inserts regardless of these policies
-- — which is the point: the log must not be editable by the people it audits.
-- ---------------------------------------------------------------------------
alter table public.assignment_history enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'assignment_history' and policyname = 'assignment_history_select_leadership'
  ) then
    create policy "assignment_history_select_leadership"
      on public.assignment_history for select
      using (
        exists (
          select 1 from public.profiles
          where id = auth.uid() and role in ('team_leader', 'oic')
        )
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed the log from whatever assignments exist right now, so history doesn't
-- start empty and the current schedule is traceable from day one.
-- ---------------------------------------------------------------------------
insert into public.assignment_history (
  assignment_id, action, assignment_date, schedule_week_id,
  workstation_id, workstation_name, associate_id, associate_name,
  changed_by, changed_by_name, changed_at
)
select
  a.id, 'assigned', a.assignment_date, a.schedule_week_id,
  a.workstation_id, w.name, a.associate_id,
  trim(both ' ' from coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
  null, null, a.created_at
from public.assignments a
left join public.workstations w on w.id = a.workstation_id
left join public.profiles p on p.id = a.associate_id
where not exists (
  select 1 from public.assignment_history h where h.assignment_id = a.id
);
