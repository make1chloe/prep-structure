-- 루틴에 **회독 분기** (원장님, 2026-08-19 — 저절로리딩 브릿지1:
-- 「1회독때 Step3 기호표시·Step4 한글뜻쓰기 / 2회독때 Step5 영작 /
-- 3회독때 테스트북 영작」 — 한 유닛 = 한 수업이고, 수업마다 단계가
-- 바뀌는 게 아니라 **회독에 따라** 하는 일이 바뀐다. 「맞아!」).
--
-- round 가 비면(null) 모든 회독에 적용. n 이면 **n회독부터** 적용하되,
-- 더 높은(가까운) 회독 정의가 있으면 그것이 이긴다 — 「2회독부터」 줄과
-- 「3회독부터」 줄이 같이 있으면 3회독 학생에겐 3회독 줄만 보인다.
-- 고르는 규칙은 lib 아닌 nextRoutine 한 곳에 산다.

alter table public.routine_steps
  add column if not exists round int;

create or replace function public.routine_round_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_round_on() to authenticated;
