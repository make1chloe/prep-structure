-- ─────────────────────────────────────────────────────────────
-- 0024 · 이관을 도는 함수 — **몇 번을 돌려도 같은 결과**
--
-- ⚠️ 재적재가 지우는 범위: **이관이 만든 줄과 `rehearsal` 묶음만.**
--    `excel`·`fixture` 는 안 건드린다 — 옛 앱에 없는 자료라 되살려 주지 못한다.
-- ⚠️ 읽을 때 **1000줄 함정**을 안 만난다 — SQL 이라 한 번에 다 읽는다.
--    (앱에서 REST 로 읽을 때가 위험하다 · 2026-08-14 사고)
-- ─────────────────────────────────────────────────────────────

/** 테스트 줄을 골라 둔다 — 이름 거르개는 **학생·계정·반에만** 건다.
    ⚠️ 「구두테스트」·「셀프테스트(녹음)」는 **진짜 학습 항목**이다 */
create or replace function v2.import_mark_skip() returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int := 0;
begin
  delete from v2.import_skip;
  insert into v2.import_skip(old_table, old_id, why)
  select 'students', s.id::text, '이름에 테스트' from public.students s where s.name ~ '테스트|샘플|더미|^zz'
  union all
  select 'profiles', p.id::text, '이름에 테스트' from public.profiles p where p.name ~ '테스트|샘플|더미|^zz'
  union all
  select 'classes', c.id::text, '이름에 테스트' from public.classes c where c.name ~ '테스트|샘플|더미|^zz';
  get diagnostics n = row_count;
  -- 그 학생에 딸린 줄도 같이
  insert into v2.import_skip(old_table, old_id, why)
  select 'daily_reports', r.id::text, '테스트 학생' from public.daily_reports r
  where r.student_id::text in (select old_id from v2.import_skip where old_table='students')
  on conflict do nothing;
  insert into v2.import_skip(old_table, old_id, why)
  select 'student_unit_progress', s.student_id::text||'|'||s.textbook_unit_id::text||'|'||s.round,
         '테스트 학생' from public.student_unit_progress s
  where s.student_id::text in (select old_id from v2.import_skip where old_table='students')
  on conflict do nothing;
  return (select count(*)::int from v2.import_skip);
end $$;

/** ① 사람·학생 — 여기서 새 번호가 정해지고 매핑표에 적힌다 */
create or replace function v2.import_people() returns table(what text, n int)
language plpgsql security definer set search_path = v2, public as $$
begin
  -- 프로필: 옛 id 를 그대로 쓴다 (auth.users 와 같은 번호라 바꾸면 로그인이 끊긴다)
  insert into v2.profiles(id, role, name, phone, state, import_batch)
  select p.id, p.role, p.name, null, 'active', 'import'
  from public.profiles p
  where p.id::text not in (select old_id from v2.import_skip where old_table='profiles')
    and p.role in ('principal','instructor','student','parent')
  on conflict (id) do update set role=excluded.role, name=excluded.name;
  insert into v2.import_map(old_table, old_id, new_table, new_id)
  select 'profiles', p.id::text, 'profiles', p.id from public.profiles p
  where p.id::text not in (select old_id from v2.import_skip where old_table='profiles')
  on conflict (old_table, old_id) do nothing;
  what := 'profiles'; n := (select count(*)::int from v2.profiles where import_batch='import'); return next;

  insert into v2.students(id, profile_id, name, grade, state, import_batch)
  select s.id, s.profile_id, s.name, null, 'active', 'import'
  from public.students s
  where s.id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (id) do update set name=excluded.name;
  insert into v2.import_map(old_table, old_id, new_table, new_id)
  select 'students', s.id::text, 'students', s.id from public.students s
  where s.id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (old_table, old_id) do nothing;
  what := 'students'; n := (select count(*)::int from v2.students where import_batch='import'); return next;

  insert into v2.parent_student(parent_profile_id, student_id, import_batch)
  select ps.parent_profile_id, ps.student_id, 'import' from public.parent_student ps
  where ps.student_id::text not in (select old_id from v2.import_skip where old_table='students')
    and ps.parent_profile_id::text not in (select old_id from v2.import_skip where old_table='profiles')
    and exists (select 1 from v2.students x where x.id=ps.student_id)
    and exists (select 1 from v2.profiles x where x.id=ps.parent_profile_id)
  on conflict do nothing;
  what := 'parent_student'; n := (select count(*)::int from v2.parent_student); return next;

  -- 안 옮긴 것도 **사유와 함께** 남긴다
  insert into v2.import_map(old_table, old_id, skip_why)
  select k.old_table, k.old_id, k.why from v2.import_skip k
  on conflict (old_table, old_id) do update set skip_why=excluded.skip_why;
end $$;

grant execute on function v2.import_mark_skip(), v2.import_people() to service_role;
