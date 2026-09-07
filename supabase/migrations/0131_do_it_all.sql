-- 0131 · 「다 지금해」(원장님 2026-09-07) — ㉙ ④ N번 열어봄(video_view.opens · video_open) · 뼈대-8 치환 자리 설명 표(placeholder) · 처음-8 학교 교과서 표(school_book) · 표-6 고르는 값 check 11(새 줄부터 — NOT VALID: 옛 앱이 적은 줄은 안 건드린다) · 0-3 읽은 줄 대조 재료(판에 updated_at · cells_at) · 판 넷 다시(grid_board · student_board · inquiry_board · video_board). 한 번 더 돌려도 같다.
-- ⚠️ NOT VALID: 실제 DB 의 옛 값(이관·옛 앱)은 검사하지 않고 **새로 적는 줄부터** 건다 — 값 목록은 lib 의 목록과 같다(코드가 적는 값). 나중에 옛 값을 다 맞추면 validate constraint 로 굳힌다.
-- ④ N번 열어봄
alter table v2.video_view add column if not exists opens int not null default 0;
comment on column v2.video_view.opens is '아이가 이 영상을 연 횟수(재생기를 열 때 +1 · 목업 19 「2번 열어봄」) — 지나간 구간과 별개';
create or replace function v2.video_open(p_video uuid) returns int
language plpgsql security definer set search_path = v2, public as $$
declare me uuid; n int;
begin
  select id into me from v2.students where id in (select v2.my_students()) and profile_id = auth.uid() limit 1;
  if me is null then raise exception '아이 계정만 엽니다'; end if;
  if not exists (select 1 from v2.video_assign va where va.video_id = p_video and va.student_id = me and va.state = 'active') then raise exception '배정된 영상이 아닙니다'; end if;
  insert into v2.video_view (video_id, student_id, spans, last_pos, opens) values (p_video, me, '{}', 0, 1)
    on conflict (video_id, student_id) do update set opens = v2.video_view.opens + 1, updated_at = now()
    returning opens into n;
  return n;
end $$;
grant execute on function v2.video_open(uuid) to authenticated;
-- 뼈대-8 치환 자리 설명 표 — 설명은 표에, 채우는 손은 코드에(lib/send-plan unfilled 가 {{ }} 를 잡는다)
create table if not exists v2.placeholder (
  key text primary key, note text not null, example text, sort int not null default 0, created_at timestamptz not null default now()
);
comment on table v2.placeholder is '치환 자리 하나 — {{학생명}} 같은 자리의 설명(뼈대-8). 발송 10 이 이 목록을 보인다 · 안 채운 자리는 못 나간다(뼈대-11)';
alter table v2.placeholder enable row level security; alter table v2.placeholder force row level security;
drop policy if exists staff_all on v2.placeholder;
create policy staff_all on v2.placeholder for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.placeholder to authenticated, service_role;
insert into v2.placeholder (key, note, example, sort) values
  ('학생명', '아이 이름', '강민서', 1), ('학원명', '학원 이름(설정의 학원)', '클로이영어', 2), ('날짜', '그 안내의 날짜', '9월 7일(월)', 3), ('시간', '그 안내의 시각', '17:00', 4),
  ('내용', '안내 본문 — 원장님이 그때 적는 글', '', 5), ('교재목록', '아이에게 이어진 교재들', '중등3800제3 · 자이스토리', 6), ('구매링크', '교재 구매 주소', '', 7), ('테스트결과', '레벨테스트 결과 한 줄', '단어 32/40 · 문법 18/25', 8),
  ('다음달수업일', '다음 달 수업 날짜들(일정 12 에서 센다)', '10/6 · 10/8 · 10/13 …', 9), ('학원주소', '학원 주소(설정의 학원)', '', 10), ('주소', '학원 주소(옛 문구)', '', 11), ('전화', '학원 전화', '', 12), ('변수', '옛 문구의 자리표시 — 새 글에서는 안 쓴다', '', 13)
