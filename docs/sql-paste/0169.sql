-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0169~0169 · 1개 · 2026-09-16 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0169_stamp_by.sql']);
  if 든것 = 1 then
    raise exception '0169~0169 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql']);
  if 앞것 <> 69 then
    raise exception '앞 파일 0100~0168 이 아직 다 안 들어갔습니다 (69개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0169_stamp_by.sql
-- ─────────────────────────────────────────────────────────────
-- 0169 (어48) 출결 곁에 하원 · 도착·하원 시각을 누가 찍었나 · 원장님 2026-09-16 「학생들이 어플에서 하원처리를 안했을 경우를 대비해서 출석체크 근처에 하원도 넣고 출석, 지각, 하원은 시간이 기록되게해 1차적으로 학생어플에서 눌렀으면 그걸 기준으로 삼고, 내가 다시 눌렀으면 내가 누른걸로 정정 그리고 시간 정정가능하게 나중에 누를수도 있으니까」
--   ① v2.arrival.stamped_by · 'student'(아이 앱) · 'staff'(원장·강사가 01 에서) · 기본값은 아이
--   ② 문지기(arrival_stamp)가 아이 줄에는 늘 'student' 를 덮는다(아이가 'staff' 라고 보내도 안 먹힌다) · 학원 사람은 그대로 지난다(시각도 손으로 정한다)
--   ⚠️ 몇 번을 돌려도 같은 결과여야 한다.
alter table v2.arrival add column if not exists stamped_by text not null default 'student';
alter table v2.arrival drop constraint if exists arrival_stamped_by;
alter table v2.arrival add constraint arrival_stamped_by check (stamped_by in ('student','staff'));

comment on column v2.arrival.stamped_by is
  '(어48) 누가 찍었나 — student 아이 앱(07 등원·하원 단추) · staff 원장·강사(01 출결 곁). '
  '아이가 찍은 시각이 1차 기준이라 출결을 눌러도 **이미 있는 줄은 안 덮는다**(lib/attend.js) · '
  '고치는 것은 01 의 시각 고치기 하나뿐이다(lib/arrival.js staffStamp)';

create or replace function v2.arrival_stamp() returns trigger
  language plpgsql security definer set search_path = v2, public as $fn$
declare 누구 uuid := auth.uid();
begin
  -- ⚠️ 검사·마이그레이션·이관은 지나간다(0083 과 같다)
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;      -- 원장·강사는 손으로 고칠 수 있다(시각도 · stamped_by 도)

  if tg_op = 'UPDATE' then
    raise exception '찍은 시각은 아이 손으로 못 고친다 (arrival)' using errcode = '42501';
  end if;
  -- **아이가 보낸 시각·날짜·찍은이를 안 믿는다.** 서버가 제 시계로 덮는다
  new.at   := now();
  new.date := v2.today();
  new.stamped_by := 'student';
  return new;
end $fn$;

drop trigger if exists arrival_stamp on v2.arrival;
create trigger arrival_stamp before insert or update on v2.arrival
  for each row execute function v2.arrival_stamp();

comment on function v2.arrival_stamp() is
  '표-10 — 「했다」는 서버가 시각을 정한다. 아이가 보낸 at·date·stamped_by 를 now()·v2.today()·student 로 덮고, '
  '아이의 update 는 거절한다. ⚠️ auth.uid() 가 null 이면(검사·이관) 그냥 지나간다 · (어48) stamped_by 를 더했다';

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0169_stamp_by.sql', 'cab985a77ad4e835')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
