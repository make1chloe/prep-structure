-- 0044 · 대조에 나머지를 더한다 — **업무 사실**로
drop function if exists v2.import_verify();
create or replace function v2.import_verify() returns table(topic text, who text, old_val numeric, new_val numeric, ok boolean, expected text)
language plpgsql security definer set search_path = v2, public as $$
begin
  delete from v2.import_check;
  -- 진도 (학생별)
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '진도', s.name,
    (select count(*) from public.student_unit_progress p where p.student_id=s.id and p.status='done'
       and exists (select 1 from v2.units x where x.id=p.textbook_unit_id)),
    (select count(*) from v2.progress q where q.student_id=s.id and q.status='done'), null
  from v2.students s where s.import_batch='import';
  -- 회독별
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '진도·회독'||p.round, null, count(*),
    (select count(*) from v2.progress q where q.round=p.round
       and q.student_id in (select id from v2.students where import_batch='import')), null
  from public.student_unit_progress p
  where exists (select 1 from v2.units x where x.id=p.textbook_unit_id)
    and p.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  group by p.round;
  -- 교재 단원
  insert into v2.import_check(topic, who, old_val, new_val, expected)
  select '교재 단원', b.name,
    (select count(*) from public.textbook_units u where u.textbook_id=b.id
       and not exists (select 1 from public.textbook_units k where k.parent_id=u.id)),
    (select count(*) from v2.units x where x.book_id=b.id),
    case when (select count(*) from v2.import_map m join public.textbook_units u on u.id::text=m.old_id
               where m.old_table='textbook_units' and u.textbook_id=b.id
                 and m.skip_why like '%조합이 이미 있다%') > 0
         then '겹치는 조합은 첫 줄만' end
  from v2.books b where b.import_batch='import';
  -- ⭐ 출결 — 학생×달로 갈래마다 (원장님이 아는 사실)
  -- ⚠️ **날짜로 묶으면 안 된다** — 달로 세는데 group by 에 날짜가 있으면
  --    옛 값은 하루치, 새 값은 한 달치라 늘 어긋난다 (내가 한 번 틀린 자리)
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '출결·'||x.status, x.who, x.old_n,
    (select count(*) from v2.day_sheet d where d.student_id=x.sid
       and to_char(d.date,'YYYY-MM')=x.ym
       and d.attend = case x.status when 'present' then 'present' when 'absent' then 'absent'
                                    when 'makeup' then 'makeup' else 'present' end), null
  from (
    select a.status, s.id sid, s.name || ' ' || to_char(a.date,'YYYY-MM') who,
           to_char(a.date,'YYYY-MM') ym, count(*) old_n
    from public.attendance a join v2.students s on s.id=a.student_id
    where s.import_batch='import'
    group by a.status, s.id, s.name, to_char(a.date,'YYYY-MM')
  ) x;
  -- 수강료 · 상담 · 문의 · 할 일 · 반
  insert into v2.import_check(topic, who, old_val, new_val, note) values
   ('수강료', null, (select count(*) from public.payments p
       where exists (select 1 from v2.students x where x.id=p.student_id)),
     (select count(*) from v2.payment), null),
   ('수강료 합계', null, (select coalesce(sum(amount),0) from public.payments p
       where exists (select 1 from v2.students x where x.id=p.student_id)),
     (select coalesce(sum(amount),0) from v2.payment), '원 단위까지'),
   ('상담', null, (select count(*) from public.student_notes n
       where exists (select 1 from v2.students x where x.id=n.student_id)),
     (select count(*) from v2.consult), null),
   ('문의', null, (select count(*) from public.inquiries), (select count(*) from v2.inquiry), null),
   ('할 일', null, (select count(*) from public.tasks), (select count(*) from v2.todo), null),
   ('반', null, (select count(*) from public.classes c
       where c.id::text not in (select old_id from v2.import_skip where old_table='classes')),
     (select count(*) from v2.classes where import_batch='import'), null),
   ('보강', null, (select count(*) from public.attendance where status='makeup'),
     (select count(*) from v2.makeup), null),
   ('학생 수', null, (select count(*) from public.students s
       where s.id::text not in (select old_id from v2.import_skip where old_table='students')),
     (select count(*) from v2.students where import_batch='import'), null),
   ('학부모 연결', null, (select count(*) from public.parent_student ps
       where ps.student_id::text not in (select old_id from v2.import_skip where old_table='students')),
     (select count(*) from v2.parent_student where import_batch='import'), null),
   ('교재 수', null, (select count(*) from public.textbooks),
     (select count(*) from v2.books where import_batch='import'), null);
  return query select c.topic, c.who, c.old_val, c.new_val, c.ok, c.expected
               from v2.import_check c order by c.ok, c.topic, c.who;
end $$;
grant execute on function v2.import_verify() to service_role;
