-- 클로이영어 — **읽기만 합니다.** 아무것도 안 바꾸고, 아무것도 안 지웁니다.
-- Supabase → SQL Editor → New query → 통째로 붙여넣고 Run → 나온 표를 사진으로 주세요.
--
-- 무엇을 보나: 앱 코드에는 0100~0159 가 다 있는데 실 DB 엔 몇 개가 안 들어가 있습니다.
--              (2026-09-11 붙여넣기에서 「56개 중 48개」라고 멈췄습니다 — 8개가 빕니다)
--              **어느 것이 비었는지**를 여기서 이름으로 봅니다.

with 코드에있는것(file) as (values
    ('0100_new_app_skeleton.sql'),
    ('0101_today.sql'),
    ('0102_day_item_free.sql'),
    ('0103_routine_lay.sql'),
    ('0104_quiz_card.sql'),
    ('0105_tune.sql'),
    ('0106_warn.sql'),
    ('0107_progress_staff.sql'),
    ('0108_warn_per_student.sql'),
    ('0109_attend_plan.sql'),
    ('0110_import_makeup_key.sql'),
    ('0111_comment.sql'),
    ('0112_row_head.sql'),
    ('0113_late_rest.sql'),
    ('0114_dash.sql'),
    ('0115_me.sql'),
    ('0116_service_role.sql'),
    ('0117_material_child.sql'),
    ('0118_send.sql'),
    ('0119_routine.sql'),
    ('0120_schedule.sql'),
    ('0121_fee.sql'),
    ('0122_exam.sql'),
    ('0123_score.sql'),
    ('0124_books.sql'),
    ('0125_board.sql'),
    ('0126_grid.sql'),
    ('0127_student.sql'),
    ('0128_files_video.sql'),
    ('0129_files_video_more.sql'),
    ('0130_fixture_schedule_end.sql'),
    ('0131_do_it_all.sql'),
    ('0132_today_finish.sql'),
    ('0133_send_kinds.sql'),
    ('0134_monthly.sql'),
    ('0135_classes.sql'),
    ('0136_touchups.sql'),
    ('0137_routine_todo.sql'),
    ('0138_notice_pref.sql'),
    ('0139_month_confirm.sql'),
    ('0140_progress_signals.sql'),
    ('0141_stay_slot.sql'),
    ('0142_excel_undo.sql'),
    ('0143_quiz_pos.sql'),
    ('0144_book_mode.sql'),
    ('0145_material_submit.sql'),
    ('0146_quiz_skip_visible.sql'),
    ('0147_unit_label_mode.sql'),
    ('0148_grid_share.sql'),
    ('0149_unit_test_due.sql'),
    ('0150_mine_reflections.sql'),
    ('0151_scheduled_other.sql'),
    ('0152_exam_change.sql'),
    ('0153_dash_classes.sql'),
    ('0154_sms.sql'),
    ('0155_road_parts.sql'),
    ('0156_student_month.sql'),
    ('0157_sms_kinds.sql'),
    ('0158_cc_skip.sql'),
    ('0159_site_import.sql')
)
select
  c.file                                as "안 들어간 파일",
  '차례대로 돌려야 합니다'               as "할 일"
from 코드에있는것 c
left join v2.migration m on m.file = c.file
where m.file is null
order by 1;

-- 아래는 셈만 — 위 표가 비어 있으면 다 들어간 것입니다.
select
  (select count(*) from v2.migration where file like '01%')  as "실 DB 에 들어간 01xx",
  60                                                          as "코드에 있는 01xx";
