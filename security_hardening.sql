-- ============================================================================
-- Security & integrity hardening
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางโค้ดนี้ → Run
-- (ต้องรัน fix_xp_race_condition.sql ใหม่ด้วย เพื่ออัปเดตฟังก์ชัน add_xp)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Stop duplicate score rows / double XP on double-submit
-- ----------------------------------------------------------------------------
-- submitQuizScore() dedupes with a SELECT-then-INSERT, which two concurrent
-- submissions (double-tap, two tabs) can both pass. A partial UNIQUE index makes
-- the second INSERT fail at the database, so XP is awarded exactly once.
-- Scoped to the "once ever per (type + reference)" activities that always carry a
-- non-null reference_id; Daily (once/day) and English (retakable) are excluded.
CREATE UNIQUE INDEX IF NOT EXISTS scores_once_per_ref
ON public.scores (user_id, quiz_type, reference_id)
WHERE quiz_type IN ('PreTest', 'PostTest', 'Activity', 'Quiz', 'Flashcards')
  AND reference_id IS NOT NULL;

-- ============================================================================
-- 2. TODO — the real security boundary (needs an app-architecture decision)
-- ============================================================================
-- The app currently ships the Supabase ANON key and talks to the DB directly
-- with NO Row Level Security and NO Supabase Auth. Two consequences:
--
--   a) PLAINTEXT PASSWORDS. users.password_hash stores the raw password and
--      loginUser() compares it with `.eq('password_hash', password)`. Anyone can
--      run `supabase.from('users').select('username,password_hash')` from the
--      browser console and read every account.
--
--   b) NO RLS. Every table is world-read/write via the anon key, so a student can
--      update their own role to 'Admin', edit anyone's scores, delete rows, etc.
--      All the `Role === 'Admin'` checks in the UI are cosmetic.
--
-- These cannot be fixed safely from the client alone — doing so is a migration
-- that WILL change the login flow, so it is intentionally left as a documented
-- step rather than auto-applied. Recommended direction:
--
--   1. Move authentication to Supabase Auth (email/username + password), which
--      stores a bcrypt hash and issues a JWT; drop the plaintext password_hash
--      column and the loginUser() equality check.
--   2. Enable RLS on every table:
--        ALTER TABLE public.users   ENABLE ROW LEVEL SECURITY;
--        ALTER TABLE public.scores  ENABLE ROW LEVEL SECURITY;
--        -- ...and the rest
--      then add policies so a user can only read/write their own rows, e.g.:
--        CREATE POLICY scores_own ON public.scores
--          FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--   3. Move admin-only actions (adminGiveBonus, adminUpdateRow, adminDeleteRow,
--      adminAddQuiz) behind SECURITY DEFINER functions that verify the caller's
--      role server-side (auth.uid() → users.role = 'Admin'), instead of trusting
--      the client. Then add_xp can also verify p_uid = auth.uid() and its GRANT to
--      anon can be removed.
-- ============================================================================
