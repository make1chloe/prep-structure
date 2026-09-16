-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0170~0170 · 1개 · 2026-09-16 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0170_arrival_undo.sql']);
  if 든것 = 1 then
    raise exception '0170~0170 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql']);
  if 앞것 <> 70 then
    raise exception '앞 파일 0100~0169 이 아직 다 안 들어갔습니다 (70개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0170_arrival_undo.sql
-- ─────────────────────────────────────────────────────────────
-- 0170 (어55) 잘못 누른 하원을 취소한다 · 원장님 2026-09-16 「하원버튼 실수할거같으니 강조해주고, 다시 누르면 취소가능하게」
--   ⚠️ 지우지 않는다(대전제-6) — 줄은 그대로 두고 undone_at 을 찍어 **없던 것으로 내린다.** 읽는 자리가 그 줄을 빼고 센다.
--     (처음엔 delete 로 지으려다 check-grants 가 막았다 — 「지울 권한을 가진 표가 없다」가 이 앱의 규칙이다)
--   ⚠️ 다시 찍으면 되살아난다 — staffStamp 의 upsert 가 undone_at 을 null 로 덮는다(하루 한 줄 · 학생·날짜·걸음).
--   ⚠️ 몇 번을 돌려도 같은 결과여야 한다.
alter table v2.arrival add column if not exists undone_at timestamptz;

comment on column v2.arrival.undone_at is
  '(어55) 잘못 누른 도착·하원을 취소한 때 (lib/arrival.js clearStamp). '
  '값이 있으면 **안 찍은 것으로 본다** — 읽는 자리가 전부 .is("undone_at", null) 로 뺀다(check-arrival 이 지킨다). '
  '⚠️ 학원 사람이 찍은 줄(stamped_by = staff)만 내릴 수 있다 — 아이 앱이 찍은 시각은 1차 기준이라 시각 고치기로만 바꾼다';

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0170_arrival_undo.sql', 'd1aee186cdea2921')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
