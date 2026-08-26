-- 0158: 학생의 「다 했어요」가 조용히 사라지던 것 (2026-08-26)
--
-- daily_report_items 에 학생 정책이 읽기(select)뿐이라, 학생 계정이
-- student_done_at 을 적는 update(학습 완료·완료 취소·자가 단원평가)가
-- **0행 갱신 + 오류 없음**으로 끝나고 있었다. 아이 화면은 완료로
-- 보이는데(낙관) 서버엔 아무것도 안 남고, 선생님 알림만 나갔다.
-- 원장님 체험 모드는 is_staff() 로 통과해 이 버그가 안 보인다 —
-- 그래서 오래 숨어 있었다.
--
-- 고치는 법:
--  1) 학생 본인(students.profile_id = auth.uid())에게만 update 를 연다.
--     학부모는 제외 — 완료 표시는 아이가 누르는 것.
--  2) RLS 는 행 단위라 칸을 못 가리므로, 트리거로 「학생은
--     student_done_at 만」을 강제한다. 다른 칸(status·배정)을 학생이
--     REST 로 고치는 길을 막는다. to_jsonb 비교라 칸이 늘어도 안전.

drop policy if exists student_update_done on public.daily_report_items;
create policy student_update_done on public.daily_report_items
  for update to authenticated
  using (
    exists (
      select 1
        from public.daily_reports r
        join public.students s on s.id = r.student_id
       where r.id = daily_report_items.daily_report_id
         and s.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.daily_reports r
        join public.students s on s.id = r.student_id
       where r.id = daily_report_items.daily_report_id
         and s.profile_id = auth.uid()
    )
  );

create or replace function public.guard_student_item_update()
returns trigger
language plpgsql
as $$
begin
  if not public.is_staff() then
    if (to_jsonb(new) - 'student_done_at') is distinct from (to_jsonb(old) - 'student_done_at') then
      raise exception '학생은 완료 표시만 바꿀 수 있어요';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_student_item on public.daily_report_items;
create trigger trg_guard_student_item
  before update on public.daily_report_items
  for each row execute function public.guard_student_item_update();

create or replace function public.student_done_update_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.student_done_update_on() to authenticated;
