-- 0049 · 판·검사·성적 대조 + ⚠️ **틀린 출결 대조를 갈아 끼운다**
-- 0044 의 출결 대조는 옛 `attendance` 표를 기준으로 삼았다. 그 표는 출결부가 아니라
-- **결석·보강 장부**였으므로(0047), 그 대조는 「내가 잘못 옮긴 것」을 초록으로 통과시킨다.
create or replace function v2.import_verify_day() returns void
language plpgsql security definer set search_path = v2, public as $$
begin
  delete from v2.import_check where topic like '출결·%';

  -- ① 출결 — 두 줄로 가른다. 한 줄로 하면 **대조가 이관을 그대로 다시 계산해** 아무것도 못 잡는다.
  --   ⓐ 날 수: 옛 두 원본의 (학생,날짜) **합집합**과 판 수가 같은가 — 순수한 사실, 안 순환한다
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '출결·날 수', x.who, x.old_n,
    (select count(*) from v2.day_sheet d where d.student_id=x.sid
       and to_char(d.date,'YYYY-MM')=x.ym), null
  from (
    select s.id sid, s.name||' '||to_char(u.date,'YYYY-MM') who,
           to_char(u.date,'YYYY-MM') ym, count(distinct u.date) old_n
    from v2.students s join (
      select student_id, date from public.daily_reports
      union select student_id, date from public.attendance
    ) u on u.student_id = s.id
    where s.import_batch='import'
    group by s.id, s.name, to_char(u.date,'YYYY-MM')
  ) x;

  --   ⓑ 갈래: **판에 출결이 적힌 줄만.** 판이 주인이므로 그대로 들어갔어야 한다
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '출결·'||x.k, x.who, x.old_n,
    -- ⚠️ 새 쪽도 **같은 범위**로 좁힌다 — 판에 출결이 적힌 날만.
    --    안 좁히면 「판에 출결이 안 적힌 909줄」이 새 쪽에만 더해져 늘 어긋난다
    (select count(*) from v2.day_sheet d where d.student_id=x.sid
       and to_char(d.date,'YYYY-MM')=x.ym and d.attend=x.k
       and exists (select 1 from public.daily_reports r2
                   where r2.student_id=d.student_id and r2.date=d.date
                     and r2.attendance_kind is not null)), null
  from (
    select case r.attendance_kind when 'late' then 'late' when 'absent' then 'absent'
                                  else 'present' end k,
           s.id sid, s.name||' '||to_char(r.date,'YYYY-MM') who,
           to_char(r.date,'YYYY-MM') ym, count(*) old_n
    from public.daily_reports r join v2.students s on s.id=r.student_id
    where s.import_batch='import' and r.attendance_kind is not null
    group by 1, s.id, s.name, to_char(r.date,'YYYY-MM')
  ) x;

  -- ② 보강 — 옛 장부의 makeup 이 여기로 왔다 (day_sheet 가 아니라)
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '보강·달', x.who, x.old_n,
    (select count(*) from v2.makeup m where m.student_id=x.sid
       and to_char(m.on_date,'YYYY-MM')=x.ym), null
  from (select s.id sid, s.name||' '||to_char(a.date,'YYYY-MM') who,
               to_char(a.date,'YYYY-MM') ym, count(*) old_n
        from public.attendance a join v2.students s on s.id=a.student_id
        where a.status='makeup' and s.import_batch='import'
        group by s.id, s.name, to_char(a.date,'YYYY-MM')) x;

  -- ③ 검사 — 학생 × 달 × ○△✕ (계획의 대조표 그대로)
  insert into v2.import_check(topic, who, old_val, new_val, note)
  select '검사·'||x.k, x.who, x.old_n,
    (select count(*) from v2.day_item t join v2.day_sheet d on d.id=t.sheet_id
       where d.student_id=x.sid and to_char(d.date,'YYYY-MM')=x.ym
         and t.status=x.k), null
  from (select case i.status when 'done' then 'done' when 'weak' then 'weak'
                             when 'missing' then 'missing' else 'none' end k,
               s.id sid, s.name||' '||to_char(r.date,'YYYY-MM') who,
               to_char(r.date,'YYYY-MM') ym, count(*) old_n
        from public.daily_report_items i
        join public.daily_reports r on r.id=i.daily_report_id
        join v2.students s on s.id=r.student_id
        where s.import_batch='import'
        group by 1, s.id, s.name, to_char(r.date,'YYYY-MM')) x;

  -- ④ 성적 — 학생 × 시험. 원점수까지 맞춘다
  insert into v2.import_check(topic, who, old_val, new_val, note)
  values ('성적 줄', null,
    (select count(*) from public.scores s join v2.students x on x.id=s.student_id
       where x.import_batch='import'),
    (select count(*) from v2.score where import_batch='import'), null),
   ('성적 원점수 합', null,
    (select coalesce(sum(s.raw_score),0) from public.scores s
       join v2.students x on x.id=s.student_id where x.import_batch='import'),
    (select coalesce(sum(raw),0) from v2.score where import_batch='import'), null),
   ('문항별 오답', null,
    (select count(*) from public.score_items si
       where exists (select 1 from v2.score s where s.id=si.score_id)),
    (select count(*) from v2.score_wrong), null),
   ('학습 항목', null,
    (select count(*) from public.homework_items),
    (select count(*) from v2.import_map where old_table='homework_items'), null),
   ('판', null,
    (select count(*) from public.daily_reports r join v2.students x on x.id=r.student_id
       where x.import_batch='import'),
    (select count(*) from v2.day_sheet d where d.import_batch='import'
       and exists (select 1 from public.daily_reports r
                   where r.student_id=d.student_id and r.date=d.date)), null),
   ('출결·판에 안 적힌 날', '→ present 로 봤다',
    (select count(*) from public.daily_reports r join v2.students x on x.id=r.student_id
       where x.import_batch='import' and r.attendance_kind is null),
    (select count(*) from public.daily_reports r join v2.students x on x.id=r.student_id
       where x.import_batch='import' and r.attendance_kind is null),
    '판이 있다는 것이 곧 그날 수업했다는 뜻이다'),
   ('검사 줄', null,
    (select count(*) from public.daily_report_items i
       join public.daily_reports r on r.id=i.daily_report_id
       join v2.students x on x.id=r.student_id where x.import_batch='import'),
    (select count(*) from v2.day_item t join v2.day_sheet d on d.id=t.sheet_id
       where d.import_batch='import'), null);
end $$;
grant execute on function v2.import_verify_day() to service_role;

drop function if exists v2.import_verify();
create function v2.import_verify()
returns table(topic text, who text, old_val numeric, new_val numeric, ok boolean, expected text)
language plpgsql security definer set search_path = v2, public as $$
declare skipped int := (select count(*) from v2.import_skip where old_table='textbooks');
begin
  perform v2.import_verify_base();
  perform v2.import_verify_day();
  if skipped > 0 then
    update v2.import_check c set old_val = c.old_val - skipped,
           expected = '안 옮기기로 정한 교재 '||skipped||'권을 뺐다'
    where c.topic = '교재 수';
  end if;
  return query select c.topic, c.who, c.old_val, c.new_val, c.ok, c.expected
               from v2.import_check c order by c.ok, c.topic, c.who;
end $$;
grant execute on function v2.import_verify() to service_role;
