-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0176~0176 · 1개 · 2026-09-17 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0176_reject_submit.sql']);
  if 든것 = 1 then
    raise exception '0176~0176 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql', '0173_password_flag.sql', '0174_staff_reset.sql', '0175_mine_fill.sql']);
  if 앞것 <> 76 then
    raise exception '앞 파일 0100~0175 이 아직 다 안 들어갔습니다 (76개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0176_reject_submit.sql
-- ─────────────────────────────────────────────────────────────
-- 0176 (어76 · 묶음 B) 숙제 반려 · 아이가 낸 것(사진 · 음성) — 멱등
--
-- 원장님 2026-09-17:
--  「숙제제출한 걸 보고 검사할수 있게 숙제검사페이지에 학생이 항목별로 제출한 사진을 확인가능하게.
--    이때 스크롤 늘지않도록 썸네일최소화」
--  「숙제검사에 동그라미 세모 엑스 도 이모지로 바꾸고 반려 추가. 반려 선택시 사유 —
--    화질저하, 페이지잘림, 페이지누락, 과제미완료, 정답/오답 근거누락, 등 사유선택하게 해줄것」
--  「숙제 음성녹음으로 제출도 가능하게 해줘」
--  「음성 녹음숙제 검사할 때 … 재생 위치를 이동해서 아무데서나 확인할 수 있게도 해 줘」
--  반려 세 걸음: 「알림이 떠야해. 그다음 기존사진 확인가능하게 해서 본인이 보고 그다음 삭제&다시 제출하게」
--
-- ⚠️ 반려는 day_item.status 값이 **아니다.** 반려한 줄은 「아직 검사 안 한 줄」로 남아야
--    숙제 검사 목록에서 사라지지 않는다(아이가 다시 내면 그때 ○△✕ 를 준다).
--    그래서 status 는 'none' 그대로이고 반려는 제 칸에 적는다.
--    덕분에 hw_done·hw_total 을 세는 판 함수 여덟(0127·0131·0134·0138·0155·0156·0175 …)을 하나도 안 건드린다(원칙-1).
-- ⚠️ 아이가 낸 것과 반려는 **원래 숙제 줄(slot='home')** 에 산다. 검사 줄(slot='check')은 carry_of 로 그것을 가리킨다.
--    두 곳에 적으면 반드시 어긋난다(원칙-1) — 화면은 lib/item-plan 의 srcOf() 한 벌로 읽는다.

begin;

-- ① 반려 칸 ─────────────────────────────────────────────
alter table v2.day_item add column if not exists reject_reason text;
alter table v2.day_item add column if not exists reject_note   text;
alter table v2.day_item add column if not exists rejected_at   timestamptz;
alter table v2.day_item drop constraint if exists day_item_reject_choice;
alter table v2.day_item add constraint day_item_reject_choice
  check (reject_reason is null or reject_reason in
         ('화질 저하','페이지 잘림','페이지 누락','과제 미완료','근거 누락','기타')) not valid;
alter table v2.day_item validate constraint day_item_reject_choice;   -- 새 제약은 validate 까지(표-6 · check-rules-db)
comment on column v2.day_item.reject_reason is
  '반려 사유 여섯(원장님 2026-09-17) — 화질 저하 · 페이지 잘림 · 페이지 누락 · 과제 미완료 · 근거 누락 · 기타. 비어 있으면 반려가 아니다. lib/status.js REJECT 와 같은 목록';
comment on column v2.day_item.reject_note is '사유가 「기타」일 때 한 마디';
create index if not exists day_item_rejected on v2.day_item (sheet_id) where reject_reason is not null;

-- ② 알림 유형에 reject ──────────────────────────────────
--    세 열(LABEL · notify_log · scheduled_send)이 같아야 한다 — 하나만 고치면 보내다 막힌다((커) 확정-71 · check-rules-db)
alter table v2.notify_log drop constraint if exists notify_log_kind_choice;
alter table v2.notify_log add constraint notify_log_kind_choice check (kind in
  ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video',
   'score','fee','schedule','guide','reject')) not valid;   -- = lib/notify-plan.js LABEL 의 열
alter table v2.notify_log validate constraint notify_log_kind_choice;
alter table v2.scheduled_send drop constraint if exists scheduled_send_kind_choice;
alter table v2.scheduled_send add constraint scheduled_send_kind_choice check (kind in
  ('daily','late','arrival','leave','plan_absent','plan_late','monthly','notice','welcome','video',
   'score','fee','schedule','guide','reject')) not valid;
