-- Team Leaders can pin an important chat message so it stays visible at the
-- top of the group chat. Writes go through the admin client in the API route
-- (which re-checks the TL role), so no new RLS policy is needed here.
alter table chat_messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references profiles(id) on delete set null;

create index if not exists chat_messages_pinned_idx
  on chat_messages (pinned_at)
  where pinned_at is not null;
