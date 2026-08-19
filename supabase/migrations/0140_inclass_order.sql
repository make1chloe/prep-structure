-- 오늘 학원 학습의 **순서와 이월** (원장님, 2026-08-20 — 「그날 공부할
-- 순서를 설정하는 게 필요해. 수업 시간이 끝나서 다 못 하는 경우 다음
-- 수업시간에 하기 또는 남은 건 숙제로, 이런 선택지가 필요해」).
--
-- inclass_sort: 오늘 학원에서 할 것의 차례 — 학생 화면이 이 순서대로
--   하나씩 보여준다. 원장님이 ↑↓ 로 조정한다.
-- carry_next: 오늘 못 끝내서 「다음 수업에 계속」 을 누른 것 —
--   다음 수업의 오늘 학원 목록에 자동으로 다시 선다.

alter table public.daily_report_items
  add column if not exists inclass_sort int;
alter table public.daily_report_items
  add column if not exists carry_next boolean not null default false;

create or replace function public.inclass_order_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.inclass_order_on() to authenticated;
