-- ============================================================
-- 0006_textbook_status
-- 교재 상태: 사용중 / 절판 / 중단  (기본 사용중)
-- 절판·중단 교재는 목록에서 숨길 수 있게 한다.
-- ============================================================

alter table public.textbooks
  add column if not exists status text not null default 'active';
