-- 0122 · 시험 회차 06b — 교재 멈춤을 회차에 묶는다(영어 시험일 − N주부터 · 시험 끝나는 날 저절로 풀림, 확정-⑬·㊺b) · 범위(교재 단원) 쓰기 권한 · 「안 봄」(아이) · 「숨김」(회차)(9/5 ⑳) · 시험 회차 판 한 벌
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다 — check-sql 이 SETUP_ALL 을 3번 돌린다.

-- ══ ① 규칙 줄(뼈대-5) — 몇 주 전부터(학교급) · 부모님께 글 「시험전·시험후」의 날 수
insert into v2.rule (key, value, note) values
  ('prep.stop_weeks.high',   '6', '고등학교 — 영어 시험일에서 거꾸로 몇 주 전부터 정규 교재를 멈추나(확정-㊺b · 목업 06). 아이마다 따로는 students.stop_weeks'),
  ('prep.stop_weeks.middle', '4', '중학교 — 같은 뜻'),
  ('prep.stop_weeks.elem',   '4', '초등학교 — 같은 뜻(초등은 지필이 드물어 회차가 거의 없다)'),
  ('prep.phase_before_days', '7', '영어 시험일이 이 날 수 안이면 부모님께 글의 갈래가 「시험전」으로 저절로 골라진다(목업 01 ✉️ · 2차-7 남긴 것)'),
  ('prep.phase_after_days',  '3', '영어 시험일부터 이 날 수 안이면 「시험후」')
on conflict (key) do nothing;

-- ══ ② 칸 셋 — 아이마다 따로(비면 학교급) · 멈춤 시작일 · 회차 숨김
alter table v2.students add column if not exists stop_weeks smallint;
comment on column v2.students.stop_weeks is '이 아이만 따로 — 영어 시험일 몇 주 전부터 정규 교재를 멈추나(비면 학교급 규칙 prep.stop_weeks.*, 확정-㊺b)';
alter table v2.student_book add column if not exists stop_from date;
comment on column v2.student_book.stop_from is '멈춤이 시작되는 날(비면 지금부터). 회차에 묶으면 영어 시험일 − N주. stop_until 이 지나면 저절로 풀린다(확정-⑬) — 판단은 lib/routine-plan stopOn 한 곳';
alter table v2.exams add column if not exists hidden boolean not null default false;
comment on column v2.exams.hidden is '회차 숨김(9/5 ⑳) — 통째로 안 보는 회차(중1 자유학기 · 고3 2학기 기말 …). 대비·범위 재촉·교재 멈춤에서 빠진다. 지우지 않는다(대전제-6)';

-- ══ ③ 「안 봄」(아이 × 회차) — 이 아이는 이 회차를 안 본다(영어시험-특징 §5: 중1 자유학기 · 중3 2학기 기말 · 고3 2학기). 되돌릴 땐 지우지 않고 skipped 를 끈다(대전제-6)
create table if not exists v2.exam_skip (
  exam_id    uuid not null references v2.exams(id) on delete cascade,
  student_id uuid not null references v2.students(id) on delete cascade,
  skipped    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (exam_id, student_id)
);
comment on table v2.exam_skip is '한 줄 = 「이 아이는 이 회차를 안 본다」(9/5 ⑳). 보는 아이 셈(exam_takers)·교재 멈춤·성적 미입력 재촉(16)이 이 줄을 뺀다. 되돌리면 skipped=false(지우지 않는다)';
alter table v2.exam_skip enable row level security;
alter table v2.exam_skip force row level security;   -- 켜고 강제(check-grants) — 정의자 함수도 규칙을 지난다
drop policy if exists staff_all on v2.exam_skip;
create policy staff_all on v2.exam_skip for all using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.exam_skip to authenticated;
drop trigger if exists exam_skip_touch on v2.exam_skip;
create trigger exam_skip_touch before update on v2.exam_skip for each row execute function v2.touch_row();
drop trigger if exists exam_skip_audit on v2.exam_skip;
create trigger exam_skip_audit after insert or update or delete on v2.exam_skip for each row execute function v2.audit_row();

-- ══ ④ 쓰기 권한 — 범위(prep_scope: 규칙은 0016 에 있는데 권한이 없던 표 · 지우는 권한은 없다, 빼는 것은 removed_on) · 아이의 「따로 N주」 한 칸만
grant insert, update on v2.prep_scope to authenticated;
grant update (stop_weeks) on v2.students to authenticated;

-- ══ ⑤ 이 회차를 보는 아이들 — 학교 회차: 같은 학교(학년이 적혔으면 그 학년) · 전국: 고등학교 아이 전부(학년이 적혔으면 그 학년) · 「안 봄」은 뺀다 · 재원생만. 판의 「N명」·교재 멈춤·(16 성적)이 같은 것을 쓴다(원칙-1 · lib/exam-plan takes 와 같은 판단)
create or replace function v2.exam_takers(p_exam uuid) returns table (student_id uuid)
language sql stable security definer set search_path = v2, public as $$
  select st.id from v2.exams e
    join v2.students st on st.state = 'active'
    join v2.schools sc on sc.id = st.school_id
   where e.id = p_exam and e.state = 'active' and v2.is_staff()
     and ((e.scope = 'school' and st.school_id = e.school_id) or (e.scope = 'national' and sc.level = 'high'))
     and (e.grade is null or st.grade = e.grade)
     and not exists (select 1 from v2.exam_skip k where k.exam_id = e.id and k.student_id = st.id and k.skipped)
   order by st.name
