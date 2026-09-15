-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0167~0167 · 1개 · 2026-09-15 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0167_timer.sql']);
  if 든것 = 1 then
    raise exception '0167~0167 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql']);
  if 앞것 <> 67 then
    raise exception '앞 파일 0100~0166 이 아직 다 안 들어갔습니다 (67개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0167_timer.sql
-- ─────────────────────────────────────────────────────────────
-- 0167 (어35) 아이 화면 타이머 · 원장님 2026-09-15 「학생페이지 타이머 짓는다」 · 「그이전에 학생이 시작버튼 눌러서 타이머 시작되면, 이미 학생이 시작한 학습 완료후에 나머지를 루틴대로 하도록 배정함」
--   ① v2.day_item.started_at · ended_at · 학원 줄(slot class)에 아이가 「▶ 시작」 「■ 끝」을 누른 때(서버 시계 · 문지기가 찍는다). 끝을 누르면 said_done_at 도 같이 찍힌다(「다 했어요」와 같은 뜻).
--   ② v2.day_item_child_guard · 아이가 바꿀 수 있는 칸 셋(said_done_at · started_at · ended_at) · 비었다가 찍히는 순간은 now() · 이미 찍힌 것은 안 바뀐다 · 비우기(취소)는 된다(원장님 답 ⑧과 같은 결)
--   ③ 차례(sort)는 학원 사람 손이 쓴다(lib/routine.js layRoutine · reorderToday · moveBook) · 표는 안 바뀐다 · 검사 먼저 끝난 교재부터 깔리고 다 끝나면 루틴 차례로 다시 선다(시작한 줄은 앞)
alter table v2.day_item add column if not exists started_at timestamptz;
alter table v2.day_item add column if not exists ended_at timestamptz;
comment on column v2.day_item.started_at is '(어35) 아이가 「▶ 시작」을 누른 때(서버 시계) · 학원 줄 · 검사가 다 끝나 루틴 차례로 다시 세울 때 이 줄은 앞에 둔다';
comment on column v2.day_item.ended_at is '(어35) 아이가 「■ 끝」을 누른 때(서버 시계) · 그때 said_done_at 도 찍힌다 · 취소하면 둘 다 비운다';

create or replace function v2.day_item_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare 누구 uuid := auth.uid();
begin
  -- 로그인한 사람이 없으면 지나간다 · 검사·마이그레이션·크론은 jwt 없이 postgres 로 돈다(0084)
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;

  -- 남의 판은 못 건드린다 · 학부모도 여기서 걸린다(0084 ㉑ · 원장님 「절대안돼」)
  if not v2.sheet_mine(new.sheet_id) then
    raise exception '내 판이 아니면 못 건드린다 (day_item) · 학부모는 「다 했어요」를 못 누른다' using errcode = '42501';
  end if;

  -- 아이는 셋만 바꾼다 · 다 했어요 · 시작 · 끝(표-9 · (어35)). updated_at 은 touch 트리거가 미는 값이라 뺀다
  if (to_jsonb(new) - 'said_done_at' - 'started_at' - 'ended_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'said_done_at' - 'started_at' - 'ended_at' - 'updated_at') then
    raise exception '아이는 「다 했어요 · 시작 · 끝」 말고는 못 바꾼다 (day_item)' using errcode = '42501';
  end if;

  -- 시각은 서버가 정한다(표-10) · 비었다가 찍히면 now() · 이미 찍힌 것은 그대로 · 비우기(취소)는 된다(원장님 답 ⑧)
  if new.said_done_at is not null then new.said_done_at := coalesce(old.said_done_at, now()); end if;
  if new.started_at   is not null then new.started_at   := coalesce(old.started_at, now()); end if;
  if new.ended_at     is not null then new.ended_at     := coalesce(old.ended_at, now()); end if;
  return new;
end $$;
comment on function v2.day_item_child_guard() is
  '아이의 「다 했어요 · ▶ 시작 · ■ 끝」 문지기(표-9·표-10 · 0115 · (어35)) · 내 판만 · 세 칸 말고는 못 바꿈 · 시각은 서버가 · 취소(비우기)는 된다(원장님 답 ⑧). 학원 사람·검사는 지나간다';

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0167_timer.sql', 'c78d061e65c4329c')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
