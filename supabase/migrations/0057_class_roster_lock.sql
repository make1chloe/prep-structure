-- 0057: 반 명단은 자기 것만
--
-- 보안 점검에서 나온 것.
--
-- class_students 와 classes 는 "학생·학부모도 자기 반을 알아야 한다" 는 이유로
-- 통째로 열려 있었다 (using true). 그런데 통째로 열면 **학원 전체 명단**이
-- 나간다. 이름까지는 아니지만 어느 반에 몇 명이 있고 누구(어떤 id)인지가 보인다.
--
-- 학생 화면이 실제로 쓰는 것은 **자기가 속한 반** 하나뿐이다 (오늘 몇 시에
-- 끝나는지 보려고 읽는다). 자기 것만 열어주면 충분하다.
--
-- 정책 안에서 잠긴 표를 다시 뒤지면 안 된다 — 그 표의 잠금이 또 걸려서
-- 조용히 거짓이 된다 (0047 에서 이미 한 번 데었다).
-- 그래서 여기서도 **security definer 함수**로 값만 받아 비교한다.

-- ------------------------------------------------------------
-- 지금 나는 어느 학생인가 — 본인 계정이면 자기, 학부모 계정이면 자녀들
-- (my_student_id() 는 본인 하나만 돌려주므로 학부모를 담지 못한다)
-- ------------------------------------------------------------
create or replace function public.my_student_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.students s where s.profile_id = auth.uid()
  union
  select ps.student_id from public.parent_student ps where ps.parent_profile_id = auth.uid();
$$;

revoke all on function public.my_student_ids() from public;
grant execute on function public.my_student_ids() to authenticated;

-- 내가(내 아이가) 속한 반
create or replace function public.my_class_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cs.class_id from public.class_students cs
   where cs.student_id in (select public.my_student_ids());
$$;

revoke all on function public.my_class_ids() from public;
grant execute on function public.my_class_ids() to authenticated;

-- ------------------------------------------------------------
-- 내 반 배정만 / 내가 속한 반만
-- ------------------------------------------------------------
drop policy if exists read_class_students on public.class_students;
create policy read_class_students on public.class_students
  for select to authenticated
  using (public.is_staff() or student_id in (select public.my_student_ids()));

drop policy if exists read_classes_all on public.classes;
create policy read_classes_all on public.classes
  for select to authenticated
  using (public.is_staff() or id in (select public.my_class_ids()));
