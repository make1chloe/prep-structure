-- 0040: 아이가 출석 체크를 하면 등원으로 잡는다
--
-- 출석은 외부 앱에서 하지만, 아이가 우리 화면에서 '출석 체크 했어요' 를 누르면
-- 그게 곧 등원 신호다. 선생님이 또 찍을 이유가 없다.
--
-- 늦게 온 아이는 누른 시각이 남으니 선생님 화면에서 보고 지각으로 고치면 된다.
--
-- 학생에게 열어주는 문은 **최대한 좁게** 만든다.
--   · 자기 줄만
--   · 오늘 날짜만
--   · status = 'present' 만
--   · 넣기만 (고치거나 지우지 못한다)
-- 이러면 학생이 할 수 있는 일은 '오늘 내가 왔다고 말하는 것' 하나뿐이다.

drop policy if exists own_arrival_insert on public.attendance;
create policy own_arrival_insert on public.attendance
  for insert to authenticated
  with check (
    status = 'present'
    and date = ((now() at time zone 'Asia/Seoul')::date)
    and exists (
      select 1 from public.students s
       where s.id = attendance.student_id and s.profile_id = auth.uid()
    )
  );

-- 자기 출결은 볼 수 있게 (이미 왔다고 되어 있는지 알아야 두 번 안 넣는다)
drop policy if exists own_read on public.attendance;
create policy own_read on public.attendance
  for select to authenticated
  using (
    exists (
      select 1 from public.students s
       where s.id = attendance.student_id and s.profile_id = auth.uid()
    )
    or exists (
      select 1 from public.parent_student ps
       where ps.student_id = attendance.student_id and ps.parent_profile_id = auth.uid()
    )
  );
