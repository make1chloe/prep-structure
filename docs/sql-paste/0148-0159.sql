-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0148~0159 · 12개 · 2026-09-11 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql']);
  if 든것 = 12 then
    raise exception '0148~0159 · 12개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql']);
  if 앞것 <> 48 then
    raise exception '앞 파일 0100~0147 이 아직 다 안 들어갔습니다 (48개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/12 · 0148_grid_share.sql
-- ─────────────────────────────────────────────────────────────
-- 0148 (너)(2026-09-09 — 원장님 「강사조교는 다 봐도 되고 학생학부모는 따로 권한두기」): 학교별 표 06c 를 아이·학부모 화면에도.
--   · 강사·조교는 지금처럼 일정 권한이면 본다(칸 안 늘림) · 학생·학부모는 「누가 무엇을 보나」의 새 칸(me.grid · parent.grid — lib/perm.js · 값은 0088 v2.role_access · 안 정함이면 막힘)
--   · 무엇을 보이나는 표마다 「아이·학부모 공개」 스위치(grid.share · 기본 끔 — 「학교별 특이사항」 같은 내부 표가 안 샌다) · 학교 줄 표만 · 그 아이 학교 줄만
--   · 아이 쪽 한 벌 grid_mine(p_student): 본인 · 그 아이의 학부모(my_students) · 학원 사람만. grid_board 는 share 를 싣는다(마지막 정의 0131 을 다시 냄 — cells_at(0-3 대조) 그대로 · 처음엔 0126 을 베껴 cells_at 을 잃었고 check-rules-db 가 잡았다 → check-redefine)
--   · 멱등: add column if not exists · create or replace
alter table v2.grid add column if not exists share boolean not null default false;
comment on column v2.grid.share is '아이·학부모 공개 — 켜면 학교 줄 표의 그 아이 학교 줄이 07·09 「우리 학교」 카드에 보인다(누가 보나는 role_access me.grid · parent.grid). 기본 끔(특이사항 같은 내부 표가 안 샌다) — (너) 0148';

create or replace function v2.grid_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'me', auth.uid(),
    'grids', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'rows', g.rows, 'template', g.template, 'sort', g.sort, 'state', g.state, 'board_col', g.board_col, 'created_by', g.created_by, 'created_at', g.created_at, 'share', g.share,
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
comment on function v2.grid_board(date) is '학교별 표 06c 가 읽는 한 벌 — 표 전부(칸 · 줄 · 셀 · 내린 것 포함 — 화면이 거른다 · (너) 공개 스위치 share) · 학교 · 재원생 · 교재 · 회차(고르기 목록) · 따로 챙길 아이들 · 나(내 표/전체 표). 표·보드 보기는 이 한 벌을 그 자리에서 다르게 그린다(속도-1 예외)';
grant execute on function v2.grid_board(date) to authenticated, service_role;

create or replace function v2.grid_mine(p_student uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'student', p_student,
    'school', (select jsonb_build_object('id', sc.id, 'name', sc.name, 'level', sc.level) from v2.students st join v2.schools sc on sc.id = st.school_id where st.id = p_student),
    'grids', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'label', g.label, 'template', g.template, 'sort', g.sort,
                 'cols', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'type', c.type, 'options', c.options, 'sort', c.sort) order by c.sort, c.id), '[]'::jsonb) from v2.grid_col c where c.grid_id = g.id and c.state = 'active'),
                 'rows_', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'school', sc.name, 'sort', r.sort,
                              'cells', (select coalesce(jsonb_object_agg(x.col_id, x.value), '{}'::jsonb) from v2.grid_cell x where x.row_id = r.id)) order by r.sort, r.created_at), '[]'::jsonb)
                            from v2.grid_row r join v2.schools sc on sc.id = r.school_id
                            where r.grid_id = g.id and r.state = 'active' and r.school_id = (select st.school_id from v2.students st where st.id = p_student)))
               order by g.sort, g.created_at), '[]'::jsonb)
               from v2.grid g where g.state = 'active' and g.share and g.rows = 'school'),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name) order by b.name), '[]'::jsonb) from v2.books b),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name) order by e.name), '[]'::jsonb) from v2.exams e left join v2.schools sc on sc.id = e.school_id),
    'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'chapter', u.chapter, 'short', u.short, 'label', u.label)), '[]'::jsonb) from v2.units u
                where u.id in (select (x.value->>'id')::uuid from v2.grid_cell x join v2.grid_col c on c.id = x.col_id join v2.grid_row r on r.id = x.row_id join v2.grid g on g.id = r.grid_id
                               where g.share and c.type = 'pick' and jsonb_typeof(x.value) = 'object' and (x.value->>'id') ~ '^[0-9a-f-]{36}$'))
  ) where v2.is_staff() or p_student in (select v2.my_students())
$$;
comment on function v2.grid_mine(uuid) is '아이·학부모 「우리 학교」 카드(07·09)가 읽는 한 벌 — 공개(share)한 학교 줄 표만 · 그 아이 학교 줄만 · 살아 있는 칸·줄만 · 고르기 목록(교재·회차 전부 · 단원은 쓰인 것만). 본인 · 그 아이의 학부모 · 학원 사람만(아니면 null) — (너) 0148';
grant execute on function v2.grid_mine(uuid) to authenticated, service_role;

