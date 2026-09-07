-- 0136 4단계-4(9/7) — 수강료 13 판에 「지난달 안 받은 집」(이월 표시 · 달마다 따로 세던 것을 앞 달과 잇는다). 단원 손질·학년별 기준·수납 방법·확인 풀기·백분위는 표가 이미 있어 손만 더했다 — 멱등
create or replace function v2.fee_board(p_ym char(7)) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with span as (select (p_ym || '-01')::date m1, ((p_ym || '-01')::date + interval '1 month - 1 day')::date m2)
  select jsonb_build_object(
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'level', sc.level,
                   'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', s.weekdays, 'start_time', s.start_time, 'sessions', v2.session_count(c.id, p_ym), 'extra', v2.class_extra_days(c.id, p_ym)) order by s.start_time), '[]'::jsonb)
                                 from v2.class_member m join v2.classes c on c.id = m.class_id, span
                                 left join lateral (select * from v2.class_schedule x where x.class_id = c.id and x.from_date <= span.m2 and (x.to_date is null or x.to_date >= span.m1) order by x.from_date desc limit 1) s on true
                                where m.student_id = st.id and m.from_date <= span.m2 and (m.to_date is null or m.to_date >= span.m1) and c.state = 'active')) order by st.name), '[]'::jsonb)
                  from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'rules', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'student_id', r.student_id, 'class_id', r.class_id, 'from_date', r.from_date, 'to_date', r.to_date, 'amount', r.amount, 'base_sessions', r.base_sessions, 'per_session', r.per_session) order by r.from_date desc), '[]'::jsonb)
               from v2.fee_rule r, span where r.from_date <= span.m2 and (r.to_date is null or r.to_date >= span.m1)),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'student_id', p.student_id, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method, 'note', p.note, 'source', p.source)), '[]'::jsonb) from v2.payment p where p.ym = p_ym),
    'prev_unpaid', (select jsonb_build_object('n', count(*), 'sum', coalesce(sum(p.amount), 0), 'names', coalesce(jsonb_agg(st.name order by st.name), '[]'::jsonb))
                      from v2.payment p join v2.students st on st.id = p.student_id
                     where p.ym = to_char((p_ym || '-01')::date - interval '1 month', 'YYYY-MM') and p.amount is not null and p.paid_on is null and st.state = 'active'),   -- 지난달 안 받은 집(이월 표시 · 4단계-4)
    'by_grade', (select coalesce(i.config->'byGrade', '{}'::jsonb) from v2.integration i where i.id = 'tuition'),
    'access', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'key', a.key, 'allowed', a.allowed)), '[]'::jsonb) from v2.role_access a where a.key like 'ops.%')
  ) from span where v2.is_staff()
$$;
grant execute on function v2.fee_board(char) to authenticated, service_role;
