-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0185~0185 · 1개 · 2026-09-19 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0185_give_cross.sql']);
  if 든것 = 1 then
    raise exception '0185~0185 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql', '0173_password_flag.sql', '0174_staff_reset.sql', '0175_mine_fill.sql', '0176_reject_submit.sql', '0177_item_app.sql', '0178_quick_memo.sql', '0179_todo_kind.sql', '0180_attend_none.sql', '0181_dash_due.sql', '0182_due_kind_name.sql', '0183_retest_done.sql', '0184_todo_students.sql']);
  if 앞것 <> 85 then
    raise exception '앞 파일 0100~0184 이 아직 다 안 들어갔습니다 (85개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0185_give_cross.sql
-- ─────────────────────────────────────────────────────────────
-- 0185 · 배부 크로스체크 — 칸반 칸마다 「알릴까 · 확인 받을까」, 아이마다 「원장 확인」 ((어96) · 2026-09-19)
--
-- 원장님 2026-09-19: 「배부에서 내가 완료처리하면 ① 학생에게 알림이가고 ② 어플에서 목록에떠야해 받아가야한다고.
--                    그리고 자기가 챙겨서 받아갔다는 체크를해야하는데 이게 그냥 생각없이 체크누르면 큰 문제가 돼.
--                    크로스체크가 필요하다는거야.」
--                   「배부라는건 칸반의 제목인거고. 그냥 칸반 자체에 이 기능이 있고 그걸 내가 쓸지말지 결정해야할듯.
--                    그리고 알림만주거나 어플목록에 띄우거나 둘다 하거나 선택가능하게해야함.」
-- 사고: 「배부」는 업무 분류(칸반의 칸) 하나일 뿐이라, 그 칸에만 박으면 다음에 같은 것이 필요한 칸에서 또 만든다.
--       그러니 **칸마다 스위치**로 둔다 — 원장님이 켜고 끄신다(원장님 말씀 그대로).
-- 고침: ① v2.todo_kind 에 칸 둘 — 어디에 알릴까(notify_way) · 아이 확인을 받을까(confirm_got)
--       ② v2.material_give 에 원장 확인 도장(checked_at)
--          ⚠️ 「누가 찍었나」는 **안 둔다** — 감사 기록(v2.audit · material_give_audit 트리거)이 이미 적는다(원칙-1).
--             칸을 하나 더 두면 UPDATE 에는 기본값이 안 먹어 **늘 비어 있는 칸**이 되고, 화면이 없는 것을 있는 척하게 된다(대전제-0).
--          ⚠️ 아이의 got_at(0117 트리거가 서버에서 찍는다)과 **다른 사실**이다 —
--             아이가 「받았다」 한 것과 원장님이 「맞다」 하신 것이 크로스체크의 두 눈이다.
--             폰이 없거나 안 찍는 아이가 있어도 원장님 도장으로 카드를 닫으실 수 있다(막다른 길을 안 만든다).
--       ③ 씨앗 — 배부 칸만 켜 둔다(원장님이 말씀하신 바로 그 자리) · 나머지 칸은 꺼진 채
-- 멱등: add column if not exists · 씨앗은 update … where notify_way = 'none'(한 번만 켠다)

alter table v2.todo_kind add column if not exists notify_way text not null default 'none';
alter table v2.todo_kind drop constraint if exists todo_kind_notify_way_choice;
alter table v2.todo_kind add constraint todo_kind_notify_way_choice check (notify_way in ('none', 'push', 'list', 'both'));
comment on column v2.todo_kind.notify_way is '이 칸의 카드가 끝나면 아이에게 어떻게 알릴까 — none 안 함 · push 알림만 · list 어플 목록만 · both 둘 다((어96) · 원장님 2026-09-19 「알림만주거나 어플목록에 띄우거나 둘다 하거나 선택가능하게」)';
alter table v2.todo_kind add column if not exists confirm_got boolean not null default false;
comment on column v2.todo_kind.confirm_got is '아이 확인을 받을까 — 켜면 아이가 「받았다」를 찍거나 원장님이 확인 도장을 찍어야 카드가 닫힌다((어96) 크로스체크 · 원장님 「생각없이 체크누르면 큰 문제가 돼」)';

alter table v2.material_give add column if not exists checked_at timestamptz;
comment on column v2.material_give.checked_at is '원장이 「이 아이가 정말 받아 갔다」고 확인한 때 — 아이가 찍은 got_at 과 **다른 사실**이다(크로스체크의 두 번째 눈 · (어96))';

