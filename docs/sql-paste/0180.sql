-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0180~0180 · 1개 · 2026-09-18 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0180_attend_none.sql']);
  if 든것 = 1 then
    raise exception '0180~0180 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql', '0173_password_flag.sql', '0174_staff_reset.sql', '0175_mine_fill.sql', '0176_reject_submit.sql', '0177_item_app.sql', '0178_quick_memo.sql', '0179_todo_kind.sql']);
  if 앞것 <> 80 then
    raise exception '앞 파일 0100~0179 이 아직 다 안 들어갔습니다 (80개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0180_attend_none.sql
-- ─────────────────────────────────────────────────────────────
-- 0180 (어83) 출결을 안 찍어도 수업 일지가 선다 — 기본은 「아직」 · 다시 누르면 취소 — 멱등
--
-- 원장님 2026-09-18:
--  「출석지각결석 표시 다시 누르면 선택 안한 상태로, 취소가능하게 해줘.」
--  「애초에 출석처리를 안하면 검사가 불가능하게 되어있어서 그거때문에 그래.
--    그냥 체크가 안된상태를 기본으로 두고, 예정된 수업에서도 검사및 학습배정까지 가능하다면
--    미리 해놓고 출결만 당일에 찍고 싶은거임. 그리고 실수로 찍었을때 취소하려는것도 있고.」
--
-- 무엇이 잘못돼 있었나 — **판이 출결에 매여 있었다.**
--  ① attend 는 not null 이고 0101 의 CHECK 가 일곱 값만 받았다. 「아직 안 찍음」이 없었다.
--  ② 기본값이 'present' 라, 판이 서는 순간 그 아이는 **왔다고 적힌 것**이 된다.
--     그래서 앱은 판을 함부로 못 세웠고(오늘만 세웠다 · lib/day.js), 미리 검사·배정을 하려면
--     먼저 출결을 눌러야 했다. 원장님이 말씀하신 「출석처리를 안하면 검사가 불가능」이 이것이다.
--  ③ 잘못 누른 출결을 되돌릴 값이 없었다(판을 지우는 것은 대전제-6 이 막는다).
--
-- 그래서 값 하나('none')를 더하고 **기본값을 그리로 옮긴다.** 그러면 판은 「아직 아무것도
-- 안 적힌 종이」가 되어 며칠 전부터 세워 둘 수 있고, 출결은 당일에 찍으면 된다.
--
-- ⚠️ **이미 있는 줄은 안 건드린다.** 지난 판의 'present' 는 그대로 둔다 — 지난 기록을
--    조용히 고치는 것은 대전제-0 에 어긋난다(그날 화면이 말한 것과 달라진다).
--
-- 읽는 자리 — 다 그대로 산다:
--   lib/cal-plan.js  달력 아이콘  → 어느 갈래에도 안 들어 **아무 표시도 안 그린다**(맞다)
--   lib/student-plan 출결 셈      → 'none' 은 안 센다(앱에서 막았다)
--   v2.warn_days     경고         → late·absent 만 세니 그대로
--   0078 아이 등원   정책         → 아이는 present·late 로만 찍는다 · 그대로 둔다
begin;

alter table v2.day_sheet drop constraint if exists day_sheet_attend_check;
alter table v2.day_sheet add constraint day_sheet_attend_check
  check (attend in ('present', 'late', 'absent', 'early', 'online', 'makeup', 'off', 'none'));

alter table v2.day_sheet alter column attend set default 'none';

comment on column v2.day_sheet.attend is
  '출결 — none 아직 안 찍음(0180 · **기본값** · 같은 칩을 다시 누르면 여기로 돌아온다) · present 왔음 · late 지각 · absent 결석 · early 조퇴 · online 온라인 · makeup 보강으로 온 날(앱이 채운다, 0109) · off 휴강(사람이 고르지 않는다). 쓰는 길은 lib/attend.js attendanceWrite 하나(검사-②)';

commit;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0180_attend_none.sql', '10291570e2242d40')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
