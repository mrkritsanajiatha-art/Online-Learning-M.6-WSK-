-- ============================================================
-- Post reactions + comments migration
-- Run in Supabase → SQL Editor → paste → Run. Safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.post_reactions (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     UUID   REFERENCES public.users(id) ON DELETE CASCADE,
  emoji       TEXT   NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id     UUID   REFERENCES public.users(id) ON DELETE CASCADE,
  content     TEXT   NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post  ON public.post_comments(post_id);
