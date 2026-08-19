-- 진도에 「마지막으로 만진 날」 (원장님, 2026-08-19 — 「오늘 수업 진도에서
-- 오늘 수업 한 부분과 오늘 숙제로 나갈 부분을 따로 표시해서 그걸 각각
-- 숙제와 데일리 리포트에 반영하고 싶어」).
--
-- 완료(○)는 done_on 이 남지만 하는 중(◐)은 날짜가 없어서, 「오늘 수업에서
-- 하다 만 것」 과 「지난주부터 하는 중」 을 구별할 수 없었다. 찍을 때마다
-- 날짜를 남긴다 — 「오늘 수업한 부분」 = marked_on 이 오늘인 ○·◐.
-- 지난 기록은 소급되지 않는다 (오늘부터 쌓인다).

alter table public.student_unit_progress
  add column if not exists marked_on date;

create or replace function public.progress_marked_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.progress_marked_on() to authenticated;