insert into v2.migration(file, sha) values ('0148_grid_share.sql', '44dd36b20a5cb2e6')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 2/12 · 0149_unit_test_due.sql
-- ─────────────────────────────────────────────────────────────
-- 0149 (버) 단원평가를 내는 자리 — 루틴 11 의 「단원평가 본다」(대단원마다 · 소단원 N개마다)가 켜진 교재에서 그 묶음이 끝나면
-- 할 일 05 에 「📝 단원평가 출제」 카드가 저절로 선다(남긴 것 6 · 목업 05 「🧾 … 저절로」 · 목업 01 「교재 CHAPTER → 단원평가 단원」 화살표).
-- 단원평가 줄에 어느 교재·묶음에서 났는지를 새긴다(book_id · round · chapter | seq · covers) — 같은 묶음은 한 번만(부분 유일 색인) · 손으로 낸 것은 비어 있다.
alter table v2.unit_test add column if not exists book_id uuid references v2.books(id) on delete restrict;
alter table v2.unit_test add column if not exists round   smallint;
alter table v2.unit_test add column if not exists chapter text;
alter table v2.unit_test add column if not exists seq     smallint;
alter table v2.unit_test add column if not exists covers  text;
comment on column v2.unit_test.book_id is '(버) 어느 교재의 묶음이 끝나서 낸 단원평가인가 — 손으로 낸 것은 비어 있다';
comment on column v2.unit_test.round   is '(버) 그 교재의 몇 회독에서 났나';
comment on column v2.unit_test.chapter is '(버) 대단원마다 — 끝난 대단원 이름';
comment on column v2.unit_test.seq     is '(버) 소단원 N개마다 — 몇 번째 묶음인가(1부터)';
comment on column v2.unit_test.covers  is '(버) 무엇을 덮는 단원평가인가(대단원 이름 · 소단원 목록) — 01 카드의 「교재 … → 단원평가 단원」 줄';
create unique index if not exists unit_test_one_per_group on v2.unit_test (student_id, book_id, round, coalesce(chapter, ''), coalesce(seq, 0)) where book_id is not null;

