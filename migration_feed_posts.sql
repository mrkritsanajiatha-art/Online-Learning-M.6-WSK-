-- ============================================================
-- Feed posts migration — text posts (with anonymous option)
-- Run in Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.posts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  anonymous   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON public.posts (user_id);
