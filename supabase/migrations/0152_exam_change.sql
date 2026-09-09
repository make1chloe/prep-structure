-- 0152 (저) 일정·시험 셋(남긴 것 12b·06b·02c).
-- ① 나이스가 기간을 옮기면 「학교 일정이 바뀌었어요」 — 받아오기는 같은 회차(갈래·학교·학년·이름)의 옛 줄을 그대로 두고(id · 범위·안 봄·교재 멈춤이 붙어 있다 ·
--    열쇠에 시작날이 들어 새 줄이 될 뻔한 것도 옛 줄에 잇는다) 기간만 옮기며 이전 기간을 남긴다(prev_term_* · changed_at). 원장님이 「봤음」(changed_seen_at) 할 때까지
--    12b 결과 · 대시보드 📅 · 06b 꼬리표가 띄운다(영어일은 안 건드린다).
-- ② 02c 「시험 기간 = 결석 예상(표시만)」 — 이 아이가 보는 회차의 기간을 달력에 📝 로 → v2.student_exams(보는 아이 판단은 exam_takers 한 곳).
-- ③ 새벽 정리가 회차 멈춤을 다시 맞춘다(lib/exam syncStopsDaily — 크론 한 바퀴 앞 · 새로 이은 교재 · 학교·학년이 바뀐 아이 · 끝난 창) — 서버 자신(service role · auth.uid() 없음)도
--    exam_takers 를 읽어야 한다(못 읽으면 보는 아이가 0 이라 묶인 교재를 다 풀어 버린다) · run_repeats 의 문과 같은 꼴(0125·0137).
alter table v2.exams add column if not exists prev_term_from  date;
alter table v2.exams add column if not exists prev_term_to    date;
alter table v2.exams add column if not exists changed_at      timestamptz;
alter table v2.exams add column if not exists changed_seen_at timestamptz;
comment on column v2.exams.prev_term_from  is '(저) 나이스가 기간을 옮기기 전의 시작 — 받아오기가 적는다(이전 것을 지우지 않는다)';
comment on column v2.exams.prev_term_to    is '(저) 나이스가 기간을 옮기기 전의 끝';
comment on column v2.exams.changed_at      is '(저) 나이스가 기간을 옮긴 때 — 12b 결과 · 대시보드 📅 · 06b 가 「학교 일정이 바뀌었어요」 로 띄운다';
comment on column v2.exams.changed_seen_at is '(저) 원장님이 「봤음」 한 때 — 그때부터 꼬리표가 내려간다(이전 기간은 남는다)';

-- ══ exam_takers — 0122 그대로 + 서버 자신(auth.uid() 이 없는 크론)도 읽는다: 새벽 정리(syncAllStops)가 보는 아이를 못 읽으면 묶인 교재를 다 풀어 버린다(run_repeats 의 문 — 0125)
create or replace function v2.exam_takers(p_exam uuid) returns table (student_id uuid)
language sql stable security definer set search_path = v2, public as $$
  select st.id from v2.exams e
    join v2.students st on st.state = 'active'
    join v2.schools sc on sc.id = st.school_id
   where e.id = p_exam and e.state = 'active' and (v2.is_staff() or auth.uid() is null)
     and ((e.scope = 'school' and st.school_id = e.school_id) or (e.scope = 'national' and sc.level = 'high'))
     and (e.grade is null or st.grade = e.grade)
     and not exists (select 1 from v2.exam_skip k where k.exam_id = e.id and k.student_id = st.id and k.skipped)
   order by st.name
$$;
comment on function v2.exam_takers(uuid) is '이 회차를 보는 재원생 — 학교 회차는 같은 학교(+학년) · 전국은 고등 전부(+학년) · 「안 봄」 뺌. 시험 회차 06b 의 N명 · 교재 멈춤 묶기 · 성적 16 · 02c 시험 기간(student_exams)이 같은 것을 쓴다. 학원 사람 · 서버 자신(크론 새벽 정리 — 0152)';
grant execute on function v2.exam_takers(uuid) to authenticated, service_role;

-- ══ 이 아이가 보는 회차 — 02c 달력의 「시험 기간」(exam_takers 를 거꾸로 — 같은 판단 한 곳). 숨긴 회차·물린 회차는 없다. 학원 사람만(02c 는 원장 화면)
create or replace function v2.student_exams(p_student uuid, p_from date, p_to date)
returns table (id uuid, name text, scope text, school text, term_from date, term_to date, english_on date)
language sql stable security definer set search_path = v2, public as $$
  select e.id, e.name, e.scope, sc.name, e.term_from, e.term_to, e.english_on
    from v2.exams e left join v2.schools sc on sc.id = e.school_id
   where v2.is_staff() and e.state = 'active' and not e.hidden and e.term_from is not null
     and coalesce(e.term_to, e.term_from) >= p_from and e.term_from <= p_to
     and exists (select 1 from v2.exam_takers(e.id) t where t.student_id = p_student)
   order by e.term_from, e.name
$$;
comment on function v2.student_exams(uuid, date, date) is '(저) 이 아이가 보는 회차 가운데 기간이 이 날들과 겹치는 것 — 02c 달력 「📝 시험 기간 — 결석 예상(표시만)」. 보는 아이 판단은 exam_takers 한 곳';
grant execute on function v2.student_exams(uuid, date, date) to authenticated, service_role;

-- ══ exam_board — 0122 그대로 + 옮겨진 기간 넷(검사-74: 앞 열쇠 전부 그대로)
create or replace function v2.exam_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'level', sc.level, 'grade', e.grade, 'name', e.name,
                'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source, 'hidden', e.hidden, 'prev_term_from', e.prev_term_from, 'prev_term_to', e.prev_term_to, 'changed_at', e.changed_at, 'changed_seen_at', e.changed_seen_at,
                'takers', (select coalesce(jsonb_agg(t.student_id), '[]'::jsonb) from v2.exam_takers(e.id) t),
                'skips', (select coalesce(jsonb_agg(jsonb_build_object('student_id', k.student_id, 'name', st.name) order by st.name), '[]'::jsonb)
                            from v2.exam_skip k join v2.students st on st.id = k.student_id where k.exam_id = e.id and k.skipped),
                'scopes', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'book_id', p.book_id, 'book', b.name, 'unit_id', p.unit_id, 'chapter', u.chapter,
                                                                         'short', case when p.unit_id is null then null else v2.unit_label(u.id, false) end,
                                                                         'free_note', p.free_note, 'added_on', p.added_on, 'removed_on', p.removed_on) order by p.added_on, u.sort), '[]'::jsonb)
                             from v2.prep_scope p left join v2.books b on b.id = p.book_id left join v2.units u on u.id = p.unit_id where p.exam_id = e.id),
                'stopped', (select count(*) from v2.student_book sb where sb.stop_exam_id = e.id and sb.stop_mode <> 'running' and (sb.to_date is null or sb.to_date >= p_on))
              ) order by coalesce(e.english_on, e.term_from), sc.name, e.grade), '[]'::jsonb)
              from v2.exams e left join v2.schools sc on sc.id = e.school_id
             where e.state = 'active' and coalesce(e.term_to, e.english_on, e.term_from) >= p_on - 30),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level,
                  'students', (select count(*) from v2.students st where st.school_id = s.id and st.state = 'active')) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school_id', st.school_id, 'level', sc.level, 'stop_weeks', st.stop_weeks) order by st.name), '[]'::jsonb)
                   from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b where b.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'prep.%')
  ) where v2.is_staff()
$$;