on conflict (key) do nothing;
-- 처음-8 교과서는 학교의 속성 — 학교 × 학년 × 연도 × 교재
create table if not exists v2.school_book (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references v2.schools(id) on delete restrict,
  grade smallint not null, year smallint not null,
  book_id uuid not null references v2.books(id) on delete restrict,
  note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (school_id, grade, year, book_id)
);
comment on table v2.school_book is '학교 × 학년 × 연도의 교과서 한 권(처음-8: 교과서는 학교의 속성 — 아이의 속성이 아니다). 내신 자료 04 가 회차의 학교·학년·연도로 찾아 「학교 교과서」로 보인다';
alter table v2.school_book enable row level security; alter table v2.school_book force row level security;
drop policy if exists staff_all on v2.school_book;
create policy staff_all on v2.school_book for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.school_book to authenticated, service_role;
drop trigger if exists school_book_touch on v2.school_book; create trigger school_book_touch before update on v2.school_book for each row execute function v2.touch_row();
drop trigger if exists school_book_audit on v2.school_book; create trigger school_book_audit after insert or update or delete on v2.school_book for each row execute function v2.audit_row();
-- 표-6 고르는 값은 DB 에도 건다 — 코드가 적는 값 목록 그대로(새 줄부터)
do $$ begin if not exists (select 1 from pg_constraint where conname = 'notify_log_kind_choice') then
  alter table v2.notify_log add constraint notify_log_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video')) not valid;   -- 알림 갈래 = lib/notify-plan LABEL 열
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'notify_log_sink_choice') then
  alter table v2.notify_log add constraint notify_log_sink_choice check (sink in ('off','self','live')) not valid;   -- 스위치 셋
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'job_queue_kind_choice') then
  alter table v2.job_queue add constraint job_queue_kind_choice check (kind in ('daily_report','late_notice','arrival_notice','leave_notice','attend_plan_notice')) not valid;   -- 큐 갈래 = lib/send-plan KINDS
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'scheduled_send_kind_choice') then
  alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video')) not valid;   -- 예약 갈래 = 알림 갈래
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'todo_kind_choice') then
  alter table v2.todo add constraint todo_kind_choice check (kind in ('make','print','hand','unit_test','retest','score','repeat','note')) not valid;   -- 할 일 갈래 여덟 = lib/todo-plan KINDS
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'inquiry_way_choice') then
  alter table v2.inquiry add constraint inquiry_way_choice check (way in ('phone','site','visit','intro')) not valid;   -- 문의 유입 = lib/inquiry-plan WAYS
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'payment_source_choice') then
  alter table v2.payment add constraint payment_source_choice check (source in ('manual','excel')) not valid;   -- 수납 출처 = lib/fee(손 · 엑셀)
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'books_area_choice') then
  alter table v2.books add constraint books_area_choice check (area in ('문법','의미덩어리','독해','영작','내신','블록구문','단어')) not valid;   -- 영역 일곱 = lib/routine-plan AREAS
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'area_routine_area_choice') then
  alter table v2.area_routine add constraint area_routine_area_choice check (area in ('문법','의미덩어리','독해','영작','내신','블록구문','단어')) not valid;   -- 영역 일곱 = lib/routine-plan AREAS
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'student_routine_area_choice') then
  alter table v2.student_routine add constraint student_routine_area_choice check (area in ('문법','의미덩어리','독해','영작','내신','블록구문','단어')) not valid;   -- 영역 일곱 = lib/routine-plan AREAS
end if; end $$;
do $$ begin if not exists (select 1 from pg_constraint where conname = 'day_area_memo_area_choice') then
  alter table v2.day_area_memo add constraint day_area_memo_area_choice check (area in ('문법','의미덩어리','독해','영작','내신','블록구문','단어')) not valid;   -- 영역 일곱 = lib/routine-plan AREAS
