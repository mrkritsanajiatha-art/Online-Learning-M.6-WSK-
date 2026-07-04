-- ===========================================================
-- แก้บัค XP หายหลัง refresh (Race Condition)
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางโค้ดนี้ → Run
-- ===========================================================

-- ฟังก์ชัน atomic increment XP (ป้องกัน race condition)
-- ใช้ UPDATE ... SET xp = xp + amount แทนการ read-then-write
--
-- SECURITY: because the app uses the anon key (no Supabase Auth), this function
-- cannot verify that the caller owns p_uid — any client can call it for any user.
-- The proper fix is Supabase Auth + auth.uid() checks + RLS (see security_hardening.sql).
-- Until then, we at least clamp p_amount so a malicious client cannot mint a huge
-- amount or subtract XP with a negative value.
CREATE OR REPLACE FUNCTION add_xp(p_uid TEXT, p_amount INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN;                        -- ignore zero/negative/NULL awards
  END IF;
  IF p_amount > 1000 THEN
    p_amount := 1000;              -- cap a single award well above any legit value
  END IF;
  UPDATE users
  SET xp = COALESCE(xp, 0) + p_amount
  WHERE id = p_uid::uuid;
END;
$$;

-- ให้สิทธิ์ทั้ง anon และ authenticated ใช้ฟังก์ชันนี้
GRANT EXECUTE ON FUNCTION add_xp(TEXT, INT) TO anon, authenticated;
