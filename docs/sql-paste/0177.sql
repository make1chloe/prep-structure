-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0177~0177 · 1개 · 2026-09-17 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0177_item_app.sql']);
  if 든것 = 1 then
    raise exception '0177~0177 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql', '0173_password_flag.sql', '0174_staff_reset.sql', '0175_mine_fill.sql', '0176_reject_submit.sql']);
  if 앞것 <> 77 then
    raise exception '앞 파일 0100~0176 이 아직 다 안 들어갔습니다 (77개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0177_item_app.sql
-- ─────────────────────────────────────────────────────────────
-- 0177 (어77 · 묶음 C) 이 항목은 어느 앱에서 하나 — 멱등
--
-- 원장님 2026-09-17:
--  「다했어요 누르면 클래스카드 숙제는 클래스카드 라고 버튼 누르고 넘어가규
--    교재숙제는 사진으로 제출 가능하게해줘」
--
-- ⚠️ 이름으로 짐작하지 않는다. 「클래스카드 문장훈련」처럼 이름에 든 글자를 보고 가르면
--    항목 이름을 고치는 날 조용히 어긋난다(숨은 규칙). 그래서 **칸 하나**로 정한다 —
--    원장님이 설정 › 루틴에서 항목마다 켜신다(대전제-19 · 항목은 더하고 고치고 빼는 것이 기본).
-- ⚠️ 값은 지금 'cc' 하나뿐이고, 비면(null) 교재 숙제다 — 사진·음성으로 낸다.
--    앞으로 다른 앱이 생기면 여기 check 에 한 낱말을 더한다(판단은 lib/item-plan nextStep 한 곳).

begin;

alter table v2.learn_items add column if not exists by_app text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'learn_items_by_app_chk') then
    alter table v2.learn_items add constraint learn_items_by_app_chk
      check (by_app is null or by_app in ('cc')) not valid;
  end if;
end $$;
alter table v2.learn_items validate constraint learn_items_by_app_chk;

comment on column v2.learn_items.by_app is
  '(어77) 아이가 이것을 하는 앱 — cc 면 🃏 클래스카드에서 하고(완료 뒤 「클래스카드」 단추), 비면 교재 숙제라 사진·음성으로 낸다';

-- 루틴 11 이 이 칸을 보고 칩을 그린다 — 판 함수를 **앞 정의 그대로** 다시 내고 'by_app' 두 자리만 더한다
-- (0143 본이 마지막이었다 · check-redefine 이 앞 정의의 키를 하나도 안 잃었는지 본다).
create or replace function v2.routine_board(p_student uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_student, (select id from v2.students where state = 'active' order by name limit 1)) sid)
  select jsonb_build_object(
    'student', pick.sid,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'method', i.method, 'checks', i.checks, 'state', i.state, 'sort', i.sort, 'by_app', i.by_app) order by i.sort, i.name), '[]'::jsonb) from v2.learn_items i),
    'area_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', ar.id, 'area', ar.area::text, 'item_id', ar.item_id, 'place', ar.place, 'required', ar.required, 'gate_prev', ar.gate_prev, 'sort', ar.sort, 'state', ar.state,
                                                                 'name', li.name, 'method', li.method, 'checks', li.checks, 'item_state', li.state, 'by_app', li.by_app) order by ar.area, ar.sort), '[]'::jsonb)
                    from v2.area_routine ar join v2.learn_items li on li.id = ar.item_id),
    'book_counts', (select coalesce(jsonb_object_agg(b.area, b.n), '{}'::jsonb) from (select area::text area, count(*) n from v2.books where state = 'active' and area is not null group by area) b),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'grade', s.grade, 'quiz_pos', s.quiz_pos) order by s.name), '[]'::jsonb) from v2.students s where s.state = 'active'),
    'student_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'book_id', sr.book_id, 'area', sr.area::text, 'item_id', sr.item_id, 'place', sr.place, 'sort', sr.sort, 'state', sr.state,
                                                                    'count_n', sr.count_n, 'criterion', sr.criterion, 'gate_prev', sr.gate_prev, 'name', li.name, 'method', li.method, 'item_state', li.state) order by sr.area, sr.sort), '[]'::jsonb)
                       from v2.student_routine sr join v2.learn_items li on li.id = sr.item_id where sr.student_id = pick.sid),
    'student_books', (select coalesce(jsonb_agg(jsonb_build_object('id', sb.id, 'book_id', sb.book_id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'from_date', sb.from_date, 'to_date', sb.to_date, 'round', sb.round,
                                                                    'per_session', sb.per_session, 'order_basis', coalesce(sb.order_basis, b.order_basis), 'own_basis', sb.order_basis,
                                                                    'unit_test', sb.unit_test, 'unit_test_n', sb.unit_test_n, 'stop_mode', sb.stop_mode, 'stop_until', sb.stop_until, 'stop_from', sb.stop_from, 'stop_exam_id', sb.stop_exam_id,
                                                                    'remaining', (select count(*) from v2.todo_units(pick.sid, sb.book_id, p_on)),
                                                                    'total', (select count(*) from v2.units u where u.book_id = sb.book_id and u.state = 'active')) order by sb.from_date desc), '[]'::jsonb)
                       from v2.student_book sb join v2.books b on b.id = sb.book_id
                      where sb.student_id = pick.sid and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
    'days', (select coalesce(jsonb_agg(d.date order by d.date), '[]'::jsonb) from v2.student_days(pick.sid, p_on, p_on + 400) d where d.kind in ('class', 'makeup')),
    'books_free', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b
                    where b.state = 'active' and pick.sid is not null
                      and not exists (select 1 from v2.student_book sb where sb.student_id = pick.sid and sb.book_id = b.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)))
  ) from pick where v2.is_staff()
$$;

commit;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0177_item_app.sql', '5b74567344530c61')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