end if; end $$;
-- 0-3 읽은 줄 대조 재료 · ④ 연 횟수 — 판 넷을 다시 낸다(같은 몸에 칸만 더한다)
create or replace function v2.grid_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'me', auth.uid(),
    'grids', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'rows', g.rows, 'template', g.template, 'sort', g.sort, 'state', g.state, 'board_col', g.board_col, 'created_by', g.created_by, 'created_at', g.created_at,
                 'cols', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'type', c.type, 'options', c.options, 'sort', c.sort, 'state', c.state) order by c.sort, c.id), '[]'::jsonb) from v2.grid_col c where c.grid_id = g.id),
                 'rows_', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'school_id', r.school_id, 'school', sc.name, 'level', sc.level, 'student_id', r.student_id, 'student', st.name, 'student_school', ssc.name, 'grade', st.grade, 'label', r.label, 'sort', r.sort, 'state', r.state,
                              'cells', (select coalesce(jsonb_object_agg(x.col_id, x.value), '{}'::jsonb) from v2.grid_cell x where x.row_id = r.id),
                              'cells_at', (select coalesce(jsonb_object_agg(x.col_id, x.updated_at), '{}'::jsonb) from v2.grid_cell x where x.row_id = r.id)) order by r.sort, r.created_at), '[]'::jsonb)
                            from v2.grid_row r left join v2.schools sc on sc.id = r.school_id left join v2.students st on st.id = r.student_id left join v2.schools ssc on ssc.id = st.school_id where r.grid_id = g.id))
               order by g.sort, g.created_at), '[]'::jsonb) from v2.grid g),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school_id', st.school_id, 'school', sc.name, 'grade', st.grade) order by st.name), '[]'::jsonb) from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b where b.state = 'active'),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from) order by coalesce(e.english_on, e.term_from) desc), '[]'::jsonb)
                from v2.exams e left join v2.schools sc on sc.id = e.school_id where e.state = 'active' and not e.hidden and coalesce(e.term_to, e.english_on, e.term_from) >= p_on - 180),
    'watch', (select coalesce(jsonb_agg(jsonb_build_object('student_id', w.student_id, 'name', st.name, 'school', sc.name, 'note', w.note, 'updated_at', w.updated_at) order by w.updated_at desc), '[]'::jsonb)
                from v2.student_watch w join v2.students st on st.id = w.student_id left join v2.schools sc on sc.id = st.school_id)
  ) where v2.is_staff()
$$;
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
                  'phone', st.phone, 'parent_phone', st.parent_phone, 'memo', st.memo, 'score_show', st.score_show, 'progress_edit', st.progress_edit, 'stop_weeks', st.stop_weeks, 'warn_report_at', st.warn_report_at, 'profile_id', st.profile_id, 'updated_at', st.updated_at,
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
create or replace function v2.inquiry_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with cls as (select c.id, c.kind, c.nickname, cs.weekdays, cs.start_time from v2.classes c
                 left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
                where c.state = 'active')
  select jsonb_build_object(
    'today', p_on,
    'inquiries', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'updated_at', q.updated_at, 'name', q.name, 'phone', q.phone, 'student_phone', q.student_phone, 'school', q.school, 'grade', q.grade, 'way', q.way, 'stage', q.stage, 'body', q.body,
                     'visit_at', q.visit_at, 'test_at', q.test_at, 'level_note', q.level_note, 'suggest', q.suggest, 'answered_at', q.answered_at, 'why', q.why, 'student_id', q.student_id, 'student', st.name, 'created_at', q.created_at, 'updated_at', q.updated_at)
                   order by q.created_at desc), '[]'::jsonb)
                    from v2.inquiry q left join v2.students st on st.id = q.student_id where q.stage in ('new', 'test', 'visit') or q.updated_at >= (p_on - 180)::timestamptz),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', to_jsonb(c.weekdays), 'start_time', c.start_time) order by c.start_time, c.nickname), '[]'::jsonb) from cls c),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b where b.state = 'active'),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'access', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'key', a.key, 'allowed', a.allowed)), '[]'::jsonb) from v2.role_access a where a.key like 'ops.%')
  ) where v2.is_staff()
$$;
create or replace function v2.video_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select case when v2.is_staff() then jsonb_build_object(
    'today', p_on,
    'videos', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'url', v.url, 'folder', v.folder, 'seconds', v.seconds, 'state', v.state,
                  'assigns', (select coalesce(jsonb_agg(jsonb_build_object('id', va.id, 'student_id', va.student_id, 'student_name', st.name, 'due_on', va.due_on, 'state', va.state, 'created_at', va.created_at,
                                  'secs', vp.secs, 'pct', vp.pct, 'done_at', vp.done_at, 'last_pos', vp.last_pos, 'opens', coalesce(vv.opens, 0)) order by st.name), '[]'::jsonb)
                                from v2.video_assign va join v2.students st on st.id = va.student_id
                                left join lateral (select p.secs, p.pct, p.done_at, p.last_pos from v2.video_progress(va.student_id) p where p.video_id = v.id) vp on true
                                left join v2.video_view vv on vv.video_id = v.id and vv.student_id = va.student_id
                               where va.video_id = v.id)) order by v.folder nulls last, v.title), '[]'::jsonb)
                 from v2.video v),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name) order by st.name), '[]'::jsonb)
                   from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'video.%')
  ) end
