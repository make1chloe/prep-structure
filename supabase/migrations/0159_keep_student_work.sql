-- 0159: 아이가 만든 기록이 딸려 지워지던 두 곳 (2026-08-26)
--
-- ① 제출물: homework_submissions.report_item_id 가 검사 줄에
--    on delete cascade 로 묶여 있는데, 판 저장은 그 줄들을 전량
--    삭제 후 재삽입한다 — **저장 한 번에 아이가 낸 사진·녹음 행이
--    지워지고** 있었다 (스토리지 파일은 고아로 남아 purge 도 못 찾음).
-- ② 공부시간: study_sessions.stay_task_id 도 cascade 라, 늦귀가
--    과제를 지우면 그 과제로 잰 공부시간 기록이 함께 사라졌다.
--
-- 둘 다 set null 로 바꾼다 — 부모 줄이 없어져도 아이 기록은 남는다.
-- (homework_item_id 는 처음부터 set null 이었다. 같은 결로 맞춘다.)

alter table public.homework_submissions
  drop constraint if exists homework_submissions_report_item_id_fkey;
alter table public.homework_submissions
  add constraint homework_submissions_report_item_id_fkey
  foreign key (report_item_id) references public.daily_report_items(id)
  on delete set null;

alter table public.study_sessions
  drop constraint if exists study_sessions_stay_task_id_fkey;
alter table public.study_sessions
  add constraint study_sessions_stay_task_id_fkey
  foreign key (stay_task_id) references public.stay_tasks(id)
  on delete set null;

create or replace function public.keep_student_work_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.keep_student_work_on() to authenticated;
