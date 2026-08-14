-- ============================================================================
-- Feed enhancements: image uploads + poop/roll_eyes reactions
-- ============================================================================

-- Add image_url to posts (nullable — text-only posts remain valid)
alter table public.posts add column image_url text;

-- Add new reaction types to the enum
alter type public.reaction_type add value 'poop';
alter type public.reaction_type add value 'roll_eyes';
