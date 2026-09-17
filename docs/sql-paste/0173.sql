-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0173~0173 · 1개 · 2026-09-17 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0173_password_flag.sql']);
  if 든것 = 1 then
    raise exception '0173~0173 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql']);
  if 앞것 <> 73 then
    raise exception '앞 파일 0100~0172 이 아직 다 안 들어갔습니다 (73개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0173_password_flag.sql
-- ─────────────────────────────────────────────────────────────
-- 0173 (어71) 비밀번호를 바꿔도 다음 화면으로 못 가던 것 · 원장님 2026-09-17 「여기서 화면이 안넘어감」
--   길은 이렇다 — 비밀번호를 바꾼다 → v2.password_changed() 가 그 사람 줄의 must_change_pw 를 내린다 → 다음 화면으로 간다.
--   가운데 함수가 없거나 PostgREST 가 옛 모양을 기억하고 있으면 **표시가 안 내려가고**, 다음 화면의 문지기가 다시 비밀번호 화면으로 되돌린다.
--   화면은 그대로라 「안 넘어간다」로 보였다(대전제-0 — 앱 쪽은 이제 까닭을 말한다).
--   여기서는 그 셋을 다시 못 박는다: 함수 · 실행 권한 · 최소 글자 수 규칙 줄. 표 모양은 안 바꾼다. 몇 번을 돌려도 같다.

-- ① 표시를 내리는 함수 — 0100 과 같은 것. 없으면 생기고, 있으면 그대로다
create or replace function v2.password_changed() returns void
  language sql security definer set search_path = v2, public as $$
  update v2.profiles set must_change_pw = false where id = auth.uid()
$$;
comment on function v2.password_changed() is '비밀번호를 바꿨다 — 본인 줄의 must_change_pw 만 내린다((어71) 0173 이 다시 못 박음)';
grant execute on function v2.password_changed() to authenticated;

-- ② 최소 글자 수 규칙 줄 — 없으면 앱이 「규칙 줄이 없다」로 멈춘다(lib/rule.js 는 조용히 기본값으로 안 돈다)
insert into v2.rule (key, value, note) values
  ('password.min_len', '6', '비밀번호 최소 글자 수 — 처음 비밀번호는 못 쓴다')
on conflict (key) do nothing;

-- ③ 규칙 줄은 로그인한 사람이면 읽는다 — 못 읽으면 ② 가 있어도 앱이 멈춘다
drop policy if exists rule_read on v2.rule;
create policy rule_read on v2.rule for select to authenticated using (true);

notify pgrst, 'reload schema';

-- ④ **여기가 진짜 까닭이었다** — 0127 의 문지기가 선생님·조교의 비밀번호 바꾸기를 막고 있었다.
--    v2.profiles_guard 는 「원장만 학원 사람 계정을 고친다」라, 선생님·조교가 제 비밀번호를 바꾼 뒤
--    ①이 제 줄의 must_change_pw 를 내리는 것까지 튕겼다(아이·학부모 줄은 안 막혀서 그쪽은 잘 됐다 —
--    그래서 (어64) 로 낸 선생님 계정에서만 「화면이 안 넘어감」이 났다).
--    문을 넓히지는 않는다: **제 줄**이고 · **그 칸 하나만** 바뀌고 · **내려가는 쪽**일 때만 지나간다.
--    역할을 바꾸거나 다른 칸을 손대면 그대로 막힌다.
create or replace function v2.profiles_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare me text;
begin
  if auth.uid() is null then return new; end if;                                            -- 서버 자신
  if tg_op = 'UPDATE' and new.id = auth.uid()                                               -- (어71) 제 줄의 「처음 비밀번호」 표시 내리기 하나
     and old.must_change_pw and not new.must_change_pw
     and (to_jsonb(new) - 'must_change_pw') = (to_jsonb(old) - 'must_change_pw') then return new; end if;
  select role into me from v2.profiles where id = auth.uid();
  if me = 'principal' then return new; end if;
  if tg_op = 'INSERT' and new.role not in ('student', 'parent') then raise exception '원장만 학원 사람 계정을 만듭니다'; end if;
  if tg_op = 'UPDATE' and (old.role not in ('student', 'parent') or new.role <> old.role) then raise exception '원장만 학원 사람 계정을 고칩니다'; end if;
  return new;
end $$;
comment on function v2.profiles_guard() is '강사·조교는 학생·학부모 계정만 만들고 고친다 — 역할을 못 바꾸고 학원 사람 줄에 못 닿는다. 원장·서버 자신은 지나간다. (어71) 제 줄의 「처음 비밀번호」 표시를 내리는 것 하나만 예외(그 칸만 · 내려가는 쪽만)';

notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0173_password_flag.sql', '9071bf698f52b2f5')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
