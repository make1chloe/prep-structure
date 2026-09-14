-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0162~0162 · 1개 · 2026-09-14 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0162_exam_word.sql']);
  if 든것 = 1 then
    raise exception '0162~0162 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql']);
  if 앞것 <> 62 then
    raise exception '앞 파일 0100~0161 이 아직 다 안 들어갔습니다 (62개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0162_exam_word.sql
-- ─────────────────────────────────────────────────────────────
-- 0162 (어18) 「회차」는 수업 회차만 — 학교 시험 한 건은 「시험」(원장님 2026-09-14 「나는 회차를 수업 회차를 세는데만 써. 시험고르기로 바꾸든 용어를 바꿔」).
--   할 일 05 카드의 까닭 글 「시험 회차 %s %s에서 저절로」(0125 sync_material_todos)를 「시험 %s %s에서 저절로」로 — 함수 한 벌의 글자 하나와 이미 선 줄.
--   표·칸·함수 이름은 그대로(코드 이름은 원래 exam). 멱등 — 두 번 돌려도 같다.
create or replace function v2.sync_material_todos(p_material uuid) returns int
language plpgsql security definer set search_path = v2, public as $$
declare m record; e record; s text; due date; n int := 0; base date; t record; why_ text; days_ int; done_ boolean;
begin
  if not v2.is_staff() then raise exception '학원 사람만'; end if;
  select mt.*, ty.steps ty_steps, ty.name ty_name into m from v2.material mt join v2.material_type ty on ty.id = mt.type_id where mt.id = p_material;
  if not found then raise exception '자료가 없습니다'; end if;
  select ex.*, sc.name school_name into e from v2.exams ex left join v2.schools sc on sc.id = ex.school_id where ex.id = m.exam_id;
  base := coalesce(e.english_on, e.term_from);
  why_ := case when e.id is null then '자료에서 저절로' else format('시험 %s %s에서 저절로', coalesce(e.school_name, '전국'), e.name) end;   -- (어18) 「시험 회차」 → 「시험」
  foreach s in array m.ty_steps loop
    if s not in ('make', 'print', 'hand') then continue; end if;
    days_ := (select value from v2.rule where key = 'todo.' || s || '_days')::int;
    due := case when base is null then v2.today() + coalesce(days_, 0) else base - coalesce(days_, 0) end;
    done_ := (s = 'make' and (m.reuse_of is not null or m.state <> 'todo')) or (s = 'print' and m.state in ('printed', 'done')) or (s = 'hand' and m.state = 'done');
    select * into t from v2.todo where material_id = p_material and kind = s order by created_at limit 1;
    if found then
      if t.state in ('todo', 'doing') and t.due_on is distinct from due then update v2.todo set due_on = due where id = t.id; n := n + 1; end if;
    else
      insert into v2.todo (kind, title, exam_id, material_id, due_on, state, done_at, why)
      values (s, case when m.title = m.ty_name then m.ty_name else m.ty_name || ' · ' || m.title end, m.exam_id, p_material, due,   -- 제목이 종류 이름 그대로면 한 번만
              case when done_ then 'done' else 'todo' end, case when done_ then now() else null end,
              case when s = 'make' and m.reuse_of is not null then '♻️ 지난번 것 — 만들기가 끝난 채로 섰습니다(확정-㊵)' else why_ end);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
comment on function v2.sync_material_todos(uuid) is '자료 한 장의 할 일(만들기·인쇄·배부)을 세우거나 마감을 맞춘다 — 자료를 더할 때 · 영어 시험일이 바뀔 때(sync_exam_todos) 부른다. 지우지 않는다. (어18) 까닭 글은 「시험 …에서 저절로」';
grant execute on function v2.sync_material_todos(uuid) to authenticated, service_role;

-- 이미 선 줄의 까닭 글도 같은 말로(멱등 — 「시험 회차 」로 시작하는 줄만)
update v2.todo set why = '시험 ' || substr(why, length('시험 회차 ') + 1) where why like '시험 회차 %에서 저절로';

insert into v2.migration(file, sha) values ('0162_exam_word.sql', '9e8bc81df4d4d5fd')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
