-- ============================================================================
-- Announcements — Team-Leader-only posts with title + body, reactions,
-- comments, bell/email notifications, and a "seen on first visit" modal.
-- Reuses the existing reaction_type enum and the same comment/reaction
-- pattern as the social feed (0014).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) > 0 and char_length(title) <= 200),
  body text not null check (char_length(body) > 0 and char_length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_created_at_idx on public.announcements (created_at desc);

-- ---------------------------------------------------------------------------
-- announcement_reactions — same one-per-person pattern as post_reactions
-- ---------------------------------------------------------------------------
create table public.announcement_reactions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reaction public.reaction_type not null,
  created_at timestamptz not null default now(),
  unique (announcement_id, profile_id)
);

create index announcement_reactions_ann_idx on public.announcement_reactions (announcement_id);

-- ---------------------------------------------------------------------------
-- announcement_comments
-- ---------------------------------------------------------------------------
create table public.announcement_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcement_comments_ann_idx on public.announcement_comments (announcement_id, created_at);

-- ---------------------------------------------------------------------------
-- announcement_seen — tracks which users have dismissed the "new
-- announcement" modal so it only shows once per announcement per user.
-- ---------------------------------------------------------------------------
create table public.announcement_seen (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  seen_at timestamptz not null default now(),
  unique (announcement_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

create trigger announcement_comments_set_updated_at
  before update on public.announcement_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.announcement_reactions enable row level security;
alter table public.announcement_comments enable row level security;
alter table public.announcement_seen enable row level security;

-- announcements: all authenticated can read; only TL can insert/update/delete
create policy "announcements_select_all"
  on public.announcements for select
  using (auth.uid() is not null);

create policy "announcements_insert_leader"
  on public.announcements for insert
  with check (public.current_role() = 'team_leader');

create policy "announcements_update_leader"
  on public.announcements for update
  using (public.current_role() = 'team_leader')
  with check (public.current_role() = 'team_leader');

create policy "announcements_delete_leader"
  on public.announcements for delete
  using (public.current_role() = 'team_leader');

-- reactions: all can read, own only for write
create policy "announcement_reactions_select_all"
  on public.announcement_reactions for select
  using (auth.uid() is not null);

create policy "announcement_reactions_insert_own"
  on public.announcement_reactions for insert
  with check (profile_id = auth.uid());

create policy "announcement_reactions_update_own"
  on public.announcement_reactions for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "announcement_reactions_delete_own"
  on public.announcement_reactions for delete
  using (profile_id = auth.uid());

-- comments: all can read, own for insert/update, TL can delete any
create policy "announcement_comments_select_all"
  on public.announcement_comments for select
  using (auth.uid() is not null);

create policy "announcement_comments_insert_own"
  on public.announcement_comments for insert
  with check (author_id = auth.uid());

create policy "announcement_comments_update_own"
  on public.announcement_comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "announcement_comments_delete_own"
  on public.announcement_comments for delete
  using (author_id = auth.uid());

create policy "announcement_comments_delete_leader"
  on public.announcement_comments for delete
  using (public.current_role() = 'team_leader');

-- seen: users can read, insert, and update their own rows (upsert
-- needs both insert + update policies to work through RLS)
create policy "announcement_seen_select_own"
  on public.announcement_seen for select
  using (profile_id = auth.uid());

create policy "announcement_seen_insert_own"
  on public.announcement_seen for insert
  with check (profile_id = auth.uid());

create policy "announcement_seen_update_own"
  on public.announcement_seen for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.announcements;
alter publication supabase_realtime add table public.announcement_reactions;
alter publication supabase_realtime add table public.announcement_comments;

-- ---------------------------------------------------------------------------
-- Extend notification_type enum for announcement notifications
-- ---------------------------------------------------------------------------
alter type public.notification_type add value if not exists 'announcement';
