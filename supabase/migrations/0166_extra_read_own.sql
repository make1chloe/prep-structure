-- 0166: 특강(0164)을 **학생·학부모도 읽는다** — 특강 6단계의 전제.
--
-- 0164 는 staff_all 만 깔았다. RLS 는 없는 것처럼 보여주므로, 그대로면
-- /me·/parent 가 특강을 0줄로 읽어 **달력 회차·이번 달 셈이 조용히 빈다** —
-- 오류도 안 나고, 원장님 미리보기(선생님 권한)로는 절대 안 잡히는 종류다
-- (0090 에서 학부모 화면이 몇 주 비어 있던 것과 똑같은 모양).
--
-- 규칙은 my_student_ids() 하나로 (0057) — 「내 아이 + 나 자신」 을 함께
-- 돌려주므로 학생·학부모를 두 줄로 나눠 적지 않는다. 쓰기는 여전히
-- staff_all 만 허용한다 (이 정책은 select 만 연다).
--
-- 되돌리기:
--   drop policy if exists read_own on public.student_extra_schedules;
--   drop policy if exists read_own on public.student_extra_absences;

drop policy if exists read_own on public.student_extra_schedules;
create policy read_own on public.student_extra_schedules
  for select to authenticated
  using (student_id in (select public.my_student_ids()));

drop policy if exists read_own on public.student_extra_absences;
create policy read_own on public.student_extra_absences
  for select to authenticated
  using (
    exists (
      select 1
        from public.student_extra_schedules s
       where s.id = student_extra_absences.schedule_id
         and s.student_id in (select public.my_student_ids())
    )
  );

-- 돌아가는지 손가락 하나로 확인하는 탐침 (설정 → SQL 화면·메뉴 배지가 본다)
create or replace function public.extra_read_own_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.extra_read_own_on() to authenticated;
