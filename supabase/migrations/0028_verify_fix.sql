-- ─────────────────────────────────────────────────────────────
drop function if exists v2.import_verify();
-- 0028 · 대조를 고친다
--
-- ⚠️ **내가 계획 규칙을 어겼다** — 「`fixture` 는 대조의 줄 수 세기에서 뺀다.
--    안 빼면 리포트가 그만큼 **영원히 어긋난다**」. 학부모 연결이 20 vs 21 로 떴다.
-- ⚠️ 그리고 계획이 요구한 **「의도한 차이」 칸**을 안 뒀다 —
--    「차이 한 줄마다 의도한 것인지 버그인지 적고, **설명 못 하는 차이가 하나라도 남으면 전환하지 않는다**」
-- ─────────────────────────────────────────────────────────────
alter table v2.import_check add column if not exists expected text;   -- 의도한 차이면 그 까닭
alter table v2.import_check drop column if exists ok;
alter table v2.import_check add column ok boolean
  generated always as (old_val is not distinct from new_val or expected is not null) stored;

create or replace function v2.import_verify() returns table(topic text, who text, old_val numeric, new_val numeric, ok boolean, expected text)
language plpgsql security definer set search_path = v2, public as $$
begin
  delete from v2.import_check;

  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '진도', s.name,
    (select count(*) from public.student_unit_progress p
      where p.student_id=s.id and p.status='done'
        and exists (select 1 from v2.units x where x.id=p.textbook_unit_id)),
    (select count(*) from v2.progress q where q.student_id=s.id and q.status='done'),
    '옮긴 단원만'
  from v2.students s where s.import_batch='import';

  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '진도·회독'||p.round, null, count(*),
    (select count(*) from v2.progress q where q.round=p.round
       and q.student_id in (select id from v2.students where import_batch='import')),
    '회독을 안 보면 대조에 영영 안 걸린다'
  from public.student_unit_progress p
  where exists (select 1 from v2.units x where x.id=p.textbook_unit_id)
    and p.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  group by p.round;

  -- 교재 단원 — **겹쳐서 안 옮긴 줄 수만큼은 의도한 차이**다
  insert into v2.import_check(topic, who, old_val, new_val, note, expected)
  select '교재 단원', b.name,
    (select count(*) from public.textbook_units u where u.textbook_id=b.id
       and not exists (select 1 from public.textbook_units k where k.parent_id=u.id)),
    (select count(*) from v2.units x where x.book_id=b.id),
    '잎만',
    case when (select count(*) from v2.import_map m
                join public.textbook_units u on u.id::text=m.old_id
               where m.old_table='textbook_units' and u.textbook_id=b.id
                 and m.skip_why like '%조합이 이미 있다%') > 0
         then '겹치는 조합은 첫 줄만 옮겼다 ('||
              (select count(*) from v2.import_map m
                join public.textbook_units u on u.id::text=m.old_id
               where m.old_table='textbook_units' and u.textbook_id=b.id
                 and m.skip_why like '%조합이 이미 있다%')||'줄)' end
  from v2.books b where b.import_batch='import';

  -- 사람 — ⚠️ **fixture 를 뺀다**
  insert into v2.import_check(topic, who, old_val, new_val, note) values
   ('학생 수', null,
    (select count(*) from public.students s
      where s.id::text not in (select old_id from v2.import_skip where old_table='students')),
    (select count(*) from v2.students where import_batch='import'), '테스트·리허설 뺀 값'),
   ('학부모 연결', null,
    (select count(*) from public.parent_student ps
      where ps.student_id::text not in (select old_id from v2.import_skip where old_table='students')),
    (select count(*) from v2.parent_student where import_batch='import'), '⚠️ fixture 를 뺀다'),
   ('교재 수', null,
    (select count(*) from public.textbooks),
    (select count(*) from v2.books where import_batch='import'), null);

  return query select c.topic, c.who, c.old_val, c.new_val, c.ok, c.expected
               from v2.import_check c order by c.ok, c.topic, c.who;
end $$;
grant execute on function v2.import_verify() to service_role;
