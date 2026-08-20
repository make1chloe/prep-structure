-- 안 해온 숙제의 기본 처분 (원장님, 2026-08-20 — 「b 좋아」).
-- 항목마다 미제출·미흡일 때 어디로 보내는 게 보통인지 적어둔다:
--   inclass = 오늘수업으로 · homework = 숙제 다시 · 비면 = 매번 고름.
-- 자동 실행이 아니라 그 버튼을 눈에 띄게 할 뿐이다 (오터치 방지).

alter table public.homework_items
  add column if not exists redo_default text;

create or replace function public.redo_default_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.redo_default_on() to authenticated;