alter table v2.scheduled_send validate constraint scheduled_send_kind_choice;

-- ③ 아이가 제 숙제 줄에 파일을 붙인다 ───────────────────
--    지금까지 file_link 에는 아이용 insert 규칙이 없어 아이는 숙제에 못 붙였다(0016 은 own_link select · child_seen update 뿐).
--    붙일 수 있는 곳은 **제 판의 숙제 줄**뿐이고, 붙이는 파일도 **제가 올린 것**뿐이다.
drop policy if exists child_attach on v2.file_link;
create policy child_attach on v2.file_link for insert to authenticated
  with check (day_item_id is not null
              and exists (select 1 from v2.file f where f.id = file_id and f.by_profile = auth.uid())
              and v2.sheet_visible((select sheet_id from v2.day_item di where di.id = day_item_id)));

-- ④ 학원 사람은 아이가 낸 것을 본다 ─────────────────────
--    (검사 화면이 줄마다 사진·음성을 보여야 한다. 지금 규칙은 sheet_visible 로만 열려 있어 판이 마감되기 전에는 안 보였다)
drop policy if exists staff_link on v2.file_link;
create policy staff_link on v2.file_link for select to authenticated using (v2.is_staff());

-- ⑤ 아이가 제가 낸 것을 내린다(지우지 않는다 · 대전제-6) ─
--    state 를 'hidden' 으로만 바꿀 수 있다 — 남의 파일도, 보관 경로도 못 건드린다.
drop policy if exists own_hide on v2.file;
create policy own_hide on v2.file for update to authenticated
  using (by_profile = auth.uid())
  with check (by_profile = auth.uid() and state in ('active','hidden'));

-- ⑤b 아이가 고칠 수 있는 칸은 **state 하나**뿐 ───────────
--    규칙(own_hide)의 with_check 는 **바뀐 뒤 줄만** 본다 — student_id 를 남의 것으로 옮겨도 통과한다.
--    그래서 0082 의 day_item_child_guard 와 같은 꼴로 **차이를 견주는** 방아쇠를 단다(check-childsaid 가 지킨다).
create or replace function v2.file_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare 누구 uuid := auth.uid();
begin
  if 누구 is null then return new; end if;                 -- 서버 자신(service role)
  if v2.is_staff() then return new; end if;                -- 학원 사람은 그대로
  if new.by_profile is distinct from old.by_profile then raise exception '올린 사람은 못 바꾼다 (file)' using errcode = '42501'; end if;
  if new.by_profile is distinct from 누구 then raise exception '내가 올린 것만 내린다 (file)' using errcode = '42501'; end if;
  if (to_jsonb(new) - 'state') is distinct from (to_jsonb(old) - 'state')
    then raise exception '아이가 고칠 수 있는 칸이 아니다 (file)' using errcode = '42501'; end if;
  if new.state not in ('active','hidden')
    then raise exception '내리거나 되살리는 것만 된다 (file)' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists file_child_guard on v2.file;
create trigger file_child_guard before update on v2.file for each row execute function v2.file_child_guard();

-- ⑥ 규칙 — 음성은 사진보다 크고 길다 ────────────────────
insert into v2.rule (key, value, note) values
  ('file.audio_max_mb', '20', '음성 녹음 한 개의 최대 크기(MB) · 사진·문서는 file.max_mb')
on conflict (key) do nothing;
insert into v2.rule (key, value, note) values
  ('file.audio_max_sec', '600', '음성 녹음 한 개의 최대 길이(초) · 넘으면 폰이 스스로 멈춘다')
on conflict (key) do nothing;

-- ⑦ 보관함이 음성을 받는 것은 **여기가 아니다** ─────────
--    버킷(storage.buckets.allowed_mime_types)은 전환일 파일 9000 이 만든다. 0176 은 v2 스키마만 건드린다
--    (check-v2only · 리허설 DB 에는 storage 표가 흉내만 있어 여기서 고치면 통째로 되돌아간다 — 2026-09-17 실측).
--    그래서 음성 여섯 종류는 9000_switch_day.sql 의 목록에 넣었다(lib/files-plan ALLOWED_MIME 과 같은 벌).

commit;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다 — 안 하면
-- 「Could not find the 'reject_reason' column ... in the schema cache」 가 난다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0176_reject_submit.sql', 'c5e91dd83ca85861')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
