-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0182~0183 · 2개 · 2026-09-19 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0182_due_kind_name.sql', '0183_retest_done.sql']);
  if 든것 = 2 then
    raise exception '0182~0183 · 2개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql', '0173_password_flag.sql', '0174_staff_reset.sql', '0175_mine_fill.sql', '0176_reject_submit.sql', '0177_item_app.sql', '0178_quick_memo.sql', '0179_todo_kind.sql', '0180_attend_none.sql', '0181_dash_due.sql']);
  if 앞것 <> 82 then
    raise exception '앞 파일 0100~0181 이 아직 다 안 들어갔습니다 (82개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/2 · 0182_due_kind_name.sql
-- ─────────────────────────────────────────────────────────────
-- 0182 · 대시보드 「⏰ 마감 필요」의 업무 줄이 **분류 이름**을 받는다 ((어88) · 2026-09-18)
--
-- 사고: 0181 은 `t.kind`(열쇠)만 실어 보냈고 화면은 `kindName(t.kind)` 를 **분류 표 없이** 불렀다.
--       씨앗(lib/todo-plan KINDS)에 없는 분류 — 곧 **원장님이 05 에서 직접 만드신 분류** — 는 이름을 못 찾아
--       열쇠가 그대로 보인다(`u3f9a2b1c`). 0179 로 분류를 원장님이 만드시게 한 순간 생긴 구멍이다.
-- 고침: **이미 join 하고 있던** v2.todo_kind 에서 이름을 같이 싣는다 — 새 조회가 아니다(속도-1).
--       분류를 지우셨거나 표가 아직 없으면 이름이 null 이라 화면이 씨앗으로 떨어진다(대전제-27).
-- 멱등: 0181 과 같은 drop → create 꼴. 앞 열은 전부 그대로다.

drop function if exists v2.dash_ops(date);
create function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int, progress_open boolean, progress_opened_on date, progress_pending int, progress_flags int, pref jsonb, confirm_next jsonb, rules jsonb, classes jsonb, due jsonb)
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
                        and exists (select 1 from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.d2 and (s.to_date is null or s.to_date >= cm.d1))) ) from cm),
         -- (어84) ⏰ 마감 필요 — 아이 파트 · 업무 파트
         jsonb_build_object(
           'students', (select coalesce(jsonb_agg(jsonb_build_object(
                 'sheet_id', d.id, 'student_id', d.student_id, 'name', st.name, 'class_id', d.class_id,
                 'attend', coalesce(d.attend, 'none'),
                 'left', (select count(*)::int from v2.day_item i where i.sheet_id = d.id and i.slot = 'check' and not i.off and coalesce(i.status, 'none') = 'none'),
                 'closed', d.closed_at is not null, 'sent', d.sent_at is not null) order by st.name), '[]'::jsonb)
               from v2.day_sheet d join v2.students st on st.id = d.student_id
              where d.date = p_on
                and (coalesce(d.attend, 'none') = 'none'
                  or d.closed_at is null or d.sent_at is null
                  or exists (select 1 from v2.day_item i where i.sheet_id = d.id and i.slot = 'check' and not i.off and coalesce(i.status, 'none') = 'none'))),
           'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'kind', t.kind, 'kind_name', k.name, 'due_on', t.due_on) order by t.due_on, t.created_at), '[]'::jsonb)
               from v2.todo t left join v2.todo_kind k on k.kind = t.kind
              where t.state in ('todo', 'doing') and t.due_on is not null and t.due_on <= p_on
                and coalesce(k.show_in, 'todo') in ('todo', 'both')))
   where v2.is_staff()
$$;

comment on function v2.dash_ops(date) is '대시보드 17 잡동사니 한 조회 — 하루 정리 · 클래스카드 · 마감 수 · 진도 체크 열림 · 카드 순서 · 다음 달 확정 상태 · 규칙 dash.* · (처) 이 달 정규반의 회차 · (어84)(어88) due(⏰ 마감 필요 — 오늘 판에서 출결·검사·마감·발송이 안 끝난 아이 + 오늘까지가 마감인 안 끝난 업무). 학원 사람만';
grant execute on function v2.dash_ops(date) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0182_due_kind_name.sql', '5c54f451f7f27d96')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

-- ─────────────────────────────────────────────────────────────
-- 2/2 · 0183_retest_done.sql
-- ─────────────────────────────────────────────────────────────
-- 0183 · 재시험 카드가 **끝날 수 있게** 한다 ((어89) · 2026-09-18)
--
-- 원장님 2026-09-18: 「재시험지 만들면 할일이뭐야」 · 「재시험지 만등었음 채트하고 또 완료를 기대하기 되는데」
--                    「재시함지는 왜 완료가 없어?」
-- 사고: 🔁 재시험지 카드는 v2.quiz(state='planned' · retry_of 있음)에서 저절로 서는데
--       **todo 줄이 아니라** 05 의 손(끝냄 · 체크박스 · ✎ · 삭제)이 하나도 안 붙었다.
--       「🖨 재시험지 만들었음」은 종이만 찍는 중간 표시라, 카드를 사라지게 하는 것은
--       **아이가 그날 남아서 재시험을 보는 것**(01 오늘 수업에서 결과를 적을 때)뿐이었다.
--       원장님이 「완료를 기대하게 된다」 하신 것이 정확하다 — 다른 카드는 다 「✓ 끝냄」이 있다.
-- 고침: 판이 재시험 줄의 **판 열쇠(assigned_sheet_id)** 와 **원래 시험(retry_of)** 을 같이 싣는다.
--       그러면 05 에서 「✓ 끝냄」을 눌러 그 자리에서 틀린 개수를 적을 수 있고,
--       손은 01 이 쓰는 **바로 그것**(lib/quiz takeQuiz)이라 결과가 그 아이 그날 일지에 제대로 남는다.
-- ⚠️ 재시험은 **낸 날 그날 남아서** 보는 것이라(ensureRetest 가 assigned_sheet_id 를 그날 판으로 넣는다)
--    그 판에 적는 것이 맞다 — 05 가 날짜를 새로 정하지 않는다.
-- ⚠️ 「마감했나」도 같이 싣는다 — **마감한 판은 못 고친다**(검사-⑤ · lib/quiz sheetRow → assertOpen).
--    안 싣고 단추만 그리면 **눌리는 것처럼 보이는데 안 눌리는** 자리가 또 생긴다(원장님 2026-09-18 「눌리지도않음」).
-- 멱등: create or replace. 앞 칸은 전부 그대로고 두 칸이 붙는다.

create or replace function v2.todo_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'note', t.note, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'done_at', t.done_at, 'why', t.why, 'private', t.private, 'created_at', t.created_at, 'start_on', t.start_on,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes) order by fl.created_at), '[]'::jsonb)
                             from v2.file_link fl join v2.file f on f.id = fl.file_id where fl.todo_id = t.id and f.state = 'active'),
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

insert into v2.migration(file, sha) values ('0183_retest_done.sql', '946046146f43e748')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
