-- 0135 4단계-3a(9/7) — 🏫 반 화면: 반 판(class_board) · 그 시각에 있는 아이 수(slot_count — 확정-㉔ 보여만 주고 막지 않는다) — 멱등. 표는 새로 없다(classes · class_schedule · class_member · fee_rule 그대로)
-- ① 반 판 — 반마다 지금 시간표(그날 기준) · 다음 시간표(예약된 것) · 명단 · 반 단가 줄 · 이 달 회차 · 재원생 목록(넣을 아이 고르기)
create or replace function v2.class_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with span as (select to_char(p_on, 'YYYY-MM') ym)
  select jsonb_build_object(
    'on', p_on, 'ym', (select ym from span),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'state', c.state, 'created_at', c.created_at,
        'schedule', (select jsonb_build_object('id', s.id, 'weekdays', s.weekdays, 'start_time', s.start_time, 'end_time', s.end_time, 'from_date', s.from_date, 'to_date', s.to_date)
                       from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1),
        'next_schedule', (select jsonb_build_object('id', s.id, 'weekdays', s.weekdays, 'start_time', s.start_time, 'end_time', s.end_time, 'from_date', s.from_date)
                            from v2.class_schedule s where s.class_id = c.id and s.from_date > p_on order by s.from_date limit 1),
        'members', (select coalesce(jsonb_agg(jsonb_build_object('student_id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'from_date', m.from_date) order by st.name), '[]'::jsonb)
                      from v2.class_member m join v2.students st on st.id = m.student_id left join v2.schools sc on sc.id = st.school_id
                     where m.class_id = c.id and m.from_date <= p_on and (m.to_date is null or m.to_date >= p_on)),
        'fee', (select jsonb_build_object('id', r.id, 'amount', r.amount, 'per_session', r.per_session, 'from_date', r.from_date)
                  from v2.fee_rule r where r.class_id = c.id and r.student_id is null and r.from_date <= p_on and (r.to_date is null or r.to_date >= p_on) order by r.from_date desc limit 1),
        'sessions', v2.session_count(c.id, (select ym from span)), 'extra', v2.class_extra_days(c.id, (select ym from span))) order by c.state, c.created_at), '[]'::jsonb)
                  from v2.classes c),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name) order by st.name), '[]'::jsonb)
                   from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'schedule.%')
  ) where v2.is_staff();
$$;
grant execute on function v2.class_board(date) to authenticated, service_role;
-- ② 그 시각에 있는 아이 수 — 그 요일에 만나는 반(시각 안 · 휴강 아닌)의 명단 + 그날 그 시각의 보강 줄. 02c 보강 자리를 고를 때 보여만 준다(확정-㉔ — 막지 않는다)
create or replace function v2.slot_count(p_date date, p_time time) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nickname', c.nickname, 'n', (select count(*) from v2.class_roster(c.id, p_date))) order by s.start_time), '[]'::jsonb)
                  from v2.classes c join v2.class_schedule s on s.class_id = c.id
                 where c.state = 'active' and s.from_date <= p_date and (s.to_date is null or s.to_date >= p_date)
                   and extract(dow from p_date)::smallint = any(s.weekdays) and s.start_time <= p_time and p_time < s.end_time
                   and not exists (select 1 from v2.holiday h where h.date = p_date and (h.class_id is null or h.class_id = c.id) and h.state = 'on')),
    'makeups', (select count(*) from v2.makeup m where m.on_date = p_date and m.at_time = p_time and m.state in ('set', 'todo'))
  ) where v2.is_staff();
$$;
grant execute on function v2.slot_count(date, time) to authenticated, service_role;
