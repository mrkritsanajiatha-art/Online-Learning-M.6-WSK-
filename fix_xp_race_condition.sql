-- ===========================================================
-- แก้บัค XP หายหลัง refresh (Race Condition)
-- วิธีรัน: Supabase Dashboard → SQL Editor → วางโค้ดนี้ → Run
-- ===========================================================

-- ฟังก์ชัน atomic increment XP (ป้องกัน race condition)
-- ใช้ UPDATE ... SET xp = xp + amount แทนการ read-then-write
CREATE OR REPLACE FUNCTION add_xp(p_uid TEXT, p_amount INT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE users
  SET xp = COALESCE(xp, 0) + p_amount
  WHERE id = p_uid::uuid;
$$;

-- ให้สิทธิ์ทั้ง anon และ authenticated ใช้ฟังก์ชันนี้
GRANT EXECUTE ON FUNCTION add_xp(TEXT, INT) TO anon, authenticated;
