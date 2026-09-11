-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0156~0159 · 4개 · 2026-09-11 만듦)
--
-- 어디서 왔나 : supabase/migrations/*.sql 을 **번호 차례대로** 이어 붙인 것이다.
--               규칙은 docs/개발자-인수인계.md 3절 「실 DB 에 돌리는 법」.
-- 어디에 넣나 : Supabase → SQL Editor → New query → 통째로 붙여넣고 Run.
--
-- ⚠️ v2 스키마만 건드린다 — public · auth · storage 는 한 줄도 안 건드린다(check-v2only 가 잰다).
-- ⚠️ 전환일 파일(9000 · 9001)은 여기 **없다** — 그날 따로 돌린다.
-- ⚠️ 통째로 **한 트랜잭션**이다 — 하나라도 틀리면 아무것도 안 들어간다.
--     그래서 실패했으면 고치고 **그대로 다시** 붙여넣으면 된다(들어간 것이 없으니 처음과 같다).
-- ⚠️ 반대로 **다 들어간 뒤에 또 돌리면** 0106·0114·0128 에서 멈춘다 — 뒤 파일(0108·0119·0129·0131)이
--     같은 함수를 다른 반환형으로 다시 냈기 때문이다(2026-09-07 실측). 파일 하나하나는 멱등이지만
--     **줄 전체를 처음부터 다시 도는 것**은 멱등이 아니다. 그럴 일이 없게 아래 문지기가 먼저 막는다.

begin;

-- 시간제한을 이 트랜잭션 동안만 푼다 — 편집기 기본값(짧다)에 걸리면 통째로 되돌아간다.
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = 0;

-- 문지기 — ① 이미 들어갔나 ② 앞 조각이 다 들어갔나. 엉뚱한 오류 대신 사람 말로 멈춘다.
do $guard$
declare 든것 int; 앞것 int;
begin
  select count(*) into 든것 from v2.migration where file = any(array['0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql']);
  if 든것 = 4 then
    raise exception '0156~0159 · 4개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql']);
  if 앞것 <> 56 then
    raise exception '앞 파일 0100~0155 이 아직 다 안 들어갔습니다 (56개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/4 · 0156_student_month.sql
-- ─────────────────────────────────────────────────────────────
-- 0156 (뎌) 재원생 화면 = 학생 14 를 채운다 — **달을 넘겨 가며 날짜별 출결**을 본다(원장님 답 ⑩ 「하원은 재원생 출결정보에 날짜별 기록」).
-- 새 화면을 만들지 않는다 — 목록·재원 기간·출결·지나온 것이 이미 14 에 있어서, 새로 만들면 같은 것을 두 벌로 그린다(원칙-1).
-- ① student_board 에 **달 인자**(p_month) — 안 주면 지금까지와 똑같이 「오늘의 달」이다(옛 부름은 그대로 돈다).
-- ② 목록 줄마다 **그 달 출결 요약**(왔음 · 지각 · 결석 · 보강 · 수업일) — 아이를 안 열어도 그 달이 보인다.
-- 인자가 하나 늘어 되돌림 꼴이 바뀌므로 옛 함수를 내리고 다시 낸다(앞 열쇠는 전부 그대로 — 검사-74).
drop function if exists v2.student_board(uuid, date);
create function v2.student_board(p_student uuid, p_on date, p_month date default null) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with m as (select date_trunc('month', coalesce(p_month, p_on))::date f, (date_trunc('month', coalesce(p_month, p_on)) + interval '1 month - 1 day')::date t),   -- (뎌) 달 넘기기 — 안 주면 오늘의 달
  cur_class as (select cm.student_id, c.id class_id, c.kind, c.nickname, cs.weekdays, cs.start_time, cs.end_time
                  from v2.class_member cm join v2.classes c on c.id = cm.class_id
                  left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
                 where cm.from_date <= p_on and (cm.to_date is null or cm.to_date >= p_on)),
  cls as (select c.id, c.kind, c.nickname, c.state, cs.weekdays, cs.start_time, cs.end_time from v2.classes c
            left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
           where c.state = 'active'),
  pass as (select coalesce((select value::int from v2.rule where key = 'unit_test.pass_pct'), 80) pct)
  select jsonb_build_object(
    'today', p_on, 'month', to_char(coalesce(p_month, p_on), 'YYYY-MM'),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_id', st.school_id, 'level', sc.level, 'state', st.state, 'joined_on', st.joined_on, 'left_on', st.left_on,
                'class', (select jsonb_build_object('id', x.class_id, 'kind', x.kind, 'nickname', x.nickname, 'weekdays', to_jsonb(x.weekdays), 'start_time', x.start_time) from cur_class x where x.student_id = st.id limit 1),
                'books', (select coalesce(jsonb_agg(distinct b.name), '[]'::jsonb) from v2.student_book sb join v2.books b on b.id = sb.book_id where sb.student_id = st.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
                'last_consult', (select max(c.at) from v2.consult c where c.student_id = st.id),
                'login_id', pr.login_id, 'must_change_pw', pr.must_change_pw, 'issued_by_app', pr.issued_by_app,
                'parent_login', (select pp.login_id from v2.parent_student ps join v2.profiles pp on pp.id = ps.parent_profile_id where ps.student_id = st.id order by ps.created_at limit 1),
                'att', (select jsonb_build_object('came', count(*) filter (where ds.attend in ('present','online')), 'late', count(*) filter (where ds.attend = 'late'),
                          'absent', count(*) filter (where ds.attend = 'absent'), 'makeup', count(*) filter (where ds.attend = 'makeup'), 'days', count(*) filter (where ds.attend is not null))
                        from v2.day_sheet ds, m where ds.student_id = st.id and ds.date between m.f and m.t))   -- (뎌) 그 달 출결 요약 — 재원생 목록에서 한눈에
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
comment on function v2.student_board(uuid, date, date) is '학생 14(=재원생 화면)가 읽는 한 벌 — 목록(그 달 출결 요약까지) · 한 아이(머리 · KPI 여섯 · 교재 진도 · 성적 · 그 달 출결(날짜별 등원·하원) · 단원평가 · 지나온 것 · 상담 · 자료 · 영상 · 진도 체크 셋). 달은 p_month 로 넘긴다(안 주면 오늘의 달). 학원 사람만';
grant execute on function v2.student_board(uuid, date, date) to authenticated, service_role;


-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다(원장님 2026-09-10 밤 「schema cache」)
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0156_student_month.sql', '441040ec201f611a')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 2/4 · 0157_sms_kinds.sql
-- ─────────────────────────────────────────────────────────────
-- 0157 (뎌-2) 문자로 나가는 갈래를 넓힌다 — 늦은 귀가 · 수강료 · 월간 리포트도 **앱 알림과 함께 문자로**.
-- 원장님 2026-09-10: 「3. 문자갈래」(차례 ②). 학부모가 앱을 안 깔았어도 닿아야 하는 것들이다.
-- ① 규칙 한 줄 `send.sms_kinds` — **어느 갈래를 문자로도 보낼지**(쉼표). 비면 문자는 등록·상담 안내만(지금까지와 같다).
--    원장님이 발송 10 「✉️ 문자 문구」에서 켜고 끈다 — 코드에 박지 않는다(뼈대-5).
-- ② 문구 셋(msg_template) — 늘 그렇듯 **처음 한 벌일 뿐**이고, 원장님이 화면에서 고친다(확정-71 · 이미 있으면 안 덮는다).
--    {{한 줄}} 은 그 갈래를 아는 손이 채운다(늦귀가는 예상 시각·사유 · 수강료는 달·금액 · 월간은 그 달) — 비면 그 줄이 사라진다.
-- ③ 치환 자리(뼈대-8) 둘.
insert into v2.rule (key, value, note) values
  ('send.sms_kinds', '', '앱 알림과 **함께 문자로도** 보낼 갈래(쉼표 — late,fee,monthly). 비면 문자는 등록·상담 안내만. 발송 10 ✉️ 문자 문구에서 켠다')
on conflict (key) do nothing;
insert into v2.msg_template (kind, title, body) values
  ('sms_late',    '늦은 귀가 안내', E'[{{학원명}}] {{이름}} 학생 늦은 귀가 안내입니다.\n{{한 줄}}\n\n앱에서 자세히 보십니다 https://chloe-english.vercel.app'),
  ('sms_fee',     '수강료 안내',   E'[{{학원명}}] {{이름}} 학생 수강료 안내입니다.\n{{한 줄}}\n\n앱에서 자세히 보십니다 https://chloe-english.vercel.app'),
  ('sms_monthly', '월간 리포트',   E'[{{학원명}}] {{이름}} 학생 월간 리포트가 나왔습니다.\n{{한 줄}}\n\n앱에서 보십니다 https://chloe-english.vercel.app')
on conflict (kind) do nothing;
insert into v2.placeholder (key, note, example, sort) values
  ('한 줄', '그 갈래를 아는 손이 채우는 한 줄(늦귀가는 예상 시각·사유 · 수강료는 달·금액 · 월간은 그 달) — 비면 그 줄이 사라집니다', '오늘 21:40 귀가 예정 · 단어 재시험', 47)
on conflict (key) do nothing;

-- 표 모양은 안 바뀌었지만(줄만 늘었다) API 기억을 새로 읽어도 탈이 없다 — 붙여넣기 절차를 한 가지로 지킨다
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0157_sms_kinds.sql', '2269359b62baba36')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 3/4 · 0158_cc_skip.sql
-- ─────────────────────────────────────────────────────────────
-- 0158 (뎌-4) 🃏 클래스카드 카드를 오늘 수업 01 에 세운다 — **넘긴 것을 적을 자리** 하나.
-- 원장님 2026-09-10: 「5. 클래스카드」(차례 ⑤).
-- 확정-⑱ **목표에 못 미쳐도 앱이 안 넘긴다** — 원장님이 「⏭ 목표 미달 넘기기」를 누르셔야 넘어간다.
--   그 누른 것을 어디엔가 적어야 다음에 열어도 넘어간 채로 보인다 → cc_planner 에 칸 둘.
-- 표는 새로 안 만든다(0031 의 cc_planner 그대로) · 확장이 다시 받아 적어도(upsert) 넘긴 자국은 **안 지운다**
--   — upsert 는 이 두 칸을 건드리지 않는다(lib/cc.js 가 보내는 칸에 없다).
-- 지우지 않는다(대전제-6) — 다시 누르면 skipped_at 이 null 로 돌아갈 뿐, 줄은 그대로 있다.
alter table v2.cc_planner add column if not exists skipped_at timestamptz;
alter table v2.cc_planner add column if not exists skip_by    uuid references v2.profiles(id);
comment on column v2.cc_planner.skipped_at is '(뎌-4) 원장님이 「⏭ 목표 미달 넘기기」를 누른 때 — 앱은 스스로 안 넘긴다(확정-⑱)';
comment on column v2.cc_planner.skip_by    is '(뎌-4) 누가 넘겼나(원장·강사·조교)';
-- 쓰기 권한은 이미 staff_all 정책과 0031 의 grant 가 준다(새 grant 없음 — check-grants 가 짝을 잰다).

-- 표 모양이 바뀌었다 — API 기억을 새로 읽지 않으면 화면이 이 칸을 못 쓴다(원장님 9/10 「schema cache」)
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0158_cc_skip.sql', '4d631fce18565a68')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 4/4 · 0159_site_import.sql
-- ─────────────────────────────────────────────────────────────
-- 0159 (버2) 학교 홈페이지에서 받아오기 — 나이스에 없는 학교.
-- 원장님이 12b 에서 홈페이지 주소를 넣어 두신 학교는, 확장이 그 화면 글을 앱에 보내고 **앱이** 시험 회차를 뽑는다.
-- 판단은 새로 없다(원칙-1) — 나이스와 같은 길(planImport · diffExams)로 들어오고, 출처만 'site' 다.
-- ① 학교마다 **마지막으로 받은 때** 한 칸. 학교가 홈페이지를 바꾸면 **조용히 멈추는데**, 그것을 12b 가 이 칸으로 안다
--    (목업 12b: 「신송중은 3주째 못 받았습니다」). 새 표는 안 만든다.
-- ② 판 import_board 를 다시 낸다 — 0120 의 열쇠를 **전부 품고**(검사-74) 학교마다 site_seen_at·site_exams 를 더한다.
alter table v2.schools add column if not exists site_seen_at timestamptz;
comment on column v2.schools.site_seen_at is '(버2) 학교 홈페이지에서 마지막으로 받아 적은 때 — 비어 있으면 아직 한 번도 못 받았다. 12b 가 「N일째 못 받았습니다」로 말한다';

-- ══ import_board — 0120 그대로 + 학교줄에 site_seen_at · site_exams(검사-74: 앞 열쇠를 전부 품는다)
create or replace function v2.import_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level, 'neis_code', s.neis_code, 'site_url', s.site_url,
                  'site_seen_at', s.site_seen_at,
                  'students', (select count(*) from v2.students st where st.school_id = s.id and st.state = 'active'),
                  'neis_exams', (select count(*) from v2.exams e where e.school_id = s.id and e.source = 'neis' and e.state = 'active' and e.term_to >= p_on - 30),
                  'site_exams', (select count(*) from v2.exams e where e.school_id = s.id and e.source = 'site' and e.state = 'active' and e.term_to >= p_on - 30)) order by s.name), '[]'::jsonb)
                 from v2.schools s where s.state = 'active'),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'grade', e.grade, 'name', e.name, 'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source, 'updated_at', e.updated_at) order by coalesce(e.term_from, e.english_on), sc.name), '[]'::jsonb)
               from v2.exams e left join v2.schools sc on sc.id = e.school_id
              where e.state = 'active' and coalesce(e.term_to, e.english_on, e.term_from) >= p_on - 30),
    'words', (select coalesce(jsonb_agg(jsonb_build_object('word', w.word, 'scope', w.scope) order by w.word), '[]'::jsonb) from v2.exam_word w),
    'last_neis_at', (select max(e.updated_at) from v2.exams e where e.source = 'neis'),
    'last_site_at', (select max(s.site_seen_at) from v2.schools s),
    'neis_key', (select coalesce(nullif(trim(i.config->>'key'), ''), '') <> '' from v2.integration i where i.id = 'neis')
  ) where v2.is_staff()
$$;
comment on function v2.import_board(date) is '학사일정 받아오기 12b 가 읽는 한 벌 — 학교(나이스 코드·홈페이지·아이 수·나이스 시험 수·홈페이지 시험 수·마지막으로 받은 때) · 지난 한 달부터의 시험 · 전국 낱말 · 마지막 받은 때 둘 · 열쇠 있나(참·거짓만). 학원 사람만';

-- 표에 칸이 늘었다 — API 기억을 새로 읽지 않으면 화면이 이 칸을 못 쓴다(원장님 9/10 「schema cache」)
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0159_site_import.sql', '1ccaa78cb5a2b50b')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
