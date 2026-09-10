-- 0155 (허) 로드맵 08 셋 — 칸에서 바로 찍기 · 조각 「낸 것 · 남은 것」 · 원장 진도 체크를 14 학생 화면에도.
-- 남긴 것(2차 21·18)에 적어 둔 셋을 지운다. 표는 하나도 안 늘린다 — 이미 있는 표(v2.progress_part · v2.progress · v2.progress_flag)를
-- 판이 안 실어 줘서 화면이 못 그리던 것뿐이라, 판 둘을 다시 낸다(앞 열쇠는 전부 그대로 — 검사-74).
-- ① road_board — 소단원에 쪽·문항 수(q_count · page_start · page_end)와 이 회독의 조각(parts). 08 이 02b 와 **같은 셈**으로
--    「낸 것 1-20 · 남은 것 21-62」를 그린다(확정-⑳ · 셈은 lib/progress-plan.js coverage·partsText 한 벌 — 원칙-1).
-- ② student_board — 그 아이의 진도 체크 셋(progress_pending: 아이가 찍고 확인 안 한 줄 · progress_flags: 아직 안 본 ❗ ·
--    progress_edit: 학원 열림·이 아이 모드). 14 에서 그 아이만 확인·되돌리기·❗ 처분을 할 수 있다(설정 진도 체크와 같은 손 — lib/progress.js).
-- 되돌리는 것은 없다(값을 안 고친다 · 판만 넓힌다). 멱등 — create or replace 뿐이다.

create or replace function v2.road_board(p_student uuid, p_book uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with sb as (select * from v2.student_book where student_id = p_student and book_id = p_book and from_date <= p_on and (to_date is null or to_date >= p_on) order by from_date desc limit 1)
  select jsonb_build_object(
    'today', p_on,
    'student', (select jsonb_build_object('id', st.id, 'name', st.name, 'progress_edit', st.progress_edit) from v2.students st where st.id = p_student),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('book_id', x.book_id, 'name', b.name, 'area', b.area::text, 'round', x.round, 'stop_mode', x.stop_mode, 'stop_from', x.stop_from, 'stop_until', x.stop_until, 'per_session', x.per_session) order by x.from_date desc, b.name), '[]'::jsonb)
                from (select distinct on (book_id) * from v2.student_book where student_id = p_student and from_date <= p_on and (to_date is null or to_date >= p_on) order by book_id, from_date desc) x join v2.books b on b.id = x.book_id),
    'book', (select jsonb_build_object('id', b.id, 'name', b.name, 'area', b.area::text, 'order_basis', coalesce((select order_basis from sb), b.order_basis), 'chunk_depth', b.chunk_depth) from v2.books b where b.id = p_book),
    'sb', (select to_jsonb(sb) from sb),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'chapter', u.chapter, 'mid', u.mid, 'sub', u.sub, 'activity', u.activity, 'is_workbook', u.is_workbook, 'sort', u.sort, 'short', v2.unit_label(u.id, false), 'q_count', u.q_count, 'page_start', u.page_start, 'page_end', u.page_end) order by u.sort), '[]'::jsonb)
                from v2.units u where u.book_id = p_book and u.state = 'active'),
    'progress', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', p.unit_id, 'status', p.status, 'last_by', p.last_by, 'confirmed', p.confirmed, 'marked_on', p.marked_on, 'done_on', p.done_on)), '[]'::jsonb)
                   from v2.progress p join v2.units u on u.id = p.unit_id where p.student_id = p_student and u.book_id = p_book and p.round = coalesce((select round from sb), 1)),
    'flags', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'unit_id', f.unit_id, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false), 'kind', f.kind, 'said', f.said, 'raised_at', f.raised_at, 'seen_at', f.seen_at, 'outcome', f.outcome) order by f.raised_at desc), '[]'::jsonb)
                from v2.progress_flag f join v2.units u on u.id = f.unit_id where f.student_id = p_student and u.book_id = p_book),
    'edit', jsonb_build_object('academy_open', (select is_open from v2.progress_edit where scope = 'academy'), 'opened_on', (select opened_on from v2.progress_edit where scope = 'academy'), 'can_edit', v2.can_edit_progress(p_student)),
    'days', (select coalesce(jsonb_agg(d.date order by d.date), '[]'::jsonb) from v2.student_days(p_student, p_on, p_on + 400) d where d.kind in ('class', 'makeup')),
    'parts', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', pp.unit_id, 'q_from', pp.q_from, 'q_to', pp.q_to, 'page_from', pp.page_from, 'page_to', pp.page_to)), '[]'::jsonb)
                from v2.progress_part pp join v2.units u on u.id = pp.unit_id
               where pp.student_id = p_student and u.book_id = p_book and pp.round = coalesce((select round from sb), 1)),   -- (허) 조각 — 08 줄 밑 「낸 것 · 남은 것」(확정-⑳ · 02b 와 같은 셈)
    'remaining', (select count(*) from v2.todo_units(p_student, p_book, p_on))
  ) where v2.is_staff() or p_student in (select v2.my_own_student())
