-- 0121 · 수강료 13 — 학원 사람의 쓰기 권한(단가 줄 · 수납) · 수강료 판 한 벌
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다 — check-sql 이 SETUP_ALL 을 3번 돌린다.

-- ══ ① 권한 — 규칙(staff_all)은 0016 에 있는데 쓰기 권한이 없던 표(check-grants 의 그 사고). 지우는 권한은 없다(대전제-6 · 돈의 이력은 남는다, 처음-1)
grant insert, update on v2.fee_rule, v2.payment to authenticated;

-- ══ ② 수강료 판 한 벌(속도-상한: 껍질 1 · 로그인 1 · 오늘 1 · 이것 1) — 그 달 재원생과 반(회차 = session_count + 반 보강일, 일정 12 와 같은 셈) · 그 달에 걸친 단가 줄 · 그 달 수납 · 학년별 기준(옛 설정 tuition.byGrade) · 운영 권한 줄. 학원 사람만
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
    'by_grade', (select coalesce(i.config->'byGrade', '{}'::jsonb) from v2.integration i where i.id = 'tuition'),
    'access', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'key', a.key, 'allowed', a.allowed)), '[]'::jsonb) from v2.role_access a where a.key like 'ops.%')
  ) from span where v2.is_staff()
$$;
comment on function v2.fee_board(char) is '수강료 13 이 읽는 한 벌 — 그 달 재원생·반(회차) · 그 달에 걸친 단가 줄(언제부터 얼마) · 그 달 수납 · 학년별 기준(옛 설정) · 운영 권한. 청구액은 저장하지 않고 화면이 센다(대전제-5) — 받은 금액(payment.amount)만 적는다';
grant execute on function v2.fee_board(char) to authenticated, service_role;
