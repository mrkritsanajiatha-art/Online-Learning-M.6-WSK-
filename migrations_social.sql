-- ============================================================
-- Social / Community migration for Online-Learning M.6
-- Run ONCE in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

-- ---------- PHASE 2: Full student profile fields ----------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nickname    VARCHAR(60),
  ADD COLUMN IF NOT EXISTS motto       VARCHAR(120),   -- คติประจำตัว
  ADD COLUMN IF NOT EXISTS dream       VARCHAR(160),   -- ความฝันในอนาคต
  ADD COLUMN IF NOT EXISTS target_goal VARCHAR(160),   -- เป้าหมาย TOEIC/TGAT/A-Level
  ADD COLUMN IF NOT EXISTS bio         VARCHAR(300),   -- แนะนำตัวสั้นๆ
  ADD COLUMN IF NOT EXISTS team_id     BIGINT;         -- สำหรับ Study Team (เฟส 4)

-- ---------- PHASE 3: Weekly goals ----------
CREATE TABLE IF NOT EXISTS public.weekly_goals (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  week_start  DATE NOT NULL,                 -- วันจันทร์ของสัปดาห์ (เวลาไทย)
  goal_type   VARCHAR(40) NOT NULL,          -- lessons | xp | vocab
  target      INT NOT NULL,
  progress    INT DEFAULT 0,
  completed   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ---------- PHASE 4: Story / Reactions / Teams / Showcase ----------
CREATE TABLE IF NOT EXISTS public.stories (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  kind        VARCHAR(30),                   -- text | achievement | vocab | goal
  content     TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ DEFAULT (now() + interval '24 hours')
);

CREATE TABLE IF NOT EXISTS public.reactions (
  id          BIGSERIAL PRIMARY KEY,
  story_id    BIGINT REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  emoji       VARCHAR(10),                   -- heart / clap / fire / muscle
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (story_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.teams (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  emoji       VARCHAR(10),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.showcase (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES public.users(id) ON DELETE CASCADE,
  category    VARCHAR(40),                   -- essay | vocab | speaking | improvement
  title       VARCHAR(160),
  content     TEXT,
  media_url   TEXT,
  pinned      BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Starter teams (optional — edit names/emoji as you like)
INSERT INTO public.teams (name, emoji)
SELECT * FROM (VALUES
  ('Team Dragon', '🐉'),
  ('Team Tiger',  '🐯'),
  ('Team Eagle',  '🦅')
) AS t(name, emoji)
WHERE NOT EXISTS (SELECT 1 FROM public.teams);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_stories_expires ON public.stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_reactions_story ON public.reactions (story_id);
CREATE INDEX IF NOT EXISTS idx_weeklygoals_user ON public.weekly_goals (user_id, week_start);
CREATE INDEX IF NOT EXISTS idx_showcase_pinned ON public.showcase (pinned);
