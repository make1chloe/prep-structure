-- ============================================================
-- 0007_textbook_year_units
--   textbooks.pub_year        : 출판년도 (같은 교재의 개정판 구분)
--   textbook_units.total_pages: 단원 총 분량(페이지 수)
-- ============================================================

alter table public.textbooks      add column if not exists pub_year   int;
alter table public.textbook_units add column if not exists total_pages int;
