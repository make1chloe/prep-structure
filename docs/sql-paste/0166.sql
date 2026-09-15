-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0166~0166 · 1개 · 2026-09-15 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0166_attend_reason.sql']);
  if 든것 = 1 then
    raise exception '0166~0166 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql']);
  if 앞것 <> 66 then
    raise exception '앞 파일 0100~0165 이 아직 다 안 들어갔습니다 (66개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0166_attend_reason.sql
-- ─────────────────────────────────────────────────────────────
-- 0166 (어44) 출결 사유 · 원장님 2026-09-15 「출결에 지각 결석 사유 필요헤 질병 진료 가족일정 학교일정 학교일정 진료 선택시 경고 누적 안되게해줘」
--   ① v2.day_sheet.attend_reason · 지각·결석의 까닭 넷(sick 질병 · clinic 진료 · family 가족 일정 · school 학교 일정) · 비면 없음.
--      쓰는 길은 lib/attend.js attendReasonWrite 하나(검사-②) · 출석으로 돌리면 까닭도 비운다.
--   ② 규칙 warn.excused · 경고에 안 세는 까닭(쉼표로 · 기본 clinic,school). 규칙 줄이라 원장님이 바꾼다(뼈대-5).
--   ③ v2.warn_days · 지각이라도 까닭이 warn.excused 에 들면 그날은 지각으로 안 센다. 반환형 그대로(warn_states 는 안 건드린다) · 0106 의 셈 그대로에 한 줄만.
--   ④ 14 학생 판(student_board)의 출결 줄은 이번엔 안 건드린다(까닭은 01 · 07 · 09 · 달력 · 부모님께 글에서 보인다).
alter table v2.day_sheet add column if not exists attend_reason text;
alter table v2.day_sheet drop constraint if exists day_sheet_attend_reason_choice;
alter table v2.day_sheet add constraint day_sheet_attend_reason_choice check (attend_reason is null or attend_reason in ('sick', 'clinic', 'family', 'school'));
comment on column v2.day_sheet.attend_reason is '(어44) 지각·결석 까닭 · sick 질병 · clinic 진료 · family 가족 일정 · school 학교 일정 · 비면 없음 · 경고에 안 세는 까닭은 규칙 warn.excused';

insert into v2.rule (key, value, note) values ('warn.excused', 'clinic,school', '(어44) 경고에 안 세는 지각·결석 까닭(쉼표로) · 기본 진료·학교 일정 · 원장님 9/15')
  on conflict (key) do nothing;

create or replace function v2.warn_days(p_student uuid, p_from date, p_to date)
returns table (date date, why text)
language sql stable as $$
  with r as (select (select value::int from v2.rule where key = 'warn.weak_from') weak_from,
                    string_to_array(coalesce((select value from v2.rule where key = 'warn.excused'), ''), ',') excused),
  d as (
    select s.date,
           bool_or(s.attend = 'late' and not (coalesce(s.attend_reason, '') = any (r.excused))) late,   -- (어44) 까닭이 진료·학교 일정이면 그날 지각은 안 센다
           count(*) filter (where i.slot = 'check' and i.status = 'missing') missing,
           count(*) filter (where i.slot = 'check' and i.status = 'weak') weak
      from v2.day_sheet s left join v2.day_item i on i.sheet_id = s.id, r
     where s.student_id = p_student and s.date between p_from and p_to
     group by s.date),
  q as (
    select q.taken_on date, count(*) n from v2.quiz q
     where q.student_id = p_student and q.kind = 'word' and q.retry_of is null
       and q.taken_on between p_from and p_to and v2.quiz_passed(q.id) is false
     group by q.taken_on)
  select x.date,
         concat_ws(' · ', case when x.late then '지각' end,
                          case when x.missing >= 1 then '숙제 미제출' end,
                          case when x.weak >= r.weak_from then '미흡 ' || x.weak || '건' end,
                          case when coalesce(x.fail, 0) >= 1 then '단어 미통과' end) why
    from (select coalesce(d.date, q.date) date, d.late, d.missing, d.weak, q.n fail
            from d full join q on q.date = d.date) x, r
   where x.late or x.missing >= 1 or x.weak >= r.weak_from or coalesce(x.fail, 0) >= 1
   order by 1
$$;
comment on function v2.warn_days(uuid, date, date) is '경고 하루씩(하루 1회) · 지각(까닭이 규칙 warn.excused 에 들면 안 셈 · (어44)) · 미제출 1건 · 미흡 N건부터(규칙 warn.weak_from) · 단어 미통과. 저장하지 않는다';
grant execute on function v2.warn_days(uuid, date, date) to authenticated, service_role;

-- API(PostgREST)가 새 칸(attend_reason)을 바로 보게 표 모양을 다시 읽힌다(check-sql)
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0166_attend_reason.sql', 'e3df38c33c27939c')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
