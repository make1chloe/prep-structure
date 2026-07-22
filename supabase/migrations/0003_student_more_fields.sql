-- ============================================================
-- 0003_student_more_fields
-- 노션 재원생DB 이관을 위해 추가
--   gender      : 성별 (남/여, 텍스트로 저장)
--   enrolled_on : 등원시작일(입회일)
-- ============================================================

alter table public.students add column if not exists gender text;
alter table public.students add column if not exists enrolled_on date;
