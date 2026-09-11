-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0160~0160 · 1개 · 2026-09-11 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0160_child_guard.sql']);
  if 든것 = 1 then
    raise exception '0160~0160 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql']);
  if 앞것 <> 60 then
    raise exception '앞 파일 0100~0159 이 아직 다 안 들어갔습니다 (60개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0160_child_guard.sql
-- ─────────────────────────────────────────────────────────────
-- 0160 — 표-9 「아이가 값을 쓰는 자리에는 DB 쪽 잠금」을 **남은 두 표**에도((사2) 2026-09-11)
--
--  왜: day_item·material_give 에는 「그 한 칸만 빼고 비교해 다르면 거절」 트리거가 있었는데
--      score·file_link 은 접근 규칙(RLS)만 있고 **바꿀 수 있는 칸을 안 묶어** 두었다.
--      RLS 의 with_check 는 「바뀐 뒤 줄」만 본다 — 그래서 아이가 제 줄을 집어
--        · score: student_id·exam_id 를 **남의 것으로 옮겨** 제 점수를 남에게 붙일 수 있었고
--        · file_link: day_item_id 를 **남의 숙제 줄로** 돌려놓을 수 있었다(with_check 가 true 였다).
--      둘 다 화면에는 그런 길이 없지만, 표-9 는 「화면에 없다」가 아니라 **DB 가 막는다**는 규칙이다.
--  무엇: day_item_child_guard 와 **같은 꼴**의 트리거 둘(허용 목록이 아니라 **차이 비교**).
--        서버 자신(크론·마이그레이션·검사)과 학원 사람은 그대로 지나간다.
--  되돌리기: drop trigger … ; drop function … ;  (표는 안 건드린다)

begin;

-- ① 성적 — 아이는 **제가 넣는 값**만. 누구 것인지(student_id)·어느 시험인지(exam_id)·확인 도장은 못 만진다
create or replace function v2.score_child_guard() returns trigger language plpgsql security definer set search_path = v2, public as $$
begin
  if auth.uid() is null then return new; end if;          -- 서버 자신(크론·마이그레이션)은 지나간다
  if v2.is_staff() then return new; end if;               -- 학원 사람은 그대로
  if (to_jsonb(new) - 'raw' - 'full_score' - 'note' - 'updated_at')
     is distinct from (to_jsonb(old) - 'raw' - 'full_score' - 'note' - 'updated_at') then
    raise exception '아이는 제 점수(원점수·만점·메모)만 고칠 수 있다 (score) — 누구 것인지·어느 시험인지는 못 바꾼다' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists score_child_guard on v2.score;
create trigger score_child_guard before update on v2.score for each row execute function v2.score_child_guard();
comment on function v2.score_child_guard() is '표-9 — 아이는 원점수·만점·메모만. student_id·exam_id·confirmed 는 못 바꾼다(0160)';

-- ② 숙제에 붙은 파일 — 아이는 **봤다는 표시**만. 어느 숙제·어느 파일인지는 못 돌린다(with_check 가 true 였다)
create or replace function v2.file_link_child_guard() returns trigger language plpgsql security definer set search_path = v2, public as $$
begin
  if auth.uid() is null then return new; end if;
  if v2.is_staff() then return new; end if;
  if (to_jsonb(new) - 'seen_by_child' - 'seen_at')
     is distinct from (to_jsonb(old) - 'seen_by_child' - 'seen_at') then
    raise exception '아이는 「봤음/안 보기」 표시만 할 수 있다 (file_link) — 어느 숙제에 붙은 파일인지는 못 바꾼다' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists file_link_child_guard on v2.file_link;
create trigger file_link_child_guard before update on v2.file_link for each row execute function v2.file_link_child_guard();
comment on function v2.file_link_child_guard() is '표-9 — 아이는 seen_by_child·seen_at 만(0160)';

insert into v2.migration (file, sha) values ('0160_child_guard.sql', 'x') on conflict (file) do nothing;

commit;

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0160_child_guard.sql', '7ccdf32831ed2fd6')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
