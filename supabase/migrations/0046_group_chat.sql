-- ============================================================================
-- Group Chat — real-time team-wide chat with reactions, replies, image
-- attachments, edit history, and soft-delete (TL only).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '' check (char_length(content) <= 2000),
  image_url text,
  reply_to_id uuid references public.chat_messages (id) on delete set null,
  original_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index chat_messages_created_idx on public.chat_messages (created_at desc);

create trigger chat_messages_set_updated_at
  before update on public.chat_messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- chat_reactions — emoji reactions on messages (one emoji per user per msg)
-- ---------------------------------------------------------------------------
create table public.chat_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) > 0 and char_length(emoji) <= 8),
  created_at timestamptz not null default now(),
  unique (message_id, profile_id, emoji)
);

create index chat_reactions_msg_idx on public.chat_reactions (message_id);

-- ---------------------------------------------------------------------------
-- chat_read_cursors — per-user last-read timestamp for unread counting
-- ---------------------------------------------------------------------------
create table public.chat_read_cursors (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_read_cursors enable row level security;

-- messages: all authenticated can read; own insert; own update (edit); TL delete
create policy "chat_messages_select" on public.chat_messages
  for select using (auth.uid() is not null);

create policy "chat_messages_insert" on public.chat_messages
  for insert with check (author_id = auth.uid());

create policy "chat_messages_update_own" on public.chat_messages
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy "chat_messages_delete_leader" on public.chat_messages
  for delete using (public.current_role() = 'team_leader');

-- reactions: all read, own write/delete
create policy "chat_reactions_select" on public.chat_reactions
  for select using (auth.uid() is not null);

create policy "chat_reactions_insert" on public.chat_reactions
  for insert with check (profile_id = auth.uid());

create policy "chat_reactions_delete_own" on public.chat_reactions
  for delete using (profile_id = auth.uid());

-- read cursors: own only
create policy "chat_read_cursors_select" on public.chat_read_cursors
  for select using (profile_id = auth.uid());

create policy "chat_read_cursors_insert" on public.chat_read_cursors
  for insert with check (profile_id = auth.uid());

create policy "chat_read_cursors_update" on public.chat_read_cursors
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.chat_reactions;

-- ---------------------------------------------------------------------------
-- Notification types
-- ---------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'chat_reply';
alter type public.notification_type add value if not exists 'chat_reaction';