$$;
comment on function v2.road_board(uuid, uuid, date) is '로드맵 08 이 읽는 한 벌 — 제 아이(또는 학원 사람)만. 배정 교재들(상태) · 고른 교재의 소단원 · 이 회독의 진도(누가 찍었나 · 확인됐나) · ❗ 이의 · 진도 체크 열림(학원 · 이 아이) · 앞으로의 수업일(이대로면) · 남은 소단원. 진도 나무는 표 하나 · 보기 넷(확정-51)';
grant execute on function v2.road_board(uuid, uuid, date) to authenticated, service_role;

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
      'consults', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'at', c.at, 'way', c.way, 'body', c.body,
                     'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime) order by f.orig_name), '[]'::jsonb) from v2.file_link l join v2.file f on f.id = l.file_id where l.consult_id = c.id)) order by c.at desc), '[]'::jsonb) from v2.consult c where c.student_id = p_student)),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'uploaded_at', f.uploaded_at, 'note', f.note, 'by_role', p.role,
                 'links', (select coalesce(jsonb_agg(jsonb_build_object('day_item_id', l.day_item_id, 'notice_id', l.notice_id, 'consult_id', l.consult_id)), '[]'::jsonb) from v2.file_link l where l.file_id = f.id and l.bin_id is null)) order by f.uploaded_at desc), '[]'::jsonb)
                from (select * from v2.file f where f.student_id = p_student and f.state <> 'purged' order by f.uploaded_at desc limit 20) f left join v2.profiles p on p.id = f.by_profile),   -- 이 아이의 자료(4단계-6 — 14 📎 줄)
    'videos', (select coalesce(jsonb_agg(jsonb_build_object('id', va.id, 'video_id', v.id, 'title', v.title, 'folder', v.folder, 'due_on', va.due_on, 'state', va.state, 'pct', vp.pct, 'done_at', vp.done_at) order by va.created_at desc), '[]'::jsonb)
                 from v2.video_assign va join v2.video v on v.id = va.video_id
                 left join lateral (select p.pct, p.done_at from v2.video_progress(p_student) p where p.video_id = v.id) vp on true
                where va.student_id = p_student and va.state = 'active'),   -- 이 아이의 영상(4단계-6 — 14 🎬 줄)
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', to_jsonb(c.weekdays), 'start_time', c.start_time) order by c.start_time, c.nickname), '[]'::jsonb) from cls c),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'access', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'key', a.key, 'allowed', a.allowed)), '[]'::jsonb) from v2.role_access a where a.key like 'ops.%'),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key in ('unit_test.pass_pct', 'late.repeat_days', 'late.repeat_count', 'warn.report_at')),
    'progress_pending', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', p.unit_id, 'round', p.round, 'status', p.status, 'marked_on', p.marked_on,
                           'book', b.name, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false)) order by p.marked_on desc nulls last), '[]'::jsonb)
                          from v2.progress p join v2.units u on u.id = p.unit_id join v2.books b on b.id = u.book_id
                         where p.student_id = p_student and p.last_by = 'student' and p.confirmed = false),   -- (허) 아이가 찍고 확인 안 한 줄 — 08 원장 쪽과 같은 셈
    'progress_flags', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'unit_id', f.unit_id, 'round', f.round, 'kind', f.kind, 'said', f.said,
                          'raised_at', f.raised_at, 'seen_at', f.seen_at, 'outcome', f.outcome, 'book', b.name, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false),
                          'status', coalesce((select pr.status::text from v2.progress pr where pr.student_id = p_student and pr.unit_id = f.unit_id and pr.round = f.round), 'none')) order by f.raised_at desc), '[]'::jsonb)
                        from v2.progress_flag f join v2.units u on u.id = f.unit_id join v2.books b on b.id = u.book_id
                       where f.student_id = p_student and f.seen_at is null),   -- (허) 아직 안 본 ❗ 만
    'progress_edit', jsonb_build_object('academy_open', (select is_open from v2.progress_edit where scope = 'academy'),
                       'opened_on', (select opened_on from v2.progress_edit where scope = 'academy'),
                       'mode', (select st.progress_edit from v2.students st where st.id = p_student),
                       'can_edit', v2.can_edit_progress(p_student))
  ) where v2.is_staff()
$$;
comment on function v2.student_board(uuid, date) is '학생 14 가 읽는 한 벌 — 목록·한 아이(머리 · KPI 여섯 · 교재 진도 · 성적 · 이 달 출결 · 단원평가 · 지나온 것 · 상담 · 자료 · 영상 · (허) 그 아이의 진도 체크 셋). 학원 사람만';
grant execute on function v2.student_board(uuid, date) to authenticated, service_role;
