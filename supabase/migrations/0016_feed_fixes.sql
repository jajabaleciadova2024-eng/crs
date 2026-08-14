-- ============================================================================
-- Fix posts content constraint + add 30-day auto-cleanup for feed images
-- ============================================================================

-- Allow image-only posts (content can be empty string when image_url is set).
-- The original constraint required content > 0 chars unconditionally, which
-- blocked posts that are just a photo with no caption.
alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts add constraint posts_content_check
  check (
    (char_length(content) > 0 or image_url is not null)
    and char_length(content) <= 2000
  );

-- Auto-cleanup: delete posts older than 30 days. Run via pg_cron or a
-- scheduled API call (see /api/feed/cleanup). This function can be called
-- by either mechanism — it deletes the post rows (which cascades to
-- reactions + comments), and returns the image paths that need to be
-- removed from Supabase Storage separately (storage can't be managed
-- from inside a DB function).
create or replace function public.cleanup_old_posts(days_old int default 30)
returns table (image_url text)
language sql
security definer
set search_path = public
as $$
  -- Return image_urls of posts about to be deleted so the caller can
  -- clean up the storage objects too.
  with old_posts as (
    delete from public.posts
    where created_at < now() - (days_old || ' days')::interval
    returning posts.image_url
  )
  select image_url from old_posts where image_url is not null;
$$;