-- todo_board 다시 냄(0145 본 그대로 + 'unit_test_due') — 검사-74: 앞 정의의 열쇠를 전부 품는다
create or replace function v2.todo_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'note', t.note, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'done_at', t.done_at, 'why', t.why, 'private', t.private, 'created_at', t.created_at,
                 'student_id', t.student_id, 'student', st.name, 'student_school_id', st.school_id, 'student_school', ssc.name,
                 'exam', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'school', esc.name, 'school_id', e.school_id, 'level', esc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
                                                                             'takers', (select count(*) from v2.exam_takers(e.id))) end,
                 'material', case when m.id is null then null else jsonb_build_object('id', m.id, 'title', m.title, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'state', m.state, 'reuse_of', m.reuse_of,
                     'items', (select count(*) from v2.material_item i where i.material_id = m.id),
                     'gives', (select count(*) from v2.material_give g where g.material_id = m.id),
                     'handed', (select count(*) from v2.material_give g where g.material_id = m.id and g.handed_at is not null),
                     'got', (select count(*) from v2.material_give g where g.material_id = m.id and g.got_at is not null),
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done'),
                     'submitted', (select count(*) from v2.material_give g where g.material_id = m.id and g.submitted_at is not null),
                     'scored', (select count(*) from v2.material_give g where g.material_id = m.id and g.scored_at is not null),
                     'students', (select coalesce(jsonb_agg(jsonb_build_object('id', g.student_id, 'name', gs.name, 'handed', g.handed_at is not null, 'stage', g.stage, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at) order by gs.name), '[]'::jsonb) from v2.material_give g join v2.students gs on gs.id = g.student_id where g.material_id = m.id)) end,
                 'rule', r.name)
               order by t.due_on nulls last, t.due_time nulls last, t.created_at), '[]'::jsonb)
                from v2.todo t left join v2.students st on st.id = t.student_id left join v2.schools ssc on ssc.id = st.school_id
                left join v2.exams e on e.id = t.exam_id left join v2.schools esc on esc.id = e.school_id
                left join v2.material m on m.id = t.material_id left join v2.material_type ty on ty.id = m.type_id
                left join v2.auto_rule r on r.id = t.rule_id
               where t.state in ('todo', 'doing') or t.updated_at >= (p_on - 30)::timestamptz),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'state', m.state, 'reuse_of', m.reuse_of, 'created_at', m.created_at,
                     'exam', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'school', esc.name, 'school_id', e.school_id, 'level', esc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to) end,
                     'items', (select count(*) from v2.material_item i where i.material_id = m.id),
                     'gives', (select count(*) from v2.material_give g where g.material_id = m.id),
                     'handed', (select count(*) from v2.material_give g where g.material_id = m.id and g.handed_at is not null),
                     'got', (select count(*) from v2.material_give g where g.material_id = m.id and g.got_at is not null),
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done'),
                     'submitted', (select count(*) from v2.material_give g where g.material_id = m.id and g.submitted_at is not null),
                     'scored', (select count(*) from v2.material_give g where g.material_id = m.id and g.scored_at is not null),
                     'students', (select coalesce(jsonb_agg(jsonb_build_object('id', g.student_id, 'name', gs.name, 'handed', g.handed_at is not null, 'stage', g.stage, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at) order by gs.name), '[]'::jsonb) from v2.material_give g join v2.students gs on gs.id = g.student_id where g.material_id = m.id)) order by m.created_at), '[]'::jsonb)
                    from v2.material m join v2.material_type ty on ty.id = m.type_id left join v2.exams e on e.id = m.exam_id left join v2.schools esc on esc.id = e.school_id
                   where m.state <> 'dropped' and ('solve' = any(ty.steps) or 'score' = any(ty.steps))
                     and exists (select 1 from v2.material_give g where g.material_id = m.id and g.handed_at is not null)),   -- 준 자료만(0145 · (가)-⑧)
    'unit_tests', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'student_id', u.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'topic', gt.name, 'q_count', u.q_count, 'assigned_on', u.assigned_on, 'state', u.state,
                      'next_class', (select min(d.date) from v2.student_days(u.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) order by u.assigned_on, st.name), '[]'::jsonb)
                     from v2.unit_test u join v2.students st on st.id = u.student_id left join v2.schools sc on sc.id = st.school_id left join v2.grammar_topics gt on gt.id = u.topic_id
                    where u.state = 'todo'),
    'retests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'student_id', q.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'kind', q.kind, 'total', q.total, 'assigned_on', q.assigned_on, 'paper_at', q.paper_at,
                      'book', b.name, 'unit', case when q.unit_from is null then null else v2.unit_label(q.unit_from, false) end, 'free_note', q.free_note, 'style', qs.text,
                      'pct', o.pct, 'harder', q.harder) order by q.assigned_on, st.name), '[]'::jsonb)
                  from v2.quiz q join v2.students st on st.id = q.student_id left join v2.schools sc on sc.id = st.school_id left join v2.books b on b.id = q.book_id
                  left join v2.quiz_style qs on qs.id = q.style_id left join v2.quiz o on o.id = q.retry_of
                 where q.state = 'planned' and q.retry_of is not null),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'school_id', e.school_id, 'level', sc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
                      'takers', (select count(*) from v2.exam_takers(e.id)),
                      'scored', (select count(*) from v2.score s where s.exam_id = e.id and s.student_id in (select student_id from v2.exam_takers(e.id)))) order by coalesce(e.english_on, e.term_from)), '[]'::jsonb)
                 from v2.exams e left join v2.schools sc on sc.id = e.school_id
                where e.state = 'active' and not e.hidden and coalesce(e.english_on, e.term_to, e.term_from) between p_on - 45 and p_on + 45),
    'repeats', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'threshold', r.threshold, 'active', r.active) order by r.name), '[]'::jsonb) from v2.auto_rule r where r.kind = 'repeat'),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active' and exists (select 1 from v2.students st where st.school_id = s.id and st.state = 'active')),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school_id', st.school_id, 'school', sc.name, 'grade', st.grade) order by st.name), '[]'::jsonb) from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.sort, g.name), '[]'::jsonb) from v2.grammar_topics g),
    'exams_soon', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'english_on', e.english_on, 'term_from', e.term_from,
                       'materials', (select count(*) from v2.material m where m.exam_id = e.id and m.state <> 'dropped')) order by coalesce(e.english_on, e.term_from)), '[]'::jsonb)
                     from v2.exams e left join v2.schools sc on sc.id = e.school_id where e.state = 'active' and not e.hidden and coalesce(e.term_to, e.english_on, e.term_from) >= p_on),
    'unit_test_due', (select coalesce(jsonb_agg(x order by x->>'student', x->>'book', (x->>'seq')::int nulls first, x->>'chapter'), '[]'::jsonb) from (
        -- 대단원마다 — 이 회독에서 대단원의 살아 있는 소단원이 전부 ○·건너뜀(todo_units 와 같은 셈)이면 한 장 · 이미 낸 대단원은 뺀다
        select jsonb_build_object('student_id', sb.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id,
                 'book_id', sb.book_id, 'book', b.name, 'round', sb.round, 'mode', 'per_chapter', 'chapter', ch.chapter, 'seq', null, 'n', null, 'covers', ch.chapter,
                 'topics', (select coalesce(jsonb_agg(distinct gt.name), '[]'::jsonb) from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id join v2.units u2 on u2.id = ut.unit_id
                             where u2.book_id = sb.book_id and u2.chapter = ch.chapter and u2.state = 'active'),
                 'topic_id', (select ut.topic_id from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id join v2.units u2 on u2.id = ut.unit_id
                               where u2.book_id = sb.book_id and u2.chapter = ch.chapter and u2.state = 'active' order by gt.sort, gt.name limit 1),
                 'next_class', (select min(d.date) from v2.student_days(sb.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) x
          from v2.student_book sb join v2.students st on st.id = sb.student_id left join v2.schools sc on sc.id = st.school_id join v2.books b on b.id = sb.book_id
          cross join lateral (select u.chapter from v2.units u where u.book_id = sb.book_id and u.state = 'active' group by u.chapter
                              having bool_and(exists (select 1 from v2.progress p where p.student_id = sb.student_id and p.unit_id = u.id and p.round = sb.round
                                                        and p.status in ('done', 'skip') and coalesce(p.done_on, p.marked_on, p_on) <= p_on))) ch
         where sb.unit_test = 'per_chapter' and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on) and st.state = 'active'
           and not exists (select 1 from v2.unit_test t where t.student_id = sb.student_id and t.book_id = sb.book_id and t.round = sb.round and t.chapter = ch.chapter)
        union all
        -- 소단원 N개마다 — 이 회독에서 ○·건너뜀 된 소단원을 차례대로 N개씩 묶어 꽉 찬 묶음마다 한 장 · 이미 낸 묶음(seq)은 뺀다
        select jsonb_build_object('student_id', sb.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id,
                 'book_id', sb.book_id, 'book', b.name, 'round', sb.round, 'mode', 'per_n_sub', 'chapter', null, 'seq', g.seq, 'n', sb.unit_test_n, 'covers', g.covers,
                 'topics', (select coalesce(jsonb_agg(distinct gt.name), '[]'::jsonb) from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id where ut.unit_id = any(g.ids)),
                 'topic_id', (select ut.topic_id from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id where ut.unit_id = any(g.ids) order by gt.sort, gt.name limit 1),
                 'next_class', (select min(d.date) from v2.student_days(sb.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) x
          from v2.student_book sb join v2.students st on st.id = sb.student_id left join v2.schools sc on sc.id = st.school_id join v2.books b on b.id = sb.book_id
          cross join lateral (select d.seq, array_agg(d.id order by d.rn) ids, string_agg(v2.unit_label(d.id, false), ' · ' order by d.rn) covers
                                from (select u.id, row_number() over (order by u.sort) rn, ((row_number() over (order by u.sort)) - 1) / sb.unit_test_n + 1 seq
                                        from v2.units u
                                       where u.book_id = sb.book_id and u.state = 'active'
                                         and exists (select 1 from v2.progress p where p.student_id = sb.student_id and p.unit_id = u.id and p.round = sb.round
                                                       and p.status in ('done', 'skip') and coalesce(p.done_on, p.marked_on, p_on) <= p_on)) d
                               group by d.seq having count(*) = sb.unit_test_n) g
         where sb.unit_test = 'per_n_sub' and coalesce(sb.unit_test_n, 0) > 0 and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on) and st.state = 'active'
           and not exists (select 1 from v2.unit_test t where t.student_id = sb.student_id and t.book_id = sb.book_id and t.round = sb.round and t.seq = g.seq)
      ) s),
    'repeat_ran', exists (select 1 from v2.day_ran d where d.kind = 'repeat' and d.ran_on = p_on),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'todo.%')
  ) where v2.is_staff()
