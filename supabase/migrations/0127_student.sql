-- 0127 · 학생 14 · 신규 상담 18 — 아이 칸(들어온 날 · 나간 날 · 전화 · 메모) · 문의 칸(방문 · 레벨 · 점수 · 제안 · 답한 때 · 사유) · 계정 표시(앱이 발급한 것만 비밀번호 초기화, 대전제-12) · 권한 · 문지기 · 판 둘. 한 번 더 돌려도 같다.
-- ⚠️ 퇴원해도 줄은 남는다(원장님 9/3 · 답 ④⑤⑥⑦ 「지우지 마」) — 퇴원은 state left + 나간 날. 재원생·학부모의 진짜 비밀번호는 전환일까지 안 건드린다(대전제-12) — 앱이 발급한 계정(issued_by_app)만 0000 으로 초기화한다.
alter table v2.students add column if not exists joined_on date;
alter table v2.students add column if not exists left_on date;
alter table v2.students add column if not exists phone text;
alter table v2.students add column if not exists parent_phone text;
alter table v2.students add column if not exists memo text;
comment on column v2.students.joined_on is '들어온 날 — 「2024.03 ~ 재원 2년 7개월」(목업 14). 등록 전환이 오늘로 찍는다';
comment on column v2.students.left_on is '나간 날 — 퇴원 처리(state left)와 같이. 줄은 남는다';
comment on column v2.students.parent_phone is '학부모 전화 — 학부모 계정 아이디이기도 하다(0032)';
alter table v2.profiles add column if not exists issued_by_app boolean not null default false;
comment on column v2.profiles.issued_by_app is '앱이 발급한 계정(등록 전환 · 14 계정 발급). ⚠️ 이 표시가 있는 계정만 비밀번호를 0000 으로 초기화한다 — 이관된 재원생·학부모 계정은 전환일까지 안 건드린다(대전제-12)';
alter table v2.inquiry add column if not exists student_phone text;
alter table v2.inquiry add column if not exists visit_at timestamptz;
alter table v2.inquiry add column if not exists test_at timestamptz;
alter table v2.inquiry add column if not exists level_note text;
alter table v2.inquiry add column if not exists suggest text;
alter table v2.inquiry add column if not exists answered_at timestamptz;
alter table v2.inquiry add column if not exists why text;
comment on column v2.inquiry.visit_at is '상담(방문) 잡힌 때 — 있으면 「상담 잡힘」 칸 · 원장 달력에 뜬다(할 일 줄)';
comment on column v2.inquiry.test_at is '레벨테스트 잡힌 때 — 없으면 「레벨테스트를 아직 안 잡았습니다」';
comment on column v2.inquiry.level_note is '레벨 점수(「단어 32/40 · 문법 18/25」)';
comment on column v2.inquiry.suggest is '제안 교재(글) — 등록 전환에서 교재 잇기의 실마리';
comment on column v2.inquiry.answered_at is '안내를 보낸 때 — 비어 있으면 「답 안 한 문의」(🔥 오늘 답할 것)';
comment on column v2.inquiry.why is '안 온 사유 — 다음에 참고';
insert into v2.purge_map(tbl, col, how, note) values
  ('students', 'phone', 'null', '아이 전화'), ('students', 'parent_phone', 'null', '학부모 전화'), ('students', 'memo', 'null', '아이 메모'),
  ('inquiry', 'student_phone', 'null', '문의 아이 전화'), ('inquiry', 'level_note', 'null', '레벨 점수'), ('inquiry', 'suggest', 'null', '제안'), ('inquiry', 'why', 'null', '안 온 사유')
on conflict do nothing;
-- ══ 권한 — 규칙(staff_all 0003·0016)은 있는데 권한이 없던 표(0070 의 함정). 사람 표는 문지기가 한 겹 더
grant insert, update on v2.students, v2.profiles, v2.parent_student, v2.class_member, v2.consult, v2.inquiry to authenticated, service_role;
create or replace function v2.profiles_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare me text;
begin
  if auth.uid() is null then return new; end if;                                            -- 서버 자신
  select role into me from v2.profiles where id = auth.uid();
  if me = 'principal' then return new; end if;
  if tg_op = 'INSERT' and new.role not in ('student', 'parent') then raise exception '원장만 학원 사람 계정을 만듭니다'; end if;
  if tg_op = 'UPDATE' and (old.role not in ('student', 'parent') or new.role <> old.role) then raise exception '원장만 학원 사람 계정을 고칩니다'; end if;
  return new;
