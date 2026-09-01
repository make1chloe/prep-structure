-- ─────────────────────────────────────────────────────────────
-- 0027 · 대조 리포트
-- ⚠️ **표 줄 수로 맞추지 않는다.** 구조가 다르니 애초에 안 맞는다.
--    맞춰 볼 것은 **원장님이 아는 사실**이다.
-- ─────────────────────────────────────────────────────────────
create or replace function v2.import_verify() returns table(topic text, who text, ym char(7), old_val numeric, new_val numeric, ok boolean, note text)
language plpgsql security definer set search_path = v2, public as $$
begin
  delete from v2.import_check;

  -- ① 진도 — 학생×교재로 「끝낸 단원 수」
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '진도', s.name,
    (select count(*) from public.student_unit_progress p
       join public.textbook_units u on u.id=p.textbook_unit_id
      where p.student_id=s.id and p.status='done'
        and exists (select 1 from v2.units x where x.id=u.id)),   -- 옮긴 단원만 견준다
    (select count(*) from v2.progress q where q.student_id=s.id and q.status='done'),
    '옮긴 단원만'
  from v2.students s where s.import_batch='import';

  -- ② 진도 — 회독별 (⚠️ 회독을 안 보면 2회독이 부풀거나 덮인다)
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '진도·회독'||p.round, null,
    count(*) filter (where true),
    (select count(*) from v2.progress q where q.round=p.round
       and q.student_id in (select id from v2.students where import_batch='import')),
    '회독을 안 보면 대조에 영영 안 걸린다'
  from public.student_unit_progress p
  where exists (select 1 from v2.units x where x.id=p.textbook_unit_id)
    and p.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  group by p.round;

  -- ③ 교재 — 교재별 단원 줄 수 (⚠️ 이 예외를 안 두면 「단원 나무 두 벌」이 영영 안 걸린다)
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '교재 단원', b.name,
    (select count(*) from public.textbook_units u
      where u.textbook_id=b.id
        and not exists (select 1 from public.textbook_units k where k.parent_id=u.id)),
    (select count(*) from v2.units x where x.book_id=b.id),
    '잎만 (가지는 배정 단위가 아니다)'
  from v2.books b where b.import_batch='import';

  -- ④ 사람
  insert into v2.import_check(topic, who, old_val, new_val, note) values
   ('학생 수', null,
    (select count(*) from public.students s
      where s.id::text not in (select old_id from v2.import_skip where old_table='students')),
    (select count(*) from v2.students where import_batch='import'), '테스트 뺀 값'),
   ('학부모 연결', null,
    (select count(*) from public.parent_student ps
      where ps.student_id::text not in (select old_id from v2.import_skip where old_table='students')),
    (select count(*) from v2.parent_student), null),
   ('교재 수', null,
    (select count(*) from public.textbooks),
    (select count(*) from v2.books where import_batch='import'), null);

  return query select c.topic, c.who, c.ym, c.old_val, c.new_val, c.ok, c.note
               from v2.import_check c order by c.ok, c.topic, c.who;
end $$;
grant execute on function v2.import_verify() to service_role;