$$;

insert into v2.migration(file, sha) values ('0149_unit_test_due.sql', 'fa75860fba96b90b')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 3/12 · 0150_mine_reflections.sql
-- ─────────────────────────────────────────────────────────────
-- 0150 (서) 학부모 09 「수업」 카드의 붙는 줄이 01 미리보기와 같은 한 벌(다음 시간 시험 · 귀가 예정 · 반성문 처분).
-- 반성문 처분을 따로 부르면 학부모 화면 조회가 상한 20 을 넘어(게이트 88 · 속도-상한) 이미 파도에 있는 mine_board 에 얹는다 — 0138 본 그대로 + 'reflections'(검사-74).
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
    'fee', (select jsonb_build_object('ym', p.ym, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method)
              from v2.payment p where p.student_id = p_student and p.ym = to_char(v2.today(), 'YYYY-MM') limit 1),   -- 이 달 수납 줄 — 학부모만 보인다(own_payment) · 아이는 null
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'title', l.title, 'url', l.url, 'created_at', l.created_at, 'sent_at', l.sent_at, 'opened_at', l.opened_at, 'sink', l.sink, 'failed_at', l.failed_at) order by l.created_at desc), '[]'::jsonb)
                  from (select * from v2.notify_log where profile_id = auth.uid() and student_id = p_student and created_at >= (p_lo::timestamp at time zone 'UTC') order by created_at desc limit 30) l),   -- 내게 온 자취(own_log)
    'report', (select jsonb_build_object('ym', r.ym, 'body', r.body, 'frozen', r.frozen, 'sent_at', r.sent_at) from v2.monthly_report r where r.student_id = p_student and r.sent_at is not null order by r.ym desc limit 1),   -- 📊 마지막으로 보낸 월간 리포트(own_mr)
    'board', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'to_role', n.to_role, 'sent_at', n.sent_at, 'class', c.nickname, 'school', sc.name, 'read_at', r.first_at,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime) order by f.orig_name), '[]'::jsonb) from v2.file_link l join v2.file f on f.id = l.file_id where l.notice_id = n.id)) order by n.sent_at desc), '[]'::jsonb)
                from v2.notice n left join v2.classes c on c.id = n.class_id left join v2.schools sc on sc.id = n.school_id left join v2.notice_read r on r.notice_id = n.id and r.profile_id = auth.uid()
               where n.sent_at is not null and n.sent_at >= (p_lo::timestamp at time zone 'UTC')
                 and (n.class_id is null or exists (select 1 from v2.class_member m where m.class_id = n.class_id and m.student_id = p_student and m.from_date <= v2.today() and (m.to_date is null or m.to_date >= v2.today())))
                 and (n.school_id is null or exists (select 1 from v2.students s where s.id = p_student and s.school_id = n.school_id))),   -- 📢 이 아이(집)에게 온 공지(4단계-6 · 읽기 규칙 read_notice 가 역할·반·학교를 본다)
    'prefs', (select coalesce(jsonb_object_agg(sp.screen, sp.layout), '{}'::jsonb) from v2.screen_pref sp where sp.profile_id = auth.uid()),   -- 카드 순서(확정-⑮ · 4단계-6 · own_sp)
    'reflections', (select coalesce(jsonb_agg(jsonb_build_object('asked_on', f.asked_on, 'disposal', f.disposal) order by f.asked_on desc), '[]'::jsonb) from v2.reflection f where f.student_id = p_student and f.asked_on >= p_lo),   -- (서) 그날 반성문 처분 — 09 수업 카드의 붙는 줄(01 미리보기와 같은 attached) · 읽기는 RLS reflection_own(0106)
    'progress', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from v2.video_progress(p_student) p)
  );
