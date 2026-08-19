-- 활동 → 학습항목 연결 (원장님, 2026-08-19 — 「교재에서는 개념설명 문제풀이
-- 복습이 8단원 있다를 간단히 표시하고, 개념설명에 학습 배정, 문제풀이에
-- 학습 배정 이렇게는 안 될까?」).
--
-- 단원마다 활동(개념설명·문제풀이·복습·워크북 …)이 붙어 있다. 교재에
-- {활동: 학습항목 id} 지도를 담아두면 — 진도 판에서 단원을 숙제로 담을 때
-- 그 단원의 활동에 연결된 항목으로 들어간다. 진도 판 표시는 안 바뀐다
-- (진도는 다 보여야 표시를 하니까).

alter table public.textbooks
  add column if not exists act_items jsonb not null default '{}'::jsonb;

create or replace function public.act_items_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.act_items_on() to authenticated;
