-- 루틴 단계를 **번호가 아니라 단계 자체(id)로** 기억한다 (0120)
--
-- 원장님 (2026-08-14): 「중간에 특정 학생에 대한 학습 루틴을 바꾸게 되면
-- 그 경우 복잡해지는 거 없을까?」 — 있었다.
--
-- 지금까지 학생은 「몇 번째 단계인지」(routine_step 번호)만 기억했다.
-- 그래서 루틴 **중간에 단계를 끼우거나 지우거나 순서를 바꾸면**, 그 교재를
-- 쓰는 모든 학생의 번호가 다른 단계를 가리키게 됐다 — 오류는 안 나고
-- 아이가 조용히 엉뚱한 단계를 하게 되는 종류의 사고다.
--
-- 이제 단계의 id 를 기억한다. 끼우거나 순서를 바꿔도 id 는 그대로라
-- 아이는 하던 단계에 그대로 서 있다. 단계를 지울 때만 앱이 그 단계에
-- 서 있던 학생을 다음 단계로 옮겨준다 (routineActions.deleteStep).
--
-- **과거 기록은 이 일과 무관하게 보존된다** — 그날 무엇을 배정하고
-- 검사했는지는 리포트(daily_reports · daily_report_items)에 이미 박제되어
-- 있어서, 루틴을 어떻게 고쳐도 지난 기록은 한 글자도 안 변한다.
--
-- 옛 칸(routine_step 번호)은 지우지 않는다 — 아직 id 가 없는 줄의
-- 폴백으로만 읽고, 다음 「루틴 다음」 때 id 가 채워진다.
alter table public.student_textbooks
  add column if not exists routine_step_id uuid;

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면이 부른다)
create or replace function public.routine_step_id_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_step_id_on() to authenticated;
