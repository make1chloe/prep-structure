-- 0110 · 이관 함수 import_rest 를 다시 — 0042 그대로, ⑤ 보강의 충돌 대상 한 줄만 0109 의 makeup_key(부분 유일 색인, 물린 줄 제외)에 맞춘다.
-- 부분 유일 색인은 on conflict 에 같은 조건(where state <> 'cancelled')을 적어야 잡힌다 — 안 적으면 「matching the ON CONFLICT specification」 오류로 이관 ⑤ 에서 멈춘다.
-- 함수 본문은 마지막 마이그레이션이 정한다(0027 → 0028 과 같은 길). 0042 는 역사로 남는다 — 두 벌이 아니라 한 벌의 이전 판이다.
create or replace function v2.import_rest() returns table(what text, n int)
language plpgsql security definer set search_path = v2, public as $$
declare DOW constant jsonb := '{"일":0,"월":1,"화":2,"수":3,"목":4,"금":5,"토":6}';
begin
  -- ① 반 — 이름은 안 가져온다
  insert into v2.classes(id, kind, nickname, state, import_batch)
  select c.id,
         case when c.category='특강' then 'special' else 'regular' end,
         null,                                    -- ⚠️ 이름 안 가져옴
         case when c.archived_at is not null then 'closed' else 'active' end,
         'import'
  from public.classes c
  where c.id::text not in (select old_id from v2.import_skip where old_table='classes')
  on conflict (id) do update set kind=excluded.kind, state=excluded.state;
  what:='classes'; n:=(select count(*)::int from v2.classes where import_batch='import'); return next;

  -- ② 요일·시각 — **회차가 여기서 나온다**
  insert into v2.class_schedule(class_id, from_date, to_date, weekdays, start_time, end_time)
  select c.id,
         coalesce(c.starts_on::date, '2026-01-01'::date),
         c.archived_at::date,
         (select array_agg((DOW->>d)::smallint order by (DOW->>d)::smallint)
            from unnest(c.days) d where DOW ? d),
         c.start_time, c.end_time
  from public.classes c
  where c.id::text not in (select old_id from v2.import_skip where old_table='classes')
    and c.days is not null and array_length(c.days,1) > 0
  on conflict (class_id, from_date) do nothing;
  what:='class_schedule'; n:=(select count(*)::int from v2.class_schedule); return next;

  -- ③ 반 명단 — ⚠️ **기간이 없어 이관일로 박는다**
  insert into v2.class_member(class_id, student_id, from_date, import_batch)
  select cs.class_id, cs.student_id, coalesce(c.starts_on::date, v2.today()), 'import'
  from public.class_students cs join public.classes c on c.id = cs.class_id
  where exists (select 1 from v2.classes  x where x.id=cs.class_id)
    and exists (select 1 from v2.students x where x.id=cs.student_id)
  on conflict do nothing;
  insert into v2.import_map(old_table, old_id, skip_why)
  select 'class_students', cs.class_id::text||'|'||cs.student_id::text,
         '⚠️ 옛 앱에 **소속 기간이 없다** — 시작일을 이관일로 박았다. 이관일 이전 달 회차·수강료는 못 맞춘다'
  from public.class_students cs join public.classes c on c.id=cs.class_id
  where c.starts_on is null
  on conflict (old_table, old_id) do nothing;
  what:='class_member'; n:=(select count(*)::int from v2.class_member); return next;

  -- ④ 출결 → 판. 옛 present 12 · absent 140 · makeup 368
  insert into v2.day_sheet(student_id, date, attend, import_batch)
  select a.student_id, a.date,
         case a.status when 'present' then 'present' when 'absent' then 'absent'
                       when 'makeup' then 'makeup' else 'present' end,
         'import'
  from public.attendance a
  where exists (select 1 from v2.students x where x.id=a.student_id)
    and a.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (student_id, date, class_id) do nothing;
  what:='day_sheet(출결)'; n:=(select count(*)::int from v2.day_sheet where import_batch='import'); return next;

  -- ⑤ 보강
  insert into v2.makeup(student_id, of_date, on_date, at_time, state)
  -- ⚠️ `makeup_of` 는 **id 가 아니라 날짜**다 — 「어느 날 결석의 보강인가」
  select a.student_id, a.makeup_of, a.date,
         a.makeup_time, case when a.makeup_confirmed_at is not null then 'done'
                             when coalesce(a.makeup_waived,false) then 'waived' else 'set' end
  from public.attendance a
  where a.status='makeup' and exists (select 1 from v2.students x where x.id=a.student_id)
    and a.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (student_id, on_date, of_date) where state <> 'cancelled' do nothing;   -- 0109: makeup_key 는 살아 있는 줄만 세는 부분 색인 — 충돌 대상에 같은 조건을 적어야 그 색인을 쓴다
  what:='makeup'; n:=(select count(*)::int from v2.makeup); return next;

  -- ⑥ 수납 · 휴강
  insert into v2.payment(student_id, ym, amount, paid_on, method, note, source, import_batch)
  select p.student_id, p.ym, p.amount, p.paid_on, p.method, p.note, p.source, 'import'
  from public.payments p where exists (select 1 from v2.students x where x.id=p.student_id)
  on conflict (student_id, ym) do nothing;
  what:='payment'; n:=(select count(*)::int from v2.payment); return next;

  insert into v2.holiday(date, class_id, reason)
  select h.date, h.class_id, h.name from public.holidays h
  where h.class_id is null or exists (select 1 from v2.classes x where x.id=h.class_id)
  on conflict do nothing;
  what:='holiday'; n:=(select count(*)::int from v2.holiday); return next;

  -- ⑦ 상담 (옛 student_notes 168줄)
  insert into v2.consult(id, student_id, at, way, body, created_by, import_batch)
  select sn.id, sn.student_id, coalesce(sn.created_at, sn.date::timestamptz), sn.kind,
         coalesce(sn.body, sn.raw), sn.created_by, 'import'
  from public.student_notes sn
  where exists (select 1 from v2.students x where x.id=sn.student_id)
  on conflict (id) do nothing;
  what:='consult'; n:=(select count(*)::int from v2.consult); return next;

  -- ⑧ 신규 문의
  insert into v2.inquiry(id, name, phone, school, grade, way, stage, body, student_id, created_at)
  -- ⚠️ 옛 `grade` 는 **글자**다(「중2」 같은 값) — 숫자만 뽑고 없으면 비운다
  -- ⚠️ 옛 status: enrolled 20 · declined 32 · consulted 1 — **접는 표가 필요하다**
  select i.id, i.name, i.phone, i.school,
         nullif(regexp_replace(coalesce(i.grade,''),'[^0-9]','','g'),'')::smallint,
         i.source,
         case i.status when 'enrolled'  then 'joined'
                       when 'declined'  then 'dropped'
                       when 'consulted' then 'visit'
                       else 'new' end,
         i.memo, i.student_id, i.created_at
  from public.inquiries i
  where i.student_id is null or exists (select 1 from v2.students x where x.id=i.student_id)
  on conflict (id) do nothing;
  what:='inquiry'; n:=(select count(*)::int from v2.inquiry); return next;

  -- ⑨ 할 일 — 옛 kind: schedule 226 · todo 13
  insert into v2.todo(id, kind, title, note, due_on, due_time, state, done_at, private, created_at)
  select t.id, coalesce(t.kind,'todo'), t.title, t.note, t.due_on, t.due_time,
         case t.status when 'done' then 'done' when 'doing' then 'doing' else 'todo' end,
         t.done_at, coalesce(t.private,false), t.created_at
  from public.tasks t
  on conflict (id) do nothing;
  what:='todo'; n:=(select count(*)::int from v2.todo); return next;

  -- ⑩ 공지
  insert into v2.notice(id, title, body, to_role, class_id, sent_at, created_by, created_at)
  select n2.id, coalesce(n2.title,'공지'), n2.body,
         case n2.scope when 'student' then 'student' when 'parent' then 'parent' else 'both' end,
         n2.class_id, n2.created_at, n2.created_by, n2.created_at
  from public.notices n2
  where n2.class_id is null or exists (select 1 from v2.classes x where x.id=n2.class_id)
  on conflict (id) do nothing;
  what:='notice'; n:=(select count(*)::int from v2.notice); return next;
end $$;
grant execute on function v2.import_rest() to service_role;
