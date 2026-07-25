-- ============================================================
-- 0004_textbook_fields
--   textbooks.word_range     : 단어 교재의 단어범위(개수)
--   textbook_units.activity  : 단원 활동 유형(설명/실전모의고사/워크북 등)
-- ============================================================

alter table public.textbooks add column if not exists word_range int;
alter table public.textbook_units add column if not exists activity text;
