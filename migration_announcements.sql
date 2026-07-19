-- ============================================================
-- Migration: ระบบประกาศ (การ์ด 3:4 ตอนนักเรียนเข้าระบบ)
-- วิธีรัน: Supabase Dashboard → SQL Editor → วาง → กด Run
-- ปลอดภัยถ้ารันซ้ำ (IF NOT EXISTS)
-- ============================================================

ALTER TABLE public.announcements
  -- รูปประกาศ เก็บเป็น data URL (JPEG ย่อเป็น 600x800 = 3:4 จากฝั่งแอปแล้ว)
  ADD COLUMN IF NOT EXISTS image TEXT,
  -- ประกาศที่กำลังแสดงอยู่ (แสดงได้ทีละอัน)
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;

-- ดึงประกาศที่เปิดอยู่ให้เร็ว
CREATE INDEX IF NOT EXISTS announcements_active_created_idx
  ON public.announcements (active, created_at DESC);
