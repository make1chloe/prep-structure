-- 영역별 루틴 (원장님, 2026-08-19 — 「교재에 학습항목 연결하는 건 교재별
-- 루틴으로 하고, 교재 상관없는 건 영역별 루틴으로. 교재별 설정하면 그걸
-- 우선으로」).
--
-- 루틴 줄이 교재(textbook_id)에 붙거나 **영역(area — 문법/독해/단어…)**에
-- 붙는다. 고르는 규칙은 nextRoutine 한 곳: 그 교재의 루틴이 한 줄이라도
-- 있으면 그것만, 없으면 그 교재 영역의 루틴을 따른다.

alter table public.routine_steps alter column textbook_id drop not null;
alter table public.routine_steps add column if not exists area text;
create index if not exists routine_steps_area_idx on public.routine_steps (area, sort);

create or replace function public.routine_area_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_area_on() to authenticated;