$$;
comment on function v2.exam_takers(uuid) is '이 회차를 보는 재원생 — 학교 회차는 같은 학교(+학년) · 전국은 고등 전부(+학년) · 「안 봄」 뺌. 시험 회차 06b 의 N명 · 교재 멈춤 묶기 · 성적 16 이 같은 것을 쓴다';
grant execute on function v2.exam_takers(uuid) to authenticated, service_role;

-- ══ ⑥ 시험 회차 판 한 벌(속도-상한 일정 8 · 3단: 로그인 1 · 오늘 1 · 이것 1) — 지난 한 달부터의 회차(보는 아이 · 안 봄 · 범위 · 묶인 교재 수) · 학교 · 재원생(따로 N주) · 교재(범위 고르기) · prep.* 규칙. 학원 사람만
create or replace function v2.exam_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'level', sc.level, 'grade', e.grade, 'name', e.name,
                'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source, 'hidden', e.hidden,
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
comment on function v2.exam_board(date) is '시험 회차 06b 가 읽는 한 벌 — 지난 한 달부터의 회차(보는 아이 ids · 안 봄 · 범위 · 묶인 교재 수) · 학교 · 재원생 · 교재 · prep.* 규칙. 청구액처럼 세는 것(N명·N줄)은 화면이 센다';
grant execute on function v2.exam_board(date) to authenticated, service_role;

-- ══ ⑦ 루틴 판(0119)에 멈춤 시작일·묶인 회차를 더한다 — 11 의 교재 줄이 stopOn 과 같은 판단으로 「M/D 부터 멈춤」을 말하게. 몸은 0119 그대로, 두 칸만
create or replace function v2.routine_board(p_student uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_student, (select id from v2.students where state = 'active' order by name limit 1)) sid)
  select jsonb_build_object(
    'student', pick.sid,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'method', i.method, 'checks', i.checks, 'state', i.state, 'sort', i.sort) order by i.sort, i.name), '[]'::jsonb) from v2.learn_items i),
    'area_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', ar.id, 'area', ar.area::text, 'item_id', ar.item_id, 'place', ar.place, 'required', ar.required, 'sort', ar.sort, 'state', ar.state,
                                                                 'name', li.name, 'method', li.method, 'checks', li.checks, 'item_state', li.state) order by ar.area, ar.sort), '[]'::jsonb)
                    from v2.area_routine ar join v2.learn_items li on li.id = ar.item_id),
    'book_counts', (select coalesce(jsonb_object_agg(b.area, b.n), '{}'::jsonb) from (select area::text area, count(*) n from v2.books where state = 'active' and area is not null group by area) b),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'grade', s.grade) order by s.name), '[]'::jsonb) from v2.students s where s.state = 'active'),
    'student_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'area', sr.area::text, 'item_id', sr.item_id, 'place', sr.place, 'sort', sr.sort, 'state', sr.state,
                                                                    'count_n', sr.count_n, 'criterion', sr.criterion, 'gate_prev', sr.gate_prev, 'name', li.name, 'method', li.method, 'item_state', li.state) order by sr.area, sr.sort), '[]'::jsonb)
                       from v2.student_routine sr join v2.learn_items li on li.id = sr.item_id where sr.student_id = pick.sid),
    'student_books', (select coalesce(jsonb_agg(jsonb_build_object('id', sb.id, 'book_id', sb.book_id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'from_date', sb.from_date, 'round', sb.round,
                                                                    'per_session', sb.per_session, 'order_basis', coalesce(sb.order_basis, b.order_basis), 'own_basis', sb.order_basis,
                                                                    'unit_test', sb.unit_test, 'unit_test_n', sb.unit_test_n, 'stop_mode', sb.stop_mode, 'stop_until', sb.stop_until, 'stop_from', sb.stop_from, 'stop_exam_id', sb.stop_exam_id,
                                                                    'remaining', (select count(*) from v2.todo_units(pick.sid, sb.book_id, p_on)),
                                                                    'total', (select count(*) from v2.units u where u.book_id = sb.book_id and u.state = 'active')) order by sb.from_date desc), '[]'::jsonb)
                       from v2.student_book sb join v2.books b on b.id = sb.book_id
                      where sb.student_id = pick.sid and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
    'days', (select coalesce(jsonb_agg(d.date order by d.date), '[]'::jsonb) from v2.student_days(pick.sid, p_on, p_on + 400) d where d.kind in ('class', 'makeup')),
    'books_free', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b
                    where b.state = 'active' and pick.sid is not null
                      and not exists (select 1 from v2.student_book sb where sb.student_id = pick.sid and sb.book_id = b.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)))
  ) from pick where v2.is_staff()
$$;
