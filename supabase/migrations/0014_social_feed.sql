-- ============================================================================
-- Social feed — "What's on your mind?" Facebook-style feature
-- Posts, reactions (like/heart/angry), and comments with real-time updates.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_created_at_idx on public.posts (created_at desc);
create index posts_author_idx on public.posts (author_id);

-- ---------------------------------------------------------------------------
-- post_reactions — one reaction per person per post, toggleable
-- ---------------------------------------------------------------------------
create type public.reaction_type as enum ('like', 'heart', 'angry');

create table public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  reaction public.reaction_type not null,
  created_at timestamptz not null default now(),
  unique (post_id, profile_id)
);

create index post_reactions_post_idx on public.post_reactions (post_id);

-- ---------------------------------------------------------------------------
-- post_comments
-- ---------------------------------------------------------------------------
create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index post_comments_author_idx on public.post_comments (author_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create trigger post_comments_set_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — all authenticated users can read everything; authors can write own
-- ---------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;

-- posts: anyone signed in can read, authors can insert/update/delete own
create policy "posts_select_all"
  on public.posts for select
  using (auth.uid() is not null);

create policy "posts_insert_own"
  on public.posts for insert
  with check (author_id = auth.uid());

create policy "posts_update_own"
  on public.posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "posts_delete_own"
  on public.posts for delete
  using (author_id = auth.uid());

-- Team Leader can also delete anyone's post (moderation)
create policy "posts_delete_leader"
  on public.posts for delete
  using (public.current_role() = 'team_leader');

-- reactions: anyone signed in can read, own reactions only
create policy "post_reactions_select_all"
  on public.post_reactions for select
  using (auth.uid() is not null);

create policy "post_reactions_insert_own"
  on public.post_reactions for insert
  with check (profile_id = auth.uid());

create policy "post_reactions_update_own"
  on public.post_reactions for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "post_reactions_delete_own"
  on public.post_reactions for delete
  using (profile_id = auth.uid());

-- comments: anyone signed in can read, authors manage own
create policy "post_comments_select_all"
  on public.post_comments for select
  using (auth.uid() is not null);

create policy "post_comments_insert_own"
  on public.post_comments for insert
  with check (author_id = auth.uid());

create policy "post_comments_update_own"
  on public.post_comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "post_comments_delete_own"
  on public.post_comments for delete
  using (author_id = auth.uid());

-- Team Leader can delete anyone's comment (moderation)
create policy "post_comments_delete_leader"
  on public.post_comments for delete
  using (public.current_role() = 'team_leader');

-- ---------------------------------------------------------------------------
-- Realtime — enable for all three tables so clients get live updates
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.post_reactions;
alter publication supabase_realtime add table public.post_comments;
