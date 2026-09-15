-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0165~0165 · 1개 · 2026-09-15 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0165_legacy_choice_rows.sql']);
  if 든것 = 1 then
    raise exception '0165~0165 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql']);
  if 앞것 <> 65 then
    raise exception '앞 파일 0100~0164 이 아직 다 안 들어갔습니다 (65개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0165_legacy_choice_rows.sql
-- ─────────────────────────────────────────────────────────────
-- 0165 (어22b) 옛 앱에서 받아온 줄이 0131 의 고르는 값 제약(not valid)에 안 맞아 못 고쳐지던 것을 끝낸다.
--   2026-09-15 실 DB 를 docs/sql-paste/0-안-맞는-옛-줄.sql 로 재니 안 맞는 줄은 문의(inquiry.way) 5줄뿐(나머지 11 제약은 0).
--   ① 문의 경로(way): 옛 앱의 값(「재원생 소개」「지인 소개」「블로그」「인터넷 검색」「지나가다 보고」「기타」 · lib/applySlots SOURCES)을
--      새 앱의 넷(phone·site·visit·intro)에 붙이고, 못 붙이는 값은 「기타(other)」로 두되 원래 글을 문의 내용 끝에 남긴다(지우지 않는다).
--   ② 그 뒤 검증 안 한 제약을 모두 validate 한다. 옛 줄이 남아 있으면 이 파일이 그 제약 이름으로 실패하니 숨어 있을 수 없다.

-- ① 문의 경로 · 「기타」 자리를 제약에 더한다(lib/inquiry-plan WAYS 와 같은 목록)
alter table v2.inquiry drop constraint if exists inquiry_way_choice;
alter table v2.inquiry add constraint inquiry_way_choice check (way in ('phone', 'site', 'visit', 'intro', 'other')) not valid;
-- 글과 경로를 **한 문장**에서 바꾼다: 따로 하면 첫 문장이 옛 경로 그대로인 줄을 고치다 제약에 걸린다(e2e 에서 잡음)
update v2.inquiry
   set body = case when way !~ '소개|블로그|검색|홈페이지|인터넷|지나가다|방문|전화' then concat_ws(E'\n', body, '옛 경로: ' || way) else body end,
       way  = case when way ~ '소개' then 'intro'
                   when way ~ '블로그|검색|홈페이지|인터넷' then 'site'
                   when way ~ '지나가다|방문' then 'visit'
                   when way ~ '전화' then 'phone'
                   else 'other' end
 where way is not null and way not in ('phone', 'site', 'visit', 'intro', 'other');
alter table v2.inquiry validate constraint inquiry_way_choice;

-- ② 검증 안 한 제약 전부 검증(실 DB 는 안 맞는 줄 0 · 2026-09-15 표). 다시 돌려도 이미 검증된 것은 지나간다.
do $$ declare r record; begin
  for r in select conrelid::regclass as t, conname from pg_constraint where connamespace = 'v2'::regnamespace and contype = 'c' and not convalidated loop
    execute format('alter table %s validate constraint %I', r.t, r.conname);
  end loop;
end $$;

-- 표 모양(제약)을 바꿨으니 API 기억을 새로 읽는다(check-sql)
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0165_legacy_choice_rows.sql', '36ab7dd037cb93f5')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
