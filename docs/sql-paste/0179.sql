-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0179~0179 · 1개 · 2026-09-18 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0179_todo_kind.sql']);
  if 든것 = 1 then
    raise exception '0179~0179 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql', '0172_etc.sql', '0173_password_flag.sql', '0174_staff_reset.sql', '0175_mine_fill.sql', '0176_reject_submit.sql', '0177_item_app.sql', '0178_quick_memo.sql']);
  if 앞것 <> 79 then
    raise exception '앞 파일 0100~0178 이 아직 다 안 들어갔습니다 (79개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0179_todo_kind.sql
-- ─────────────────────────────────────────────────────────────
-- 0179 (어80) 🗂️ 업무 분류를 표로 — 원장님이 앱에서 더하고 고치고 내린다 — 멱등
--
-- 원장님 2026-09-18:
--  「업무 칸반보드에 분류자체를 추가/수정/삭제가 되게해줘」
--  「세부내용의 일괄처리 - 분류 옮기기가능하게, 그리고 전체선택버튼이 없음」
--  「업무-메모에 학사일정이 다 들어가있는데 이건 원하지않아. 학교별 일정에 필요해」
--  「일정으로 추가하면되는거아냐? 일정도 업무처럼 칸반개념으로 가서, 시험만, 학교행사만 필터링해서보면될거같은데」
--
-- ⚠️ 여태 분류(칸)는 lib/todo-plan.js KINDS **열 벌에 글자로 박혀** 있었다. 하나 더하려면 코드를 고쳐야 했으니
--    원장님이 못 고치셨다. 예외를 하나 더 붙일 자리가 아니라 **설계가 틀린 자리**다(원칙 4-3 · 세 번째 예외면 멈춘다).
-- ⚠️ 앱이 내는 열 벌은 씨앗으로 넣고 app=true 로 잠근다 — **못 지운다**(지우면 앱이 만드는 카드가 갈 곳을 잃는다).
--    이름·색·차례·어디에 보일지는 그래도 고치실 수 있다.
-- ⚠️ 지우지 않는다(대전제-6) — 내린 분류는 state='off'. 업무가 남아 있으면 화면은 그 칸을 계속 보여 준다(대전제-0).
-- ⚠️ show_in — 이 분류를 **업무 05 에 보일지 · 일정 12 에 보일지 · 둘 다**인지.
--    옛 앱 학사일정 226줄이 업무 「📋 메모」 칸에 쌓인 까닭이 이것이다(0110 ⑨ 가 public.tasks 를 그대로 옮겼고,
--    0164 가 꼴이 안 맞는 kind 를 죄다 'note' 로 다시 적었다). 그 226줄을 「🏛️ 학교 행사」로 옮기고
--    show_in='schedule' 로 둔다 — 업무에서는 빠지고 일정 달력에는 그대로 남는다(schedule_board 는 kind 를 안 가린다).

begin;

