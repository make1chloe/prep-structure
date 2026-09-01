-- ─────────────────────────────────────────────────────────────
-- 0003 · 사람·반의 접근 규칙
--
-- 옛 앱에서 배운 것 셋 (docs/접근규칙-검사.md):
--   ① 판단은 **함수로 뺀다** — 정책마다 풀어 쓰면 한 곳이 빠진다
--   ② 쓰기는 `using` 과 `with check` **둘 다** 건다 — 하나만 걸면
--      옮겨 놓기(update ... set student_id=남의것)가 뚫린다
--   ③ **역할 잠금** — 자기 승격을 insert·update·delete **셋 다** 막는다
-- ─────────────────────────────────────────────────────────────

create or replace function v2.is_staff() returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.profiles
                 where id = auth.uid() and role in ('principal','instructor')
                   and state = 'active')
$$;

-- 내가 볼 수 있는 아이들 — 학생이면 자기, 학부모면 자기 아이들
create or replace function v2.my_students() returns setof uuid
language sql stable security definer set search_path = v2, public as $$
  select s.id from v2.students s where s.profile_id = auth.uid()
  union
  select ps.student_id from v2.parent_student ps where ps.parent_profile_id = auth.uid()
$$;

-- ── 켠다 ────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['profiles','students','parent_student','classes',
                           'class_schedule','class_member','audit','purge_map'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
  end loop;
end $$;

-- ── 원장·강사는 전부 ────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['profiles','students','parent_student','classes',
                           'class_schedule','class_member','audit','purge_map'] loop
    execute format($f$create policy staff_all on v2.%I
                      for all to authenticated
                      using (v2.is_staff()) with check (v2.is_staff())$f$, t);
  end loop;
end $$;

-- ── 사람 ────────────────────────────────────────────────────
-- 자기 줄만 본다. **자기 것도 못 고친다** — 역할이 여기 있다
create policy self_read on v2.profiles
  for select to authenticated using (id = auth.uid());

-- ⚠️ 이름·전화를 스스로 고치는 길은 **일부러 안 연다.**
--    열려면 「role 만 빼고 비교해 다르면 거절」로 짠다(계획 1-2).
--    지금 여는 것은 **역할 잠금이 뚫리는 유일한 길**이다.

-- ── 학생 ────────────────────────────────────────────────────
create policy own_student_read on v2.students
  for select to authenticated
  using (id in (select v2.my_students()));

create policy own_link_read on v2.parent_student
  for select to authenticated
  using (parent_profile_id = auth.uid() or student_id in (select v2.my_students()));

-- ── 반 ──────────────────────────────────────────────────────
-- 내가 든 반만 보인다 (옛 앱은 반 목록이 통째로 보였다)
create policy own_class_read on v2.classes
  for select to authenticated
  using (id in (
    select m.class_id from v2.class_member m
    where m.student_id in (select v2.my_students())
      and m.from_date <= v2.today()
      and (m.to_date is null or m.to_date >= v2.today())));

create policy own_sched_read on v2.class_schedule
  for select to authenticated
  using (class_id in (
    select m.class_id from v2.class_member m
    where m.student_id in (select v2.my_students())));

create policy own_member_read on v2.class_member
  for select to authenticated
  using (student_id in (select v2.my_students()));

-- ── 감사·파기 목록은 원장만 (위 staff_all 뿐) ────────────────