end $$;
drop trigger if exists profiles_guard on v2.profiles;
create trigger profiles_guard before insert or update on v2.profiles for each row execute function v2.profiles_guard();
comment on function v2.profiles_guard() is '강사·조교는 학생·학부모 계정만 만들고 고친다 — 역할을 못 바꾸고 학원 사람 줄에 못 닿는다. 원장·서버 자신은 지나간다';

-- ══ 판 둘(정의자 · 학원 사람만). 세는 것(재원생 N · 퇴원생 N · %)은 화면이 센다(대전제-5) — 재료(분자·분모)만 준다
create or replace function v2.student_board(p_student uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with m as (select date_trunc('month', p_on)::date f, (date_trunc('month', p_on) + interval '1 month - 1 day')::date t),
  cur_class as (select cm.student_id, c.id class_id, c.kind, c.nickname, cs.weekdays, cs.start_time, cs.end_time
                  from v2.class_member cm join v2.classes c on c.id = cm.class_id
                  left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
                 where cm.from_date <= p_on and (cm.to_date is null or cm.to_date >= p_on)),
  cls as (select c.id, c.kind, c.nickname, c.state, cs.weekdays, cs.start_time, cs.end_time from v2.classes c
            left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
           where c.state = 'active'),
  pass as (select coalesce((select value::int from v2.rule where key = 'unit_test.pass_pct'), 80) pct)
  select jsonb_build_object(
    'today', p_on, 'month', to_char(p_on, 'YYYY-MM'),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_id', st.school_id, 'level', sc.level, 'state', st.state, 'joined_on', st.joined_on, 'left_on', st.left_on,
                'class', (select jsonb_build_object('id', x.class_id, 'kind', x.kind, 'nickname', x.nickname, 'weekdays', to_jsonb(x.weekdays), 'start_time', x.start_time) from cur_class x where x.student_id = st.id limit 1),
                'books', (select coalesce(jsonb_agg(distinct b.name), '[]'::jsonb) from v2.student_book sb join v2.books b on b.id = sb.book_id where sb.student_id = st.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
                'last_consult', (select max(c.at) from v2.consult c where c.student_id = st.id),
                'login_id', pr.login_id, 'must_change_pw', pr.must_change_pw, 'issued_by_app', pr.issued_by_app,
                'parent_login', (select pp.login_id from v2.parent_student ps join v2.profiles pp on pp.id = ps.parent_profile_id where ps.student_id = st.id order by ps.created_at limit 1))
              order by case st.state when 'active' then 0 when 'paused' then 1 else 2 end, st.name), '[]'::jsonb)
              from v2.students st left join v2.schools sc on sc.id = st.school_id left join v2.profiles pr on pr.id = st.profile_id where st.state <> 'prospect'),
    'student', (select jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_id', st.school_id, 'level', sc.level, 'state', st.state, 'joined_on', st.joined_on, 'left_on', st.left_on,
                  'phone', st.phone, 'parent_phone', st.parent_phone, 'memo', st.memo, 'score_show', st.score_show, 'progress_edit', st.progress_edit, 'stop_weeks', st.stop_weeks, 'warn_report_at', st.warn_report_at, 'profile_id', st.profile_id,
                  'login_id', pr.login_id, 'must_change_pw', pr.must_change_pw, 'issued_by_app', pr.issued_by_app,
                  'class', (select jsonb_build_object('id', x.class_id, 'kind', x.kind, 'nickname', x.nickname, 'weekdays', to_jsonb(x.weekdays), 'start_time', x.start_time) from cur_class x where x.student_id = st.id limit 1),
                  'parents', (select coalesce(jsonb_agg(jsonb_build_object('profile_id', pp.id, 'login_id', pp.login_id, 'name', pp.name, 'rel', ps.rel, 'issued_by_app', pp.issued_by_app) order by ps.created_at), '[]'::jsonb) from v2.parent_student ps join v2.profiles pp on pp.id = ps.parent_profile_id where ps.student_id = st.id),
                  'siblings', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', o.id, 'name', o.name, 'grade', o.grade, 'school', osc.name, 'level', osc.level)), '[]'::jsonb)
                                 from v2.parent_student a join v2.parent_student b on b.parent_profile_id = a.parent_profile_id and b.student_id <> a.student_id
                                 join v2.students o on o.id = b.student_id left join v2.schools osc on osc.id = o.school_id where a.student_id = st.id))
                from v2.students st left join v2.schools sc on sc.id = st.school_id left join v2.profiles pr on pr.id = st.profile_id where st.id = p_student),
    'kpi', (select jsonb_build_object(
              'hw_done', (select count(*) from v2.day_item i join v2.day_sheet ds on ds.id = i.sheet_id, m where ds.student_id = p_student and ds.date between m.f and m.t and i.slot = 'check' and i.status = 'done'),
              'hw_total', (select count(*) from v2.day_item i join v2.day_sheet ds on ds.id = i.sheet_id, m where ds.student_id = p_student and ds.date between m.f and m.t and i.slot = 'check' and i.status in ('done', 'weak', 'missing')),
              'word_pass', (select count(*) from v2.quiz q where q.student_id = p_student and q.kind = 'word' and q.passed = true),
              'word_total', (select count(*) from v2.quiz q where q.student_id = p_student and q.kind = 'word' and q.passed is not null),
              'ut_pass', (select count(*) from v2.unit_test u, pass where u.student_id = p_student and u.state = 'scored' and u.correct * 100 >= coalesce(u.q_count, 0) * pass.pct),
              'ut_total', (select count(*) from v2.unit_test u where u.student_id = p_student and u.state = 'scored'),
              'att_present', (select count(*) from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t and ds.attend in ('present', 'late', 'early', 'online', 'makeup')),
              'att_absent', (select count(*) from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t and ds.attend = 'absent'),
              'att_total', (select count(*) from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t and ds.attend is not null and ds.attend <> 'off'),
              'late21', (select count(*) from v2.late_stay l join v2.day_sheet ds on ds.id = l.sheet_id where ds.student_id = p_student and l.until_at is not null and ds.date > p_on - 21 and ds.date <= p_on),
              'warn', (select to_jsonb(w) from v2.warn_states(array[p_student], p_on) w limit 1))
            where p_student is not null),
    'attend', (select coalesce(jsonb_agg(jsonb_build_object('date', ds.date, 'attend', ds.attend, 'closed', ds.closed_at is not null,
                  'arrived_at', (select a.at from v2.arrival a where a.student_id = p_student and a.date = ds.date and a.step = 2 limit 1),
                  'left_at', (select a.at from v2.arrival a where a.student_id = p_student and a.date = ds.date and a.step = 4 limit 1)) order by ds.date), '[]'::jsonb)   -- 하원은 arrival 걸음 4 한 곳(0083 — late_stay.left_at 은 걷어냈다)
                 from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'book_id', x.book_id, 'name', b.name, 'area', b.area::text, 'round', x.round, 'order_basis', coalesce(x.order_basis, b.order_basis), 'stop_mode', x.stop_mode, 'stop_from', x.stop_from, 'stop_until', x.stop_until, 'from_date', x.from_date,
                  'total', (select count(*) from v2.units u where u.book_id = x.book_id and u.state = 'active'),
                  'done', (select count(*) from v2.progress p join v2.units u on u.id = p.unit_id where p.student_id = p_student and p.round = x.round and u.book_id = x.book_id and u.state = 'active' and p.status in ('done', 'skip')),
                  'cursor', (select c.chapter from v2.cursor_of(p_student, x.book_id, p_on) c limit 1)) order by x.from_date desc, b.name), '[]'::jsonb)
                from (select distinct on (book_id) * from v2.student_book where student_id = p_student and from_date <= p_on and (to_date is null or to_date >= p_on) order by book_id, from_date desc) x join v2.books b on b.id = x.book_id),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'raw', s.raw, 'full_score', s.full_score, 'grade', s.grade, 'confirmed', s.confirmed, 'show_to', s.show_to, 'taken_on', s.taken_on, 'by_who', s.by_who,
                  'wrongs', (select coalesce(jsonb_agg(w.q_no order by w.q_no), '[]'::jsonb) from v2.score_wrong w where w.score_id = s.id),
                  'exam', jsonb_build_object('id', e.id, 'name', e.name, 'scope', e.scope, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to, 'cuts', to_jsonb(e.cuts), 'level', sc.level, 'school', sc.name,
                    'questions', (select coalesce(jsonb_agg(jsonb_build_object('q_no', q.q_no, 'kind', q.kind) order by q.q_no), '[]'::jsonb) from v2.exam_question q where q.exam_id = e.id)))
                order by coalesce(e.english_on, e.term_from) desc), '[]'::jsonb)
                 from v2.score s join v2.exams e on e.id = s.exam_id left join v2.schools sc on sc.id = e.school_id where s.student_id = p_student),
    'unit_tests', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'topic', g.name, 'correct', u.correct, 'q_count', u.q_count, 'taken_on', u.taken_on, 'state', u.state) order by coalesce(u.taken_on, u.assigned_on)), '[]'::jsonb)
                     from v2.unit_test u left join v2.grammar_topics g on g.id = u.topic_id where u.student_id = p_student),
    'history', jsonb_build_object(
      'books', (select coalesce(jsonb_agg(jsonb_build_object('from_date', x.from_date, 'to_date', x.to_date, 'round', x.round, 'name', b.name) order by x.from_date desc), '[]'::jsonb) from v2.student_book x join v2.books b on b.id = x.book_id where x.student_id = p_student),
      'classes', (select coalesce(jsonb_agg(jsonb_build_object('from_date', cm.from_date, 'to_date', cm.to_date, 'class', jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', to_jsonb(cs.weekdays), 'start_time', cs.start_time)) order by cm.from_date desc), '[]'::jsonb)
                    from v2.class_member cm join v2.classes c on c.id = cm.class_id
                    left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.from_date and (s.to_date is null or s.to_date >= cm.from_date) order by s.from_date desc limit 1) cs on true
                   where cm.student_id = p_student),
      'consults', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'at', c.at, 'way', c.way, 'body', c.body) order by c.at desc), '[]'::jsonb) from v2.consult c where c.student_id = p_student)),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', to_jsonb(c.weekdays), 'start_time', c.start_time) order by c.start_time, c.nickname), '[]'::jsonb) from cls c),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'access', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'key', a.key, 'allowed', a.allowed)), '[]'::jsonb) from v2.role_access a where a.key like 'ops.%'),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key in ('unit_test.pass_pct', 'late.repeat_days', 'late.repeat_count', 'warn.report_at'))
  ) where v2.is_staff()