$$;

insert into v2.migration(file, sha) values ('0150_mine_reflections.sql', '5b25ddec29d665e9')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 4/12 · 0151_scheduled_other.sql
-- ─────────────────────────────────────────────────────────────
-- 0151 (어) 월간 리포트·수강료 안내도 예약 발송(확정-㉕ 「고르고 · 한 번에 · 예약」 — 4단계-2a·2b 는 「예약은 아직」이었다).
-- 예약 갈래에 fee · 아이·달로 매는 예약(body = 달 'YYYY-MM') · 살아 있는 예약은 아이·갈래·달마다 하나 · 발송 판(send_board)의 예약 줄에 아이 이름.
-- 때가 되면 크론(promoteScheduled)이 그때 상태로 보낸다 — 이미 보낸 리포트 · 이미 받은 수강료는 건너뛴다(lib/report sendMonthlyDue · lib/fee remindFeeDue).
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','fee')) not valid;   -- 예약 갈래 = 알림 갈래(0131) + fee
create unique index if not exists scheduled_send_one_other_idx on v2.scheduled_send (kind, student_id, body) where sent_at is null and cancelled_at is null and kind in ('monthly', 'fee');
comment on column v2.scheduled_send.body is '(어) 월간 리포트·수강료 안내 예약은 여기에 달(YYYY-MM) — 때가 되면 그 달 것을 보낸다(이미 보냈거나 받았으면 건너뛴다) · 데일리리포트 예약은 sheet_id';

-- send_board 다시 냄(0118 본 그대로 + 예약 줄에 student_name) — 검사-74: 앞 정의의 열쇠를 전부 품는다
create or replace function v2.send_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'jobs',      (select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at), '[]'::jsonb) from v2.send_jobs((p_on::timestamp at time zone 'Asia/Seoul')) j),
    'logs',      (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) from v2.sent_log((p_on::timestamp at time zone 'Asia/Seoul')) l),
    'scheduled', (select coalesce(jsonb_agg((to_jsonb(s) || jsonb_build_object('student_name', st.name)) order by s.at), '[]'::jsonb) from v2.scheduled_send s left join v2.students st on st.id = s.student_id where s.sent_at is null and s.cancelled_at is null),   -- (어) 월간·수강료 예약은 판이 없어 아이 이름을 여기서
    'reach',     (select to_jsonb(r) from v2.parent_reach() r),
    'rules',     (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'send.%')
  ) where v2.is_staff()
$$;

insert into v2.migration(file, sha) values ('0151_scheduled_other.sql', '55508b65fba848ee')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 5/12 · 0152_exam_change.sql
-- ─────────────────────────────────────────────────────────────
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