$$;
-- ④ 아이 화면도 연 횟수를 본다 — 지나간 구간과 한 번에(돌려주는 꼴이 바뀌어 지우고 다시)
drop function if exists v2.video_progress(uuid);
create function v2.video_progress(p_student uuid) returns table (video_id uuid, secs int, pct int, done_at timestamptz, last_pos int, spans jsonb, opens int)
language sql stable as $$
  with m as (select vv.video_id, vv.done_at, vv.last_pos, vv.opens, range_agg(r) mr from v2.video_view vv left join lateral unnest(vv.spans) r on true where vv.student_id = p_student group by vv.video_id, vv.done_at, vv.last_pos, vv.opens),
  s as (select m.video_id, m.done_at, m.last_pos, m.opens, coalesce((select sum(upper(x) - lower(x)) from unnest(m.mr) x), 0)::int t,
               coalesce((select jsonb_agg(jsonb_build_array(lower(x), upper(x)) order by lower(x)) from unnest(m.mr) x), '[]'::jsonb) sp from m)
  select s.video_id, s.t, case when coalesce(v.seconds, 0) > 0 then least(100, round(s.t * 100.0 / v.seconds))::int end, s.done_at, s.last_pos, s.sp, s.opens
    from s join v2.video v on v.id = s.video_id
$$;
grant execute on function v2.video_progress(uuid) to authenticated, service_role;

-- ── 아이·학부모 쪽 📎·🎬 판 한 벌 — mine_board(아이, 언제부터) ────────────────────────────────────────
-- 왜: 학부모 09 의 파도가 20 을 넘었다(영상 둘을 더 태우자 22). 📎 붙임(마감한 판의 숙제에 붙은 것) · 📎 내가 보낸 것 · 🎬 배정 · 🎬 지나간 구간 —
--     네 조회를 한 판으로. security invoker — 접근 규칙(own_link · own_file · own_va · own_view · 마감한 판만)이 그대로 걸린다(정책은 표에 한 벌).
--     모양은 PostgREST 가 주던 것 그대로(file · day_item.learn_items · day_item.day_sheet · students.name) — 화면·판단(files-plan · video-plan)은 안 바뀐다.
create or replace function v2.mine_board(p_student uuid, p_lo date) returns jsonb
language sql stable security invoker set search_path = v2, public as $$
  select jsonb_build_object(
    'links', (select coalesce(jsonb_agg(jsonb_build_object(
                 'file_id', fl.file_id, 'day_item_id', fl.day_item_id, 'seen_by_child', fl.seen_by_child, 'seen_at', fl.seen_at, 'created_at', fl.created_at,
                 'file', case when f.id is null then null else jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'note', f.note) end,
                 'day_item', jsonb_build_object('id', di.id, 'slot', di.slot, 'range_note', di.range_note, 'item_id', di.item_id,
                               'learn_items', case when li.id is null then null else jsonb_build_object('name', li.name) end,
                               'day_sheet', jsonb_build_object('student_id', ds.student_id, 'date', ds.date))
               ) order by fl.created_at desc), '[]'::jsonb)
               from v2.file_link fl
               join v2.day_item di on di.id = fl.day_item_id
               join v2.day_sheet ds on ds.id = di.sheet_id
               left join v2.file f on f.id = fl.file_id
               left join v2.learn_items li on li.id = di.item_id
               where ds.student_id = p_student and fl.created_at >= (p_lo::timestamp at time zone 'UTC')),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'note', f.note, 'uploaded_at', f.uploaded_at,
                                                          'reply', f.reply, 'replied_at', f.replied_at, 'student_id', f.student_id,
                                                          'students', case when st.id is null then null else jsonb_build_object('name', st.name) end) order by f.uploaded_at desc), '[]'::jsonb)
             from (select * from v2.file where by_profile = auth.uid() and uploaded_at >= (p_lo::timestamp at time zone 'UTC') order by uploaded_at desc limit 20) f
             left join v2.students st on st.id = f.student_id),
    'assigns', (select coalesce(jsonb_agg(jsonb_build_object('id', va.id, 'video_id', va.video_id, 'due_on', va.due_on, 'state', va.state, 'created_at', va.created_at,
                                                             'video', jsonb_build_object('id', v.id, 'title', v.title, 'url', v.url, 'folder', v.folder, 'seconds', v.seconds, 'state', v.state))), '[]'::jsonb)
                from v2.video_assign va join v2.video v on v.id = va.video_id where va.student_id = p_student and va.state = 'active'),
    'progress', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from v2.video_progress(p_student) p)
  );
$$;
grant execute on function v2.mine_board(uuid, date) to authenticated, service_role;
