-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0163~0163 · 1개 · 2026-09-14 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0163_today_prep.sql']);
  if 든것 = 1 then
    raise exception '0163~0163 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql']);
  if 앞것 <> 63 then
    raise exception '앞 파일 0100~0162 이 아직 다 안 들어갔습니다 (63개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0163_today_prep.sql
-- ─────────────────────────────────────────────────────────────
-- 0163 (어21) 01 을 안 떠난다 — 오늘 오는 아이의 「멈춘 교재의 시험」과 그 시험 자료(이 아이 배정 여부)를 한 벌로 준다.
--   원장님 2026-09-14 「수업 중 01 을 안 떠납니다 — 이게 내가 원하는거야」 · 「pc화면을 3단으로 — 학생목록 - 업무목록 - 구체적내용」.
--   데이터만 준다 — 멈췄나(stopOn) · 단계 · 줄 것 · 안 줌 은 lib/todo-plan.js · lib/routine-plan.js 가 센다(판단 한 벌 · 원칙-1).
--   today 함수는 안 건드린다 — 01 파도(Promise.all)에 한 줄 더 탄다(속도-1). 멱등.
create or replace function v2.today_prep(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select coalesce(jsonb_object_agg(x.student_id, x.exams), '{}'::jsonb)
  from (
    select sb.student_id,
           jsonb_agg(jsonb_build_object(
             'id', e.id, 'name', e.name, 'school', sc.name, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
             'scopes', (select count(*) from v2.prep_scope p where p.exam_id = e.id and p.removed_on is null),
             'books', (select coalesce(jsonb_agg(jsonb_build_object('book_id', y.book_id, 'name', b.name, 'stop_mode', y.stop_mode, 'stop_from', y.stop_from, 'stop_until', y.stop_until) order by b.name), '[]'::jsonb)
                         from v2.student_book y join v2.books b on b.id = y.book_id
                        where y.student_id = sb.student_id and y.stop_exam_id = e.id and (y.to_date is null or y.to_date >= p_on)),
             'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'title', m.title, 'state', m.state, 'reuse_of', m.reuse_of,
                              'give', (select jsonb_build_object('handed_at', g.handed_at, 'got_at', g.got_at, 'stage', g.stage, 'due_on', g.due_on, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at)
                                         from v2.material_give g where g.material_id = m.id and g.student_id = sb.student_id))
                            order by ty.source, ty.sort, ty.name, m.created_at), '[]'::jsonb)
                           from v2.material m join v2.material_type ty on ty.id = m.type_id where m.exam_id = e.id and m.state <> 'dropped')
           ) order by coalesce(e.english_on, e.term_from), e.name) exams
      from (select distinct y.student_id, y.stop_exam_id
              from v2.student_book y
             where y.stop_exam_id is not null and y.stop_mode <> 'running'
               and (y.to_date is null or y.to_date >= p_on) and (y.stop_until is null or y.stop_until >= p_on)) sb
      join v2.exams e on e.id = sb.stop_exam_id and e.state = 'active'
      left join v2.schools sc on sc.id = e.school_id
     group by sb.student_id
  ) x where v2.is_staff()
$$;
comment on function v2.today_prep(date) is '(어21) 오늘 수업 01 이 읽는 한 벌 — 아이마다 멈춘 교재의 시험(범위 수 · 멈춘 교재) · 그 시험 자료(이 아이 배정 give — 없으면 null). 판단은 lib/todo-plan.js prepOf';
grant execute on function v2.today_prep(date) to authenticated, service_role;

insert into v2.migration(file, sha) values ('0163_today_prep.sql', '1f18724c1df0821c')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