insert into v2.migration(file, sha) values ('0152_exam_change.sql', '28c91f30531317a9')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 6/12 · 0153_dash_classes.sql
-- ─────────────────────────────────────────────────────────────
-- 0153 (처) 대시보드 둘(남긴 것 17) — ① 「화·목반 7회 — 8회를 못 채웁니다」: 달 회수 규칙(schedule.sessions_per_month · 0120)은 12 가 쓰던 것이고 셈은 session_count · class_extra_days 한 곳 ·
--    판단은 lib/schedule-plan sessionsOf 한 벌(12 반 회차 카드와 같다). 대시보드 조회 상한 20(속도-상한)이라 새 조회를 만들지 않고 dash_ops 에 classes(이 달에 살아 있는 시간표가 있는 정규반 · 회차 · 반 보강일 · 기준)를 얹는다.
--    0140 본 그대로 + 열 하나(반환 꼴이 바뀌어 drop → create · 앞 열은 전부 그대로 — 검사-74 와 같은 뜻).
-- ② 「답하기」는 표 없이 — request.answer · answered_at · state 'answered' 가 0031 에 이미 있고 update 권한(0031)·staff_all 정책이 있다. 「보기」는 링크.
drop function if exists v2.dash_ops(date);
create function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int, progress_open boolean, progress_opened_on date, progress_pending int, progress_flags int, pref jsonb, confirm_next jsonb, rules jsonb, classes jsonb)
language sql stable security definer set search_path = v2, public as $$
  with nm as (select to_char((date_trunc('month', p_on::timestamp) + interval '1 month')::date, 'YYYY-MM') ym),
       cm as (select to_char(p_on, 'YYYY-MM') ym, date_trunc('month', p_on::timestamp)::date d1, (date_trunc('month', p_on::timestamp) + interval '1 month - 1 day')::date d2)
  select (select max(ran_on) from v2.day_ran where kind = 'queue'),
         (select count(*)::int from v2.job_queue where state = 'fail'),
         (select count(*)::int from v2.job_queue where state in ('wait', 'taking')),
         (select max(fetched_at) from v2.cc_planner),
         (select count(*)::int from v2.day_sheet where date = p_on and closed_at is not null),
         (select is_open from v2.progress_edit where scope = 'academy'),
         (select opened_on from v2.progress_edit where scope = 'academy'),
         (select count(*)::int from v2.progress where not confirmed),
         (select count(*)::int from v2.progress_flag where seen_at is null),
         (select layout from v2.screen_pref where profile_id = auth.uid() and screen = 'dash'),
         (select jsonb_build_object('ym', nm.ym,
            'all', (select count(*) from v2.classes c where c.state = 'active'),
            'ok', (select count(*) from v2.month_confirm m join v2.classes c on c.id = m.class_id and c.state = 'active' where m.ym = nm.ym and m.step = 3 and m.undone_at is null),
            'undone', (select count(*) from v2.month_confirm m join v2.classes c on c.id = m.class_id and c.state = 'active' where m.ym = nm.ym and m.step = 3 and m.undone_at is not null),
            'from_day', (select value from v2.rule where key = 'schedule.confirm_from_day')) from nm),
         (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'dash.%'),
         (select jsonb_build_object('ym', cm.ym, 'target', (select value from v2.rule where key = 'schedule.sessions_per_month'),
            'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nickname', c.nickname, 'kind', c.kind,
                       'weekdays', (select s.weekdays from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.d2 and (s.to_date is null or s.to_date >= cm.d1) order by s.from_date desc limit 1),
                       'start_time', (select s.start_time from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.d2 and (s.to_date is null or s.to_date >= cm.d1) order by s.from_date desc limit 1),
                       'sessions', v2.session_count(c.id, cm.ym::char(7)), 'extra', v2.class_extra_days(c.id, cm.ym::char(7))) order by c.created_at), '[]'::jsonb)
                       from v2.classes c where c.state = 'active' and c.kind = 'regular'
                        and exists (select 1 from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.d2 and (s.to_date is null or s.to_date >= cm.d1))) ) from cm)
   where v2.is_staff()
$$;
comment on function v2.dash_ops(date) is '대시보드 17 잡동사니 한 조회 — 하루 정리 · 클래스카드 · 마감 수 · 진도 체크 열림 · 카드 순서 · 다음 달 확정 상태 · 규칙 dash.*(커서 잠김 날수 · 메모로만 횟수) · (처) 이 달 정규반의 회차(session_count · class_extra_days — 「8회를 못 채웁니다」는 lib/schedule-plan sessionsOf 가 판단). 학원 사람만';
grant execute on function v2.dash_ops(date) to authenticated, service_role;

insert into v2.migration(file, sha) values ('0153_dash_classes.sql', 'd72bf793b30aed4c')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 7/12 · 0154_sms.sql
-- ─────────────────────────────────────────────────────────────
-- 0154 (커) 등록 안내 문자 — 솔라피 · 틀은 화면에서 고친다.
-- 원장님 2026-09-10: 「등록 전에 안내문자 말하는거지? 어플주소도 알려주고 해야하니까 그런거. 솔라피」
--                  「최초 등록안내 에는 여러 가지 학원 규정이라거나 교재안내, 시간표 등 그리고 학생별로 특이 안내 사항이 있을 수 있어 기본 틀은 너가 짜 돼 내가 자유롭게 내용을 추가 수정 할 수 있게 해 줘」(확정-71)
-- ① 자취(notify_log)에 길(channel: push · sms)과 가린 받는 번호(to_phone) — 문자도 같은 자취 한 줄(대전제-7: 나가는 길은 lib/notify.js 한 곳).
-- ② 문구(msg_template) 둘 — sms_welcome(첫 등원 안내: 앱 주소 · 아이디 · 처음 비밀번호 · 수업 · 교재 · 규정 · 아이마다 덧붙임) · sms_guide(18 상담 안내).
--    **원장님이 발송 10 「✉️ 문자 문구」에서 고친다** — 여기 글은 처음 한 벌일 뿐이고, 이미 있으면 안 덮는다(on conflict do nothing).
-- ③ 치환 자리(뼈대-8 표) · 알림 갈래에 guide · sent_log(발송 10)·mine_board(09)·send_board(문구 카드)를 다시 낸다(앞 열쇠는 전부 그대로 — 검사-74).
-- 열쇠는 연동(v2.integration) 'solapi' 줄 — key · secret · from(솔라피에 등록한 발신번호). 여기엔 없다(대전제-9: 열쇠는 코드·마이그레이션에 안 적는다).
alter table v2.notify_log add column if not exists channel text not null default 'push';
alter table v2.notify_log add column if not exists to_phone text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notify_log_channel_choice') then
    alter table v2.notify_log add constraint notify_log_channel_choice check (channel in ('push', 'sms')) not valid;
  end if;
end $$;
comment on column v2.notify_log.channel  is '(커) 어느 길로 나갔나 — push(앱 알림 · 기본) · sms(솔라피 문자)';
comment on column v2.notify_log.to_phone is '(커) 문자를 받은 번호 — 가려서(010-****-1234) · 앱 알림은 비어 있다. 번호를 그대로 쌓지 않는다';

