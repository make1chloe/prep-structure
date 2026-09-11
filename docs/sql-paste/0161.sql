-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0161~0161 · 1개 · 2026-09-11 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0161_stop_one_rule.sql']);
  if 든것 = 1 then
    raise exception '0161~0161 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql']);
  if 앞것 <> 61 then
    raise exception '앞 파일 0100~0160 이 아직 다 안 들어갔습니다 (61개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0161_stop_one_rule.sql
-- ─────────────────────────────────────────────────────────────
-- 0161 「멈췄나」를 한 곳에서만 판단한다 (원칙-1)
--
-- 원장님 2026-09-11 「첫 주 돌려보기」에서 잡힌 것:
--   시험 회차를 넣는 **순간** 그 회차에 묶인 교재 줄이 미리 서고(stop_mode=book_off ·
--   stop_from=시험 몇 주 전 · stop_until=시험 뒤), 그 **stop_from 전**에는 교재가 멀쩡히 돌아간다.
--   실제로 오늘 수업 01 은 학습·숙제를 그대로 깔았다. 그런데 같은 줄을 보는 SQL 은
--   stop_from 을 **아예 안 봐서** 「멈춘 교재로는 시험을 낼 수 없습니다」로 막았다.
--   → 시험 몇 주 전부터 시험을 못 내는 상태가 조용히 이어진다.
--
-- 까닭: 같은 판단(「이 교재가 이 날 멈췄나」)이 JS(lib/routine-plan.js stopOn)와
--       SQL(v2.word_test_on) 두 벌로 적혀 있었고, 두 벌은 반드시 어긋난다(원칙-1).
-- 고침: SQL 쪽 판단을 v2.book_off_on 하나로 뽑고, JS stopOn 과 **글자 그대로 같은 규칙**을 적는다.
--       읽는 자리(word_test_on)는 그것을 부른다. scripts/check-stop.mjs 가 둘을 맞대어 잰다.

create or replace function v2.book_off_on(p_mode text, p_from date, p_until date, p_on date)
returns boolean language sql immutable as $$
  -- lib/routine-plan.js stopOn 과 같은 규칙:
  --   상태가 없거나 running 이면 안 멈춤 · stop_from 이 아직 안 왔으면 안 멈춤 · stop_until 이 지났으면 안 멈춤
  select p_mode = 'book_off'
     and (p_from  is null or p_from  <= p_on)
     and (p_until is null or p_until >= p_on)
$$;
comment on function v2.book_off_on is
  '「이 교재 줄이 이 날 교재멈춤인가」 — lib/routine-plan.js stopOn 과 한 규칙(원칙-1).
   stop_from 전이면 아직 진행중 · stop_until 이 지났으면 다시 진행중.';

create or replace function v2.word_test_on(p_student uuid, p_book uuid, p_on date default null)
returns boolean language sql stable as $$
  select exists (
    select 1 from v2.student_book sb
    where sb.student_id = p_student and sb.book_id = p_book
      and sb.from_date <= coalesce(p_on, v2.today())
      and (sb.to_date is null or sb.to_date >= coalesce(p_on, v2.today()))
      and not v2.book_off_on(sb.stop_mode::text, sb.stop_from, sb.stop_until, coalesce(p_on, v2.today()))
  )
$$;
comment on function v2.word_test_on is
  '⚠️ `book_off` 면 **시험도 안 나간다**(원장님 9/2). `hw_off`(숙제멈춤)는 시험을 안 막는다 —
   단어시험은 학원에서 보는 것이라 숙제와 별개다.
   멈췄나는 v2.book_off_on 한 곳에서만 판단한다(0161) — 2026-09-11 첫 주 돌려보기에서
   stop_from 을 안 보던 것이 잡혔다(시험 몇 주 전부터 시험을 못 냈다).';

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0161_stop_one_rule.sql', '46d2f5693653b590')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
