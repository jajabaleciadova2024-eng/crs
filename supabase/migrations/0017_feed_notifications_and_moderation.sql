-- ============================================================================
-- Feed: TL-only delete + notifications (bell icon)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Delete moderation: ONLY the Team Leader may delete posts/comments now —
-- authors (including non-TL post/comment owners) can no longer self-delete.
-- Editing is untouched (posts_update_own / post_comments_update_own stay).
-- ---------------------------------------------------------------------------
drop policy if exists "posts_delete_own" on public.posts;
drop policy if exists "post_comments_delete_own" on public.post_comments;
-- "posts_delete_leader" / "post_comments_delete_leader" (from 0014) remain —
-- those are the only delete policies left.

-- ---------------------------------------------------------------------------
-- notifications — bell icon in the top nav. One row per event
-- (reaction/comment) directed at a recipient.
-- ---------------------------------------------------------------------------
create type public.notification_type as enum ('post_reaction', 'post_comment', 'comment_mention');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.post_comments (id) on delete cascade,
  reaction public.reaction_type,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read = false;

alter table public.notifications enable row level security;

-- Recipients can read + mark their own notifications read. All writes
-- (creating a notification) happen server-side via the admin client, since
-- the actor is inserting a row targeted at someone else's recipient_id,
-- which no reasonable RLS insert policy should allow directly from the
-- client.
create policy "notifications_select_own"
  on public.notifications for select
  using (recipient_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

alter publication supabase_realtime add table public.notifications;
