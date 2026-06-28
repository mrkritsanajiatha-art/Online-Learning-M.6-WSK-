-- Migration: English Placement Test
-- เพิ่ม column สำหรับเก็บระดับภาษาอังกฤษ CEFR และสถานะการทำ Placement Test

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS english_level VARCHAR(10) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS placement_done BOOLEAN DEFAULT FALSE;
