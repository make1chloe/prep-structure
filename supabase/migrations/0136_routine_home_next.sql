-- 루틴 숙제의 **선행/후행** (원장님, 2026-08-19 — 「주의할 게, 숙제가
-- 선행인지 후행인지인데 어떻게 표시해?」).
--
-- 후행(복습) 숙제는 오늘 한 단원(첫 미완료 단원)이 맞고 — 지금 home_items
-- 가 그렇게 돈다. 선행(예습) 숙제는 **다음 단원**이 잡혀야 한다
-- (브릿지1: 「집에서 예습숙제 — 새로운 유닛 …」). 예습 숙제를 딴 칸에
-- 담아, 루틴이 채울 때 다음 단원을 붙인다.

alter table public.routine_steps
  add column if not exists home_next uuid[] not null default '{}';

create or replace function public.routine_home_next_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_home_next_on() to authenticated;