-- ① 분류 표 ────────────────────────────────────────────
create table if not exists v2.todo_kind (
  kind       text primary key,                          -- 앱이 내는 것은 뜻이 있는 글자(make · print …) · 원장님이 만드신 것은 u+8자
  name       text not null,                             -- 화면에 나오는 이름 · 이모지를 앞에 붙인다(「📄 자료 만들기」)
  cls        text not null default '',                  -- 칸 색(nb-orange · nb-blue · nb-yellow · nb-green · nb-red · 빈 것)
  ord        int  not null default 500,                 -- 칸 차례(작은 것이 왼쪽)
  app        boolean not null default false,            -- 앱이 카드를 내는 분류 — 못 내린다
  show_in    text not null default 'todo' check (show_in in ('todo', 'schedule', 'both')),   -- 표-5: `_on` 은 날짜라는 뜻이라 안 쓴다(check-rules-db 가 잡았다)
  state      text not null default 'active' check (state in ('active', 'off')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
comment on table v2.todo_kind is
  '(어80) 업무 분류 한 줄 = 05 칸반의 칸 하나. 앱이 내는 열 벌(app=true)은 못 지우고 이름·색·차례만 고친다. 내린 것은 state=off(대전제-6). show_in 이 업무 05 · 일정 12 중 어디에 보일지를 정한다';

drop trigger if exists todo_kind_touch on v2.todo_kind;
create trigger todo_kind_touch before update on v2.todo_kind for each row execute function v2.touch_row();
drop trigger if exists todo_kind_audit on v2.todo_kind;
create trigger todo_kind_audit after insert or update or delete on v2.todo_kind for each row execute function v2.audit_row();
alter table v2.todo_kind enable row level security; alter table v2.todo_kind force row level security;
drop policy if exists todo_kind_staff on v2.todo_kind;
create policy todo_kind_staff on v2.todo_kind for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.todo_kind to authenticated, service_role;   -- 지우는 권한은 없다(대전제-6 · check-grants)

-- ② 앱이 내는 열 벌 — lib/todo-plan.js KINDS 와 **같은 열 벌**이다(check-kind 가 한 글자까지 견준다) ─
--    do nothing — 원장님이 이름을 고치신 뒤에 다시 돌아도 덮어쓰지 않는다(멱등의 뜻은 「같아진다」지 「되돌린다」가 아니다).
insert into v2.todo_kind(kind, name, cls, ord, app) values
  ('make',      '📄 자료 만들기',   'nb-orange', 10, true),
  ('print',     '🖨 인쇄',          'nb-blue',   20, true),
  ('hand',      '📤 배부',          'nb-yellow', 30, true),
  ('solve',     '✍️ 풀이',          '',          40, true),
  ('grade',     '✅ 채점',          'nb-green',  50, true),
  ('unit_test', '✍️ 단원평가 출제',  '',          60, true),
  ('retest',    '🔁 재시험지',      'nb-red',    70, true),
  ('score',     '📥 성적 받기',     'nb-green',  80, true),
  ('repeat',    '⏰ 반복',          '',          90, true),
  ('note',      '📋 메모',          '',         100, true)
on conflict (kind) do nothing;
update v2.todo_kind set app = true
 where app = false and kind in ('make','print','hand','solve','grade','unit_test','retest','score','repeat','note');

-- ③ 🏛️ 학교 행사 — 옛 앱 학사일정이 갈 곳 ─────────────────
insert into v2.todo_kind(kind, name, cls, ord, app, show_in) values
  ('school_event', '🏛️ 학교 행사', 'nb-blue', 110, false, 'schedule')
on conflict (kind) do nothing;

-- ④ kind 를 여덟 값에 가두던 옛 제약을 **먼저 푼다** ─────────
--    0131 이 여덟 값을 글자로 박았고(`todo_kind_choice`) 0164 가 그것을 validate 했다 —
--    **그래서 원장님이 분류를 만드셔도 그리로 옮길 수가 없었다**(DB 가 튕긴다).
--    ⚠️ 2026-09-18 원장님 실측 — 이 줄이 아래 ⑤(학사일정 옮기기)보다 **뒤에** 있어서 실 DB 에서 터졌다:
--       「new row for relation "todo" violates check constraint "todo_kind_choice"」.
--       눌러보기 DB 에는 옛 앱 줄(public.tasks)이 비어 있어 ⑤ 가 빈손으로 지나가 걷기가 못 잡았다 —
--       **옛 자료를 건드리는 줄은 걷기가 못 본다. 차례를 글자로 지킨다**(check-kind).
--    이제 규칙은 「분류 표에 있는 것」 하나다. 글자 목록을 지우고 ⑥ 에서 참조로 바꾼다(표가 곧 규칙 · 원칙-1).
alter table v2.todo drop constraint if exists todo_kind_choice;

-- ⑤ 옛 앱에서 넘어온 학사일정 226줄을 옮긴다 ───────────────
--    짐작하지 않는다 — v2.todo.id 는 public.tasks.id 를 그대로 받았다(0110 ⑨). 그 줄만 정확히 고른다.
--    public 은 **읽기만** 한다(check-v2only 는 밖에 만들거나 고치는 것을 막는다).
do $$ begin
  if to_regclass('public.tasks') is not null then
    update v2.todo d set kind = 'school_event'
     where d.kind = 'note'
       and exists (select 1 from public.tasks t where t.id = d.id and t.kind = 'schedule');
  end if;
end $$;


-- ⑥ 값 목록을 **표 참조**로 ────────────────────────────────
--    씨앗 열 벌 + 🏛️ 학교 행사가 이미 들어갔고 ⑤ 가 옮긴 뒤라 지금 있는 줄은 전부 짝이 있다
--    (0164 가 꼴 안 맞는 kind 를 죄다 'note' 로 몰아 두었다).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'todo_kind_ref' and conrelid = 'v2.todo'::regclass) then
    alter table v2.todo add constraint todo_kind_ref
      foreign key (kind) references v2.todo_kind(kind) on update cascade not valid;
  end if;
end $$;
alter table v2.todo validate constraint todo_kind_ref;

commit;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0179_todo_kind.sql', 'a5679e921c1c2dd5')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
