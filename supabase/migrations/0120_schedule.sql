-- 0120 · 일정 12 · 학사일정 받아오기 12b — 회차 기준 규칙 줄 · 반 보강일 셈 · 일정 판 한 벌 · 받아오기 판 한 벌 · 학원 사람의 쓰기 권한
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다 — check-sql 이 SETUP_ALL 을 3번 돌린다.

-- ══ ① 규칙 줄(뼈대-5) — 「8회가 모든 반의 기준」(원장님 확정 · 인수인계 s12). 특강은 회차만큼 받으므로 기준이 없다
insert into v2.rule (key, value, note) values
  ('schedule.sessions_per_month', '8', '정규반 한 달 회차 기준 — 요일 × 달 − 휴강 + 반 보강일. 못 채우면 「보강일 잡기」(12 일정)')
on conflict (key) do nothing;

-- ══ ② 반 보강일 — 학생 보강 줄(v2.makeup) 중 「빠진 날(of_date)이 없는」 것이 반 보강일이다(8회 채우기). 그 반 아이들의 그 달 보강 날짜 수
create or replace function v2.class_extra_days(p_class uuid, p_ym char(7)) returns int
language sql stable as $$
  select count(distinct m.on_date)::int
    from v2.makeup m
   where m.of_date is null and m.state = 'set' and m.on_date is not null
     and to_char(m.on_date, 'YYYY-MM') = p_ym
     and m.student_id in (select r.student_id from v2.class_roster(p_class, (p_ym || '-01')::date) r)
$$;
comment on function v2.class_extra_days(uuid, char) is '반 보강일 수(8회 채우기) — 빠진 날 없이 잡은 보강(of_date null · set)의 날짜를 센다. 회차 = session_count + 이것';

-- ══ ③ 권한 — 규칙(staff_all)은 0009·0016·0031 에 있는데 쓰기 권한이 없던 표들(check-grants 의 그 사고). 지우는 권한은 없다(대전제-6)
grant insert, update on v2.holiday, v2.exams, v2.schools, v2.todo, v2.month_confirm to authenticated;

-- ══ ④ 일정 판 한 벌(속도-상한 일정 8 · 2단) — 그 달의 반·회차 · 휴강 · 결석·보강 · 지각 예정 · 시험 · 할 일 · 규칙. 학원 사람만(아니면 null)
create or replace function v2.schedule_board(p_ym char(7), p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with span as (select ((p_ym || '-01')::date - 7) f, ((p_ym || '-01')::date + interval '1 month' + interval '7 day')::date t, (p_ym || '-01')::date m1)
  select jsonb_build_object(
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname,
                  'weekdays', s.weekdays, 'start_time', s.start_time, 'end_time', s.end_time,
                  'members', (select count(*) from v2.class_roster(c.id, greatest(span.m1, p_on)) r),
                  'sessions', v2.session_count(c.id, p_ym), 'extra', v2.class_extra_days(c.id, p_ym)) order by s.start_time, c.created_at), '[]'::jsonb)
                 from v2.classes c, span
                 left join lateral (select * from v2.class_schedule x where x.class_id = c.id and x.from_date <= span.t and (x.to_date is null or x.to_date >= span.m1) order by x.from_date desc limit 1) s on true
                where c.state = 'active'),
    'holidays', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'date', h.date, 'class_id', h.class_id, 'reason', h.reason, 'state', h.state) order by h.date), '[]'::jsonb)
                  from v2.holiday h, span where h.date between span.f and span.t),
    'makeups', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'student_id', m.student_id, 'name', st.name, 'of_date', m.of_date, 'on_date', m.on_date, 'at_time', m.at_time, 'state', m.state, 'reason', m.reason,
                  'class_ids', (select coalesce(jsonb_agg(sc.class_id), '[]'::jsonb) from v2.student_classes(m.student_id, p_on) sc)) order by coalesce(m.of_date, m.on_date), st.name), '[]'::jsonb)
                 from v2.makeup m join v2.students st on st.id = m.student_id, span
                where m.state <> 'cancelled' and ((m.of_date between span.f and span.t) or (m.on_date between span.f and span.t))),
    'lates', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'student_id', l.student_id, 'name', st.name, 'date', l.date, 'minutes', l.minutes, 'reason', l.reason,
                  'class_ids', (select coalesce(jsonb_agg(sc.class_id), '[]'::jsonb) from v2.student_classes(l.student_id, p_on) sc)) order by l.date, st.name), '[]'::jsonb)
               from v2.late_plan l join v2.students st on st.id = l.student_id, span
              where l.cancelled_at is null and l.date between span.f and span.t),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'grade', e.grade, 'name', e.name, 'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source) order by coalesce(e.term_from, e.english_on)), '[]'::jsonb)
               from v2.exams e left join v2.schools sc on sc.id = e.school_id, span
              where e.state = 'active' and ((e.term_from <= span.t and e.term_to >= span.f) or (e.english_on between span.f and span.t))),
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'name', st.name) order by t.due_on, t.due_time), '[]'::jsonb)
               from v2.todo t left join v2.students st on st.id = t.student_id, span
              where t.state in ('todo', 'doing') and t.due_on between span.f and span.t),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'schedule.%')
  ) where v2.is_staff()
$$;
comment on function v2.schedule_board(char, date) is '일정 12 가 읽는 한 벌 — 그 달(앞뒤 7일)의 반·회차(요일×달−휴강+반 보강일) · 휴강 · 결석·보강 · 지각 예정 · 시험 · 할 일 · 규칙. 학원 사람만';

-- ══ ⑤ 받아오기 판 한 벌(12b) — 학교(나이스 코드·홈페이지) · 앞으로의 시험(전국·학교) · 전국 낱말 · 마지막 받은 때(세어 나온다) · 열쇠 있나(값은 안 나간다)
create or replace function v2.import_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level, 'neis_code', s.neis_code, 'site_url', s.site_url,
                  'students', (select count(*) from v2.students st where st.school_id = s.id and st.state = 'active'),
                  'neis_exams', (select count(*) from v2.exams e where e.school_id = s.id and e.source = 'neis' and e.state = 'active' and e.term_to >= p_on - 30)) order by s.name), '[]'::jsonb)
                 from v2.schools s where s.state = 'active'),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'grade', e.grade, 'name', e.name, 'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source, 'updated_at', e.updated_at) order by coalesce(e.term_from, e.english_on), sc.name), '[]'::jsonb)
               from v2.exams e left join v2.schools sc on sc.id = e.school_id
              where e.state = 'active' and coalesce(e.term_to, e.english_on, e.term_from) >= p_on - 30),
    'words', (select coalesce(jsonb_agg(jsonb_build_object('word', w.word, 'scope', w.scope) order by w.word), '[]'::jsonb) from v2.exam_word w),
    'last_neis_at', (select max(e.updated_at) from v2.exams e where e.source = 'neis'),
    'neis_key', (select coalesce(nullif(trim(i.config->>'key'), ''), '') <> '' from v2.integration i where i.id = 'neis')
  ) where v2.is_staff()
$$;
comment on function v2.import_board(date) is '학사일정 받아오기 12b 가 읽는 한 벌 — 학교(나이스 코드·홈페이지·아이 수·나이스 시험 수) · 지난 한 달부터의 시험 · 전국 낱말 · 마지막 받은 때 · 열쇠 있나(참·거짓만). 학원 사람만';
grant execute on function v2.class_extra_days(uuid, char), v2.schedule_board(char, date), v2.import_board(date) to authenticated, service_role;
