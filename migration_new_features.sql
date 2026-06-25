-- ============================================================
-- New features migration — YouTube music + anonymous stories
-- Run in Supabase → SQL Editor → paste → Run
-- Safe to re-run (IF NOT EXISTS / IF column doesn't exist)
-- ============================================================

-- Profile music (YouTube URL)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- Anonymous story option
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS anonymous BOOLEAN DEFAULT FALSE;