-- 씨앗 — **여태 하던 그대로**에서 시작한다. 원장님 2026-09-19 「그걸 내가 쓸지말지 결정해야할듯」:
--   스위치를 제가 켜 두면 「결정」이 아니라 제가 정한 것이 된다. 그래서 켜는 것은 원장님이 하신다(05 칸 머리의 ✏️).
--   다만 📤 배부는 지금도 아이 어플 목록(07 📚 받을 교재·학습지)에 뜨므로 **'list' 로 적어 둔다** —
--   안 적으면 기본값 'none' 이 되어 **오늘까지 뜨던 것이 이 SQL 을 넣는 순간 사라진다**(대전제-0).
-- ⚠️ 이 파일을 다시 돌려도 이미 정해 두신 값은 안 건드린다(아직 'none' 인 것만 적는다).
update v2.todo_kind set notify_way = 'list' where kind = 'hand' and notify_way = 'none';

-- ══ ③ 알림 갈래에 give(학습지 배부 안내) — **세 열이 같아야 한다**((커) 확정-71 · check-rules-db)
--     하나만 고치면 보내다 막힌다. 큐 갈래(job_queue)도 같이 — 큐를 지나야 방해금지에 걸린다.
alter table v2.notify_log drop constraint if exists notify_log_kind_choice;
alter table v2.notify_log add constraint notify_log_kind_choice check (kind in
  ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video',
   'score','fee','schedule','guide','reject','give')) not valid;   -- = lib/notify-plan.js LABEL 의 열
alter table v2.notify_log validate constraint notify_log_kind_choice;
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in
  ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video',
   'score','fee','schedule','guide','reject','give')) not valid;
alter table v2.scheduled_send validate constraint scheduled_send_kind_choice;
alter table v2.job_queue drop constraint if exists job_queue_kind_choice;
alter table v2.job_queue add constraint job_queue_kind_choice check (kind in
  ('daily_report','late_notice','arrival_notice','leave_notice','attend_plan_notice','give_notice')) not valid;   -- = lib/send-plan.js KINDS
alter table v2.job_queue validate constraint job_queue_kind_choice;

-- ══ ④ 아이도 분류를 **읽기만** 한다 — 「어플 목록에 띄울까」 스위치를 아이 화면이 봐야 한다.
--     내용은 칸 이름·색·차례뿐이고, 쓰는 것은 그대로 학원 사람만이다(staff_all 은 그대로 둔다).
drop policy if exists read_all on v2.todo_kind;
create policy read_all on v2.todo_kind for select to authenticated using (true);