-- 알림 갈래 = lib/notify-plan LABEL 열(0131 · 0133 · 0139) + guide(상담 안내) — 자취와 예약이 같은 열
alter table v2.notify_log drop constraint if exists notify_log_kind_choice;
alter table v2.notify_log add constraint notify_log_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee','schedule','guide')) not valid;
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video','score','fee','schedule','guide')) not valid;   -- 0131 이 걸 때 score·schedule 이 빠져 있었다(0133·0139 가 자취 쪽만 고쳤다) — 셋을 같은 열로(check-rules-db 가 지킨다)

-- ══ 문구 둘 — 처음 한 벌(원장님이 화면에서 고친다 · 이미 있으면 안 덮는다)
insert into v2.msg_template (kind, title, body) values
  ('sms_welcome', '첫 등원 안내', E'[{{학원명}}] {{학생명}} 학생의 등록을 환영합니다.\n\n■ 앱에서 보십니다\nhttps://chloe-english.vercel.app\n학부모 아이디 {{학부모아이디}}\n학생 아이디 {{학생아이디}}\n처음 비밀번호 {{첫비밀번호}}\n(첫 로그인 때 비밀번호를 바꿔 주세요)\n오늘 수업·숙제·시험·수강료를 앱에서 보십니다.\n\n■ 수업\n{{반이름}}\n첫 등원 {{첫등원일}}\n\n■ 교재\n{{교재목록}}\n\n■ 안내\n· 결석·지각은 앱 「남기실 말」이나 전화로 미리 알려 주세요.\n· 숙제는 수업마다 앱에 올라갑니다.\n· 수강료는 매월 앱 안내를 보고 결제선생으로 보내 주세요.\n\n{{덧붙임}}'),
  ('sms_guide',   '상담 안내',   E'[{{학원명}}] {{이름}} 학생 문의 감사합니다.\n상담 일정은 곧 연락드리겠습니다.\n\n학원 앱 https://chloe-english.vercel.app\n\n{{덧붙임}}')
on conflict (kind) do nothing;
comment on table v2.msg_template is '(커) 나가는 글의 틀 — 발송 10 「✉️ 문자 문구」에서 원장님이 고친다. {{ }} 치환 자리는 v2.placeholder(뼈대-8) · 「덧붙임」은 비면 그 줄이 사라진다(아이마다 다른 말)';
alter table v2.msg_template enable row level security; alter table v2.msg_template force row level security;
drop policy if exists staff_all on v2.msg_template;
create policy staff_all on v2.msg_template for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.msg_template to authenticated, service_role;

-- ══ 치환 자리(뼈대-8 표) — 발송 10 의 「{{ }} 치환 자리」 목록에 선다
insert into v2.placeholder (key, note, example, sort) values
  ('이름', '문의한 아이 이름(상담 안내)', '강민서', 40),
  ('학부모아이디', '학부모 계정 아이디(= 전화번호)', '01012345678', 41),
  ('학생아이디', '학생 계정 아이디', 'chloe5678', 42),
  ('첫비밀번호', '앱이 발급한 처음 비밀번호(첫 로그인 때 바꾼다)', '0000', 43),
  ('반이름', '들어간 반 — 이름과 요일·시각', '월수 5시 · 월·수 17:00', 44),
  ('첫등원일', '첫 등원하는 날', '2026-09-15', 45),
  ('덧붙임', '이 아이에게만 덧붙이는 말(등록 전환에서 적는다) — 비면 그 줄이 사라집니다', '셔틀은 3시 20분에 정문에서 탑니다', 46)
on conflict (key) do nothing;

-- ══ sent_log(발송 10 「오늘 나간 것」) — 0118 그대로 + channel · to_phone(반환 꼴이 바뀌어 drop → create · 앞 열은 전부 그대로)
drop function if exists v2.sent_log(timestamptz);
create function v2.sent_log(p_from timestamptz)
returns table (id bigint, profile_id uuid, student_id uuid, student_name text, kind text, title text, sink text,
               created_at timestamptz, sent_at timestamptz, delivered_at timestamptz, opened_at timestamptz, last_opened_at timestamptz,
               open_count int, failed_at timestamptz, fail_why text, why jsonb, sheet_id uuid, job_id bigint, channel text, to_phone text)
language sql stable security definer set search_path = v2, public as $$
  select l.id, l.profile_id, l.student_id, st.name, l.kind, l.title, l.sink, l.created_at, l.sent_at, l.delivered_at, l.opened_at,
         l.last_opened_at, l.open_count, l.failed_at, l.fail_why, l.why, l.sheet_id, l.job_id, l.channel, l.to_phone
    from v2.notify_log l left join v2.students st on st.id = l.student_id
   where l.created_at >= p_from and v2.is_staff()
   order by l.created_at desc
$$;
comment on function v2.sent_log(timestamptz) is '발송 10 「오늘 나간 것」 — 자취(notify_log)에 아이 이름을 붙여서 · (커) 길(channel)과 가린 번호. 읽음은 서버가 찍은 opened_at';
grant execute on function v2.sent_log(timestamptz) to authenticated, service_role;

