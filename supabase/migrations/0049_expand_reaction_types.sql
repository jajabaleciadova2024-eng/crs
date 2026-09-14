-- Expand the reaction_type enum with more emoji options so members
-- have a fuller set to choose from on posts and announcements.
-- Run this in the Supabase SQL editor before deploying the code.

alter type public.reaction_type add value if not exists 'laugh';
alter type public.reaction_type add value if not exists 'wow';
alter type public.reaction_type add value if not exists 'sad';
alter type public.reaction_type add value if not exists 'fire';
alter type public.reaction_type add value if not exists 'clap';
alter type public.reaction_type add value if not exists 'thinking';