-- ══ ⑤ 판이 **아이마다** 받았나·확인했나를 싣는다 — 05 카드가 「받음 2/5 · 아직 누구」를 말하려면 이름이 있어야 한다
-- 「닫는 잣대」는 confirmed = 아이가 찍었거나(got) 원장님이 확인하셨거나(checked) — 폰이 없는 아이에게 막다른 길을 안 만든다
create or replace function v2.todo_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'note', t.note, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'done_at', t.done_at, 'why', t.why, 'private', t.private, 'created_at', t.created_at, 'start_on', t.start_on,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes) order by fl.created_at), '[]'::jsonb)
                             from v2.file_link fl join v2.file f on f.id = fl.file_id where fl.todo_id = t.id and f.state = 'active'),
                 'students', (select coalesce(jsonb_agg(jsonb_build_object('id', ts.student_id, 'name', tst.name, 'school_id', tst.school_id, 'school', tsc.name) order by tst.name), '[]'::jsonb)
                               from v2.todo_student ts join v2.students tst on tst.id = ts.student_id left join v2.schools tsc on tsc.id = tst.school_id where ts.todo_id = t.id and ts.state = 'active'),
                 'exam', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'school', esc.name, 'school_id', e.school_id, 'level', esc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
                                                                             'takers', (select count(*) from v2.exam_takers(e.id))) end,
                 'material', case when m.id is null then null else jsonb_build_object('id', m.id, 'title', m.title, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'state', m.state, 'reuse_of', m.reuse_of,
                     'items', (select count(*) from v2.material_item i where i.material_id = m.id),
                     'gives', (select count(*) from v2.material_give g where g.material_id = m.id),
                     'handed', (select count(*) from v2.material_give g where g.material_id = m.id and g.handed_at is not null),
                     'got', (select count(*) from v2.material_give g where g.material_id = m.id and g.got_at is not null),
                     'checked', (select count(*) from v2.material_give g where g.material_id = m.id and g.checked_at is not null),
                     'confirmed', (select count(*) from v2.material_give g where g.material_id = m.id and (g.got_at is not null or g.checked_at is not null)),
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done'),
                     'submitted', (select count(*) from v2.material_give g where g.material_id = m.id and g.submitted_at is not null),
                     'scored', (select count(*) from v2.material_give g where g.material_id = m.id and g.scored_at is not null),
                     'students', (select coalesce(jsonb_agg(jsonb_build_object('id', g.student_id, 'name', gs.name, 'handed', g.handed_at is not null, 'stage', g.stage, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at, 'got', g.got_at is not null, 'checked', g.checked_at is not null) order by gs.name), '[]'::jsonb) from v2.material_give g join v2.students gs on gs.id = g.student_id where g.material_id = m.id)) end,
                 'rule', r.name)
               order by t.due_on nulls last, t.due_time nulls last, t.created_at), '[]'::jsonb)
                from v2.todo t
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
                     'checked', (select count(*) from v2.material_give g where g.material_id = m.id and g.checked_at is not null),
                     'confirmed', (select count(*) from v2.material_give g where g.material_id = m.id and (g.got_at is not null or g.checked_at is not null)),
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done'),
                     'submitted', (select count(*) from v2.material_give g where g.material_id = m.id and g.submitted_at is not null),
                     'scored', (select count(*) from v2.material_give g where g.material_id = m.id and g.scored_at is not null),
                     'students', (select coalesce(jsonb_agg(jsonb_build_object('id', g.student_id, 'name', gs.name, 'handed', g.handed_at is not null, 'stage', g.stage, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at, 'got', g.got_at is not null, 'checked', g.checked_at is not null) order by gs.name), '[]'::jsonb) from v2.material_give g join v2.students gs on gs.id = g.student_id where g.material_id = m.id)) order by m.created_at), '[]'::jsonb)
                    from v2.material m join v2.material_type ty on ty.id = m.type_id left join v2.exams e on e.id = m.exam_id left join v2.schools esc on esc.id = e.school_id
                   where m.state <> 'dropped' and ('solve' = any(ty.steps) or 'score' = any(ty.steps))
                     and exists (select 1 from v2.material_give g where g.material_id = m.id and g.handed_at is not null)),   -- 준 자료만(0145 · (가)-⑧)
    'unit_tests', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'student_id', u.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'topic', gt.name, 'q_count', u.q_count, 'assigned_on', u.assigned_on, 'state', u.state,
                      'next_class', (select min(d.date) from v2.student_days(u.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) order by u.assigned_on, st.name), '[]'::jsonb)
                     from v2.unit_test u join v2.students st on st.id = u.student_id left join v2.schools sc on sc.id = st.school_id left join v2.grammar_topics gt on gt.id = u.topic_id
                    where u.state = 'todo'),
    'retests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'student_id', q.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'kind', q.kind, 'total', q.total, 'assigned_on', q.assigned_on, 'paper_at', q.paper_at, 'sheet_id', q.assigned_sheet_id, 'retry_of', q.retry_of, 'closed', (select d.closed_at is not null from v2.day_sheet d where d.id = q.assigned_sheet_id),
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
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school_id', st.school_id, 'school', sc.name, 'grade', st.grade,
                     'class_ids', (select coalesce(jsonb_agg(cl.class_id), '[]'::jsonb) from v2.student_classes(st.id, p_on) cl)) order by st.name), '[]'::jsonb)   -- (어96) 반으로도 좁히시게(원장님 「학교반이름 검색으로 필터링」) · class_member 한 줄 훑기라 가볍다
                   from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', s.weekdays, 'start_time', s.start_time) order by s.start_time, c.created_at), '[]'::jsonb)
                 from v2.classes c
                 left join lateral (select * from v2.class_schedule x where x.class_id = c.id and (x.to_date is null or x.to_date >= p_on) order by x.from_date desc limit 1) s on true
                where c.state = 'active'),
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
comment on function v2.todo_board(date) is '내 할 일 05 가 읽는 한 벌 — 할 일 줄(이은 아이 목록·회차·자료·규칙 붙여 · 자료는 배부·수령·원장 확인까지 아이마다) · 단원평가 낼 것 · 재시험 줄 · 성적 받을 회차 · 되풀이 규칙 · 학교 · 아이 · 문법 분류 · 다가오는 회차 · 오늘 되풀이 돌았나 · todo.* 규칙. 학원 사람만';

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0185_give_cross.sql', 'b0f71aecfb1e86bd')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
