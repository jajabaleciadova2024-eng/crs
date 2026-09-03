-- ---------------------------------------------------------------------------
-- 0040 — show a new announcement on three logins, not one
--
-- announcement_seen was a tombstone: one row meant "never show this again".
-- One showing is easy to click past on the way to the schedule, which is
-- how announcements get missed. It becomes a counter instead, and the modal
-- keeps returning until the member has been shown it three times.
--
-- The count has to advance per LOGIN, not per page load, or a member who
-- refreshes twice burns all three showings in a minute. auth.users
-- .last_sign_in_at changes on each sign-in and is stable across refreshes
-- within one session, so it is recorded as the marker of which login was
-- last counted; a dismissal whose marker matches the stored one is a
-- re-showing within the same login and does not advance the count.
-- ---------------------------------------------------------------------------

alter table public.announcement_seen
  add column if not exists view_count integer not null default 1,
  add column if not exists last_shown_login timestamptz;

comment on column public.announcement_seen.view_count is
  'How many separate logins this member has been shown the modal on. The modal stops at 3.';
comment on column public.announcement_seen.last_shown_login is
  'auth.users.last_sign_in_at of the login the most recent view was counted against.';

-- Existing rows were dismissals under the old show-once rule. Treat them as
-- fully shown so nobody is re-prompted about an announcement they have
-- already read and acted on.
update public.announcement_seen set view_count = 3 where view_count < 3;
