-- ============================================================================
-- Tickets / Concerns — anonymous incident reports from any member.
-- Only the Team Leader can see & reply; the reporter stays anonymous.
-- Both sides can exchange messages in a private thread.
-- Supports multiple file attachments (images, videos, docs).
-- ============================================================================

-- ticket_status enum
create type public.ticket_status as enum ('open', 'closed');

-- ---------------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------------
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (char_length(subject) > 0 and char_length(subject) <= 200),
  description text not null check (char_length(description) > 0 and char_length(description) <= 10000),
  status public.ticket_status not null default 'open',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tickets_created_at_idx on public.tickets (created_at desc);
create index tickets_reporter_id_idx on public.tickets (reporter_id);
create index tickets_status_idx on public.tickets (status);

-- ---------------------------------------------------------------------------
-- ticket_attachments — files attached to the initial report
-- ---------------------------------------------------------------------------
create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id);

-- ---------------------------------------------------------------------------
-- ticket_messages — private conversation between reporter & TL
-- ---------------------------------------------------------------------------
create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

create trigger ticket_messages_set_updated_at
  before update on public.ticket_messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tickets enable row level security;
alter table public.ticket_attachments enable row level security;
alter table public.ticket_messages enable row level security;

-- tickets: reporter can see own; TL can see all
create policy "tickets_select_own"
  on public.tickets for select
  using (reporter_id = auth.uid());

create policy "tickets_select_leader"
  on public.tickets for select
  using (public.current_role() = 'team_leader');

-- tickets: any authenticated user can create (they're the reporter)
create policy "tickets_insert_own"
  on public.tickets for insert
  with check (reporter_id = auth.uid());

-- tickets: TL can update (close/reopen); reporter cannot edit
create policy "tickets_update_leader"
  on public.tickets for update
  using (public.current_role() = 'team_leader')
  with check (public.current_role() = 'team_leader');

-- attachments: reporter (via ticket ownership) and TL can read
create policy "ticket_attachments_select_own"
  on public.ticket_attachments for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.reporter_id = auth.uid()
    )
  );

create policy "ticket_attachments_select_leader"
  on public.ticket_attachments for select
  using (public.current_role() = 'team_leader');

-- attachments: reporter inserts when creating ticket
create policy "ticket_attachments_insert_own"
  on public.ticket_attachments for insert
  with check (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.reporter_id = auth.uid()
    )
  );

-- messages: reporter and TL can read messages on tickets they have access to
create policy "ticket_messages_select_own"
  on public.ticket_messages for select
  using (
    exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.reporter_id = auth.uid()
    )
  );

create policy "ticket_messages_select_leader"
  on public.ticket_messages for select
  using (public.current_role() = 'team_leader');

-- messages: reporter and TL can send messages
create policy "ticket_messages_insert_own"
  on public.ticket_messages for insert
  with check (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_messages;

-- ---------------------------------------------------------------------------
-- Extend notification_type enum for ticket notifications
-- ---------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'ticket_new';
alter type public.notification_type add value if not exists 'ticket_reply';