$$;
comment on function v2.student_board(uuid, date) is '학생 14 가 읽는 한 벌 — 목록(재원·퇴원 · 반 · 교재 · 마지막 상담 · 계정) · 고른 아이(기본 · 계정 · 학부모 · 형제) · 이 달 KPI 재료(숙제 · 단어 · 단원평가 · 출결 · 3주 늦귀가 · 경고) · 이 달 출결(등원·하원 시각 — 답 ⑩) · 교재 진도(끝낸/전체 · 커서) · 성적(문항표 붙여) · 단원평가 · 지나온 것(교재 · 반 · 상담) · 반 · 학교 · 권한 · 규칙. %는 화면이 센다';
grant execute on function v2.student_board(uuid, date) to authenticated, service_role;

create or replace function v2.inquiry_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with cls as (select c.id, c.kind, c.nickname, cs.weekdays, cs.start_time from v2.classes c
                 left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
                where c.state = 'active')
  select jsonb_build_object(
    'today', p_on,
    'inquiries', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'phone', q.phone, 'student_phone', q.student_phone, 'school', q.school, 'grade', q.grade, 'way', q.way, 'stage', q.stage, 'body', q.body,
                     'visit_at', q.visit_at, 'test_at', q.test_at, 'level_note', q.level_note, 'suggest', q.suggest, 'answered_at', q.answered_at, 'why', q.why, 'student_id', q.student_id, 'student', st.name, 'created_at', q.created_at, 'updated_at', q.updated_at)
                   order by q.created_at desc), '[]'::jsonb)
                    from v2.inquiry q left join v2.students st on st.id = q.student_id where q.stage in ('new', 'test', 'visit') or q.updated_at >= (p_on - 180)::timestamptz),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', to_jsonb(c.weekdays), 'start_time', c.start_time) order by c.start_time, c.nickname), '[]'::jsonb) from cls c),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b where b.state = 'active'),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'access', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'key', a.key, 'allowed', a.allowed)), '[]'::jsonb) from v2.role_access a where a.key like 'ops.%')
  ) where v2.is_staff()
$$;
comment on function v2.inquiry_board(date) is '신규 상담 18 이 읽는 한 벌 — 문의(하는 중 전부 + 지난 반년의 등록·안 옴) · 반(등록 전환의 반 배정) · 교재(교재 잇기) · 학교 · 권한. 칸(오늘 답할 것 · 상담 잡힘 · 레벨 봄 · 등록 · 안 옴)은 화면이 가른다';
grant execute on function v2.inquiry_board(date) to authenticated, service_role;
