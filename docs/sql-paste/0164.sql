-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0164~0164 · 1개 · 2026-09-15 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0164_no_dash.sql']);
  if 든것 = 1 then
    raise exception '0164~0164 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql']);
  if 앞것 <> 64 then
    raise exception '앞 파일 0100~0163 이 아직 다 안 들어갔습니다 (64개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0164_no_dash.sql
-- ─────────────────────────────────────────────────────────────
-- 0164 (어22) 화면 글에 「—」를 안 쓴다(대전제-18 · 원장님 2026-09-15 「— 이 표시좀 쓰지마 쓸데가리없어」) — SQL 이 짓는 글도 같은 규칙.
--   살아 있는 함수 여덟(문지기 셋 · 자료함 답 한 줄 · 자료함 정렬 · 되풀이 · 자료 할 일 · 되돌리기)을 문자열만 바꿔 다시 낸다(create or replace · 멱등).
--   이미 적힌 줄(할 일 제목·까닭 · 자료함 답)은 「 — 」→「 · 」 로 고친다 — 옛 답 한 줄은 앱이 둘 다 자동 글로 읽는다(lib/files-plan isAutoReply · file_sort).
--   개발 표기 「(확정-㊵)」도 화면 글에서 뺀다.

-- day_item_child_guard
CREATE OR REPLACE FUNCTION v2.day_item_child_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
declare 누구 uuid := auth.uid();
begin
  -- 로그인한 사람이 없으면 지나간다 — 검사·마이그레이션·크론은 jwt 없이 postgres 로 돈다(0084)
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;

  -- 남의 판은 못 건드린다 — 학부모도 여기서 걸린다(0084 ㉑ · 원장님 「절대안돼」)
  if not v2.sheet_mine(new.sheet_id) then
    raise exception '내 판이 아니면 못 건드린다 (day_item) · 학부모는 「다 했어요」를 못 누른다' using errcode = '42501';
  end if;

  -- 아이는 said_done_at 하나만 바꿀 수 있다(표-9). updated_at 은 touch 트리거가 미는 값이라 뺀다
  if (to_jsonb(new) - 'said_done_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'said_done_at' - 'updated_at') then
    raise exception '아이는 「다 했어요」 말고는 못 바꾼다 (day_item)' using errcode = '42501';
  end if;

  -- 무르기(said_done_at → null)는 **된다** — 원장님 답 ⑧. 시각은 서버가 정한다(표-10)
  if new.said_done_at is not null and old.said_done_at is null then
    new.said_done_at := now();
  elsif new.said_done_at is not null and old.said_done_at is not null then
    new.said_done_at := old.said_done_at;      -- 이미 누른 것은 시각이 안 바뀐다
  end if;
  return new;
end $function$;

-- file_link_child_guard
CREATE OR REPLACE FUNCTION v2.file_link_child_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
begin
  if auth.uid() is null then return new; end if;
  if v2.is_staff() then return new; end if;
  if (to_jsonb(new) - 'seen_by_child' - 'seen_at')
     is distinct from (to_jsonb(old) - 'seen_by_child' - 'seen_at') then
    raise exception '아이는 「봤음/안 보기」 표시만 할 수 있다 (file_link) · 어느 숙제에 붙은 파일인지는 못 바꾼다' using errcode = '42501';
  end if;
  return new;
end $function$;

-- score_child_guard
CREATE OR REPLACE FUNCTION v2.score_child_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
begin
  if auth.uid() is null then return new; end if;          -- 서버 자신(크론·마이그레이션)은 지나간다
  if v2.is_staff() then return new; end if;               -- 학원 사람은 그대로
  if (to_jsonb(new) - 'raw' - 'full_score' - 'note' - 'updated_at')
     is distinct from (to_jsonb(old) - 'raw' - 'full_score' - 'note' - 'updated_at') then
    raise exception '아이는 제 점수(원점수·만점·메모)만 고칠 수 있다 (score) · 누구 것인지·어느 시험인지는 못 바꾼다' using errcode = '42501';
  end if;
  return new;
end $function$;

-- file_reply_auto
CREATE OR REPLACE FUNCTION v2.file_reply_auto(p_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select '받았어요. 「' || p_kind || '」로 넣었어요' $function$;

-- file_sort
CREATE OR REPLACE FUNCTION v2.file_sort(p_file uuid, p_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
declare f record; b uuid; s uuid; g smallint; t text;
begin
  if not v2.is_staff() then raise exception '학원 사람만 갈래를 고릅니다'; end if;
  select fl.id, fl.student_id, fl.uploaded_at, fl.reply into f from v2.file fl where fl.id = p_file;
  if f.id is null then raise exception '파일이 없습니다'; end if;
  if p_kind = '그 밖' then s := null; g := null; t := null;
  else
    select st.school_id, st.grade into s, g from v2.students st where st.id = f.student_id;
    t := case when p_kind = '학사일정' then null else v2.term_of((f.uploaded_at at time zone 'Asia/Seoul')::date) end;
  end if;
  select id into b from v2.file_bin fb where fb.school_id is not distinct from s and fb.grade is not distinct from g and fb.term is not distinct from t and fb.kind = p_kind;
  if b is null then insert into v2.file_bin (school_id, grade, term, kind) values (s, g, t, p_kind) returning id into b; end if;
  delete from v2.file_link where file_id = p_file and bin_id is not null and bin_id <> b;   -- 갈래를 바꾸면 옮긴다(파일은 그대로)
  insert into v2.file_link (file_id, bin_id) values (p_file, b) on conflict do nothing;
  -- 답 한 줄 — 비어 있거나 자동 글이면 이 갈래로. 원장님이 고쳐 쓴 글은 그대로(0129 ②)
  if f.reply is null or f.reply ~ '^받았어요[. —]+「.*」로 넣었어요$' then
    update v2.file set reply = v2.file_reply_auto(p_kind), replied_at = coalesce(replied_at, now()) where id = p_file;
  end if;
  return b;
end $function$;

-- run_repeats
CREATE OR REPLACE FUNCTION v2.run_repeats(p_on date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
declare r record; s record; n int := 0; d int; lead_ int; due date; lastday int; wd int; days_ int; left_ int; cnt int;
begin
  if not (v2.is_staff() or auth.uid() is null) then raise exception '학원 사람만'; end if;
  for r in select * from v2.auto_rule where kind = 'repeat' and active loop
    lead_ := coalesce((r.threshold->>'lead')::int, (select value from v2.rule where key = 'todo.repeat_lead')::int, 0);
    if r.threshold ? 'event' then
      if r.threshold->>'event' = 'new_student' then                                                -- 들어온 지 N일 — 아이마다 한 번(열쇠: 규칙 · 아이 · 들어온 날)
        days_ := coalesce((r.threshold->>'days')::int, 7);
        for s in select st.id, st.name, st.joined_on from v2.students st
                  where st.state = 'active' and st.joined_on is not null and st.joined_on <= p_on and st.joined_on >= p_on - 60 loop
          due := s.joined_on + days_;
          if due - lead_ > p_on then continue; end if;
          if exists (select 1 from v2.auto_key k where k.rule_id = r.id and k.student_id = s.id and k.base_date = s.joined_on) then continue; end if;
          insert into v2.auto_key (rule_id, student_id, base_date) values (r.id, s.id, s.joined_on);
          insert into v2.todo (kind, title, due_on, rule_id, student_id, why)
          values ('repeat', format('%s · %s', s.name, r.name), due, r.id, s.id, format('들어온 지 %s일(%s 등록) · 저절로', days_, to_char(s.joined_on, 'MM/DD')));
          n := n + 1;
        end loop;
      elsif r.threshold->>'event' = 'book_ending' then                                             -- 남은 소단원 N개 이하 — 아이·교재·회독마다 한 번
        left_ := coalesce((r.threshold->>'left')::int, 5);
        for s in select sb.student_id, sb.book_id, sb.round, st.name, b.name as book
                   from v2.student_book sb join v2.students st on st.id = sb.student_id join v2.books b on b.id = sb.book_id
                  where st.state = 'active' and sb.stop_mode = 'running' and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on) loop
          select count(*) into cnt from v2.todo_units(s.student_id, s.book_id, p_on);
          if cnt > left_ then continue; end if;
          if exists (select 1 from v2.auto_key k where k.rule_id = r.id and k.student_id = s.student_id and k.book_id = s.book_id and k.round = s.round) then continue; end if;
          insert into v2.auto_key (rule_id, student_id, book_id, round) values (r.id, s.student_id, s.book_id, s.round);
          insert into v2.todo (kind, title, due_on, rule_id, student_id, why)
          values ('repeat', format('%s · %s · %s', s.name, s.book, r.name), p_on, r.id, s.student_id, format('남은 소단원 %s개 · 저절로', cnt));
          n := n + 1;
        end loop;
      end if;
      continue;
    end if;
    if r.threshold ? 'day' then
      d := (r.threshold->>'day')::int;
      lastday := extract(day from (date_trunc('month', p_on) + interval '1 month - 1 day'))::int;
      due := (date_trunc('month', p_on) + (least(d, lastday) - 1) * interval '1 day')::date;       -- 31일로 적어도 2월엔 28일(옛 앱 clampDay)
      if due < p_on then
        due := (date_trunc('month', p_on) + interval '1 month')::date;
        lastday := extract(day from (date_trunc('month', due) + interval '1 month - 1 day'))::int;
        due := (due + (least(d, lastday) - 1) * interval '1 day')::date;
      end if;
    elsif r.threshold ? 'weekday' then
      wd := (r.threshold->>'weekday')::int;
      due := p_on + (((wd - extract(dow from p_on)::int) + 7) % 7);
    else continue;
    end if;
    if due - lead_ > p_on then continue; end if;                                                  -- 아직 띄울 때가 아니다
    if exists (select 1 from v2.auto_key k where k.rule_id = r.id and k.base_date = due) then continue; end if;
    insert into v2.auto_key (rule_id, base_date) values (r.id, due);
    insert into v2.todo (kind, title, due_on, rule_id, why)
    values ('repeat', r.name, due, r.id,
            case when r.threshold ? 'day' then format('매달 %s일 · 저절로', d)
                 else format('매주 %s요일 · 저절로', (array['일','월','화','수','목','금','토'])[wd + 1]) end);
    n := n + 1;
  end loop;
  insert into v2.day_ran (kind, ran_on) values ('repeat', p_on) on conflict do nothing;
  return n;
end $function$;

-- sync_material_todos
CREATE OR REPLACE FUNCTION v2.sync_material_todos(p_material uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
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
              case when s = 'make' and m.reuse_of is not null then '♻️ 지난번 것 · 만들기가 끝난 채로 섰습니다' else why_ end);
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$;

-- undo_excel_run
CREATE OR REPLACE FUNCTION v2.undo_excel_run(p_run bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
declare run v2.excel_run; r record; later bigint; k int; live uuid; u v2.units; b v2.books;
        restored int := 0; removed int := 0; hidden int := 0; revived int := 0;
begin
  if not v2.is_staff() then raise exception '학원 사람만 되돌립니다'; end if;
  select * into run from v2.excel_run x where x.id = p_run for update;
  if run.id is null then raise exception '묶음이 없습니다: #%', p_run; end if;
  if run.undone_at is not null then raise exception '#% 은 이미 되돌린 묶음입니다', p_run; end if;
  if run.tbl not in ('units', 'books') then raise exception '이 묶음(%)은 여기서 못 되돌립니다', run.tbl; end if;
  select min(x.id) into later from v2.excel_run x where x.tbl = run.tbl and x.id > p_run and x.undone_at is null;
  if later is not null then raise exception '뒤에 올린 묶음 #% 을 먼저 되돌리세요', later; end if;
  if exists (select 1 from v2.excel_row x where x.run_id = p_run and x.op in ('update', 'delete') and x.before is null) then
    raise exception '되돌리기 자료(바꾸기 전 값)가 비워져 있습니다. 90일이 지난 묶음은 못 되돌립니다';
  end if;
  for r in select * from v2.excel_row x where x.run_id = p_run order by x.id desc loop
    if r.tbl = 'units' then
      if r.op = 'update' then
        u := jsonb_populate_record(null::v2.units, r.before);
        update v2.units t set chapter = u.chapter, mid = u.mid, sub = u.sub, activity = u.activity, is_workbook = u.is_workbook, sort = u.sort,
                              page_start = u.page_start, page_end = u.page_end, q_count = u.q_count, q_range = u.q_range, gist = u.gist, state = u.state, import_batch = u.import_batch
         where t.id = r.row_id::uuid;
        get diagnostics k = row_count; restored := restored + k;
      elsif r.op = 'insert' then
        begin
          delete from v2.units t where t.id = r.row_id::uuid;
          get diagnostics k = row_count; removed := removed + k;
        exception when foreign_key_violation then
          update v2.units t set state = 'hidden' where t.id = r.row_id::uuid; hidden := hidden + 1;
        end;
      elsif r.op = 'delete' then
        u := jsonb_populate_record(null::v2.units, r.before);
        select t.id into live from v2.units t where t.book_id = u.book_id and t.chapter = u.chapter and t.mid is not distinct from u.mid and t.sub is not distinct from u.sub and t.activity = u.activity limit 1;
        if live is not null then
          update v2.units t set is_workbook = u.is_workbook, sort = u.sort, page_start = u.page_start, page_end = u.page_end, q_count = u.q_count, q_range = u.q_range, gist = u.gist, state = u.state, import_batch = u.import_batch
           where t.id = live;
        else
          insert into v2.units select * from jsonb_populate_record(null::v2.units, r.before);
        end if;
        revived := revived + 1;
      end if;
    elsif r.tbl = 'books' then
      if r.op = 'update' then
        b := jsonb_populate_record(null::v2.books, r.before);
        update v2.books t set code = b.code, name = b.name, area = b.area, publisher = b.publisher, pub_year = b.pub_year, level = b.level, price = b.price, buy_url = b.buy_url
         where t.id = r.row_id::uuid;
        get diagnostics k = row_count; restored := restored + k;
      elsif r.op = 'insert' then
        begin
          delete from v2.books t where t.id = r.row_id::uuid;
          get diagnostics k = row_count; removed := removed + k;
        exception when foreign_key_violation then
          update v2.books t set state = 'stopped' where t.id = r.row_id::uuid; hidden := hidden + 1;
        end;
      end if;
    end if;
  end loop;
  update v2.excel_run x set undone_at = now() where x.id = p_run;
  return jsonb_build_object('run', p_run, 'tbl', run.tbl, 'restored', restored, 'removed', removed, 'hidden', hidden, 'revived', revived);
end $function$;

-- 옛 앱에서 받아온 할 일(0042 · 갈래 schedule·todo·general 따위)은 0131 의 갈래 제약(todo_kind_choice · not valid)에 걸려
-- 한 줄도 못 고친다(2026-09-15 실 DB: 「광복절 대체공휴일 · 정상 수업」에서 23514 · 이 파일이 통째로 되돌아갔다).
-- 제약에 안 맞는 갈래는 📋 메모(note)로 옮기고 제약을 검증해 둔다(숨은 옛 줄이 더는 없다). 허용 목록은 제약 정의에서 읽는다(두 벌로 안 적는다).
do $$ declare 조건 text; begin
  select pg_get_constraintdef(oid) into 조건 from pg_constraint where conname = 'todo_kind_choice' and conrelid = 'v2.todo'::regclass;
  if 조건 is null then return; end if;
  조건 := regexp_replace(regexp_replace(조건, '^CHECK \(', ''), '\)( NOT VALID)?$', '');
  execute format('update v2.todo set kind = %L where not (%s)', 'note', 조건);
end $$;
alter table v2.todo validate constraint todo_kind_choice;

-- 이미 적힌 줄 — 할 일 제목·까닭 · 자료함 답 한 줄(멱등)
update v2.todo set title = replace(title, ' — ', ' · '), why = replace(why, ' — ', ' · ') where title like '% — %' or why like '% — %';
update v2.todo set why = replace(why, '(확정-㊵)', '') where why like '%(확정-㊵)%';
update v2.file set reply = regexp_replace(reply, '^받았어요 — 「', '받았어요. 「') where reply like '받았어요 — 「%';
update v2.learn_items set method = replace(method, ' — ', ' · ') where method like '% — %';   -- 루틴 11 의 학습 항목 설명(0035 씨앗)
update v2.placeholder set note = replace(note, ' — ', ' · '), example = replace(example, ' — ', ' · ') where note like '% — %' or example like '% — %';   -- 발송 10 치환 낱말 표의 설명·보기(0131·0154 씨앗)

insert into v2.migration(file, sha) values ('0164_no_dash.sql', 'c79ebe73c466b183')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