-- ══ send_board — 0151 그대로 + 'templates'(발송 10 「✉️ 문자 문구」 · 조회를 늘리지 않고 판에 얹는다 — 속도-상한 발송 6) · 검사-74
create or replace function v2.send_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'jobs',      (select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at), '[]'::jsonb) from v2.send_jobs((p_on::timestamp at time zone 'Asia/Seoul')) j),
    'logs',      (select coalesce(jsonb_agg(to_jsonb(l) order by l.created_at desc), '[]'::jsonb) from v2.sent_log((p_on::timestamp at time zone 'Asia/Seoul')) l),
    'scheduled', (select coalesce(jsonb_agg((to_jsonb(s) || jsonb_build_object('student_name', st.name)) order by s.at), '[]'::jsonb) from v2.scheduled_send s left join v2.students st on st.id = s.student_id where s.sent_at is null and s.cancelled_at is null),   -- (어) 월간·수강료 예약은 판이 없어 아이 이름을 여기서
    'reach',     (select to_jsonb(r) from v2.parent_reach() r),
    'rules',     (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'send.%'),
    'templates', (select coalesce(jsonb_agg(jsonb_build_object('kind', t.kind, 'title', t.title, 'body', t.body, 'updated_at', t.updated_at) order by t.kind), '[]'::jsonb) from v2.msg_template t where t.kind like 'sms\_%'),   -- (커) 문자 문구 — 원장님이 여기서 고친다
    'sms_ready', (select coalesce((i.config->>'key') <> '' and (i.config->>'secret') <> '' and (i.config->>'from') <> '', false) from v2.integration i where i.id = 'solapi')
  ) where v2.is_staff()
$$;

-- ══ mine_board(09 「보낸 것」) — 0150 그대로 + notices 에 channel · to_phone(검사-74)
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
    'fee', (select jsonb_build_object('ym', p.ym, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method)
              from v2.payment p where p.student_id = p_student and p.ym = to_char(v2.today(), 'YYYY-MM') limit 1),   -- 이 달 수납 줄 — 학부모만 보인다(own_payment) · 아이는 null
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'title', l.title, 'url', l.url, 'created_at', l.created_at, 'sent_at', l.sent_at, 'opened_at', l.opened_at, 'sink', l.sink, 'failed_at', l.failed_at, 'channel', l.channel, 'to_phone', l.to_phone) order by l.created_at desc), '[]'::jsonb)
                  from (select * from v2.notify_log where profile_id = auth.uid() and student_id = p_student and created_at >= (p_lo::timestamp at time zone 'UTC') order by created_at desc limit 30) l),   -- 내게 온 자취(own_log)
    'report', (select jsonb_build_object('ym', r.ym, 'body', r.body, 'frozen', r.frozen, 'sent_at', r.sent_at) from v2.monthly_report r where r.student_id = p_student and r.sent_at is not null order by r.ym desc limit 1),   -- 📊 마지막으로 보낸 월간 리포트(own_mr)
    'board', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'to_role', n.to_role, 'sent_at', n.sent_at, 'class', c.nickname, 'school', sc.name, 'read_at', r.first_at,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime) order by f.orig_name), '[]'::jsonb) from v2.file_link l join v2.file f on f.id = l.file_id where l.notice_id = n.id)) order by n.sent_at desc), '[]'::jsonb)
                from v2.notice n left join v2.classes c on c.id = n.class_id left join v2.schools sc on sc.id = n.school_id left join v2.notice_read r on r.notice_id = n.id and r.profile_id = auth.uid()
               where n.sent_at is not null and n.sent_at >= (p_lo::timestamp at time zone 'UTC')
                 and (n.class_id is null or exists (select 1 from v2.class_member m where m.class_id = n.class_id and m.student_id = p_student and m.from_date <= v2.today() and (m.to_date is null or m.to_date >= v2.today())))
                 and (n.school_id is null or exists (select 1 from v2.students s where s.id = p_student and s.school_id = n.school_id))),   -- 📢 이 아이(집)에게 온 공지(4단계-6 · 읽기 규칙 read_notice 가 역할·반·학교를 본다)
    'prefs', (select coalesce(jsonb_object_agg(sp.screen, sp.layout), '{}'::jsonb) from v2.screen_pref sp where sp.profile_id = auth.uid()),   -- 카드 순서(확정-⑮ · 4단계-6 · own_sp)
    'reflections', (select coalesce(jsonb_agg(jsonb_build_object('asked_on', f.asked_on, 'disposal', f.disposal) order by f.asked_on desc), '[]'::jsonb) from v2.reflection f where f.student_id = p_student and f.asked_on >= p_lo),   -- (서) 그날 반성문 처분 — 09 수업 카드의 붙는 줄(01 미리보기와 같은 attached) · 읽기는 RLS reflection_own(0106)
    'progress', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from v2.video_progress(p_student) p)
  );
$$;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다 — 안 하면 「Could not find the ... column ... in the schema cache」
-- (원장님 2026-09-10 밤: 0154 를 돌리신 뒤 문자 시험에서 그 오류가 났다). 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0154_sms.sql', 'd6b59b09cbb18e8c')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 8/12 · 0155_road_parts.sql
-- ─────────────────────────────────────────────────────────────
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

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다 — 안 하면 「Could not find the ... column ... in the schema cache」
-- (원장님 2026-09-10 밤: 0154 를 돌리신 뒤 문자 시험에서 그 오류가 났다). 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0155_road_parts.sql', 'e9dfa695007cf895')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 9/12 · 0156_student_month.sql
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
-- 10/12 · 0157_sms_kinds.sql
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
-- 11/12 · 0158_cc_skip.sql
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
-- 12/12 · 0159_site_import.sql
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
