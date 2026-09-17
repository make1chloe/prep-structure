-- 클로이영어 새 앱(v2) — 실 DB 에 돌릴 마이그레이션 (0172~0172 · 1개 · 2026-09-17 만듦)
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
  select count(*) into 든것 from v2.migration where file = any(array['0172_etc.sql']);
  if 든것 = 1 then
    raise exception '0172~0172 · 1개 은 이미 다 들어가 있습니다 — 더 돌릴 것이 없습니다. 이 창을 닫으셔도 됩니다.';
  end if;
  select count(*) into 앞것 from v2.migration where file = any(array['0100_new_app_skeleton.sql', '0101_today.sql', '0102_day_item_free.sql', '0103_routine_lay.sql', '0104_quiz_card.sql', '0105_tune.sql', '0106_warn.sql', '0107_progress_staff.sql', '0108_warn_per_student.sql', '0109_attend_plan.sql', '0110_import_makeup_key.sql', '0111_comment.sql', '0112_row_head.sql', '0113_late_rest.sql', '0114_dash.sql', '0115_me.sql', '0116_service_role.sql', '0117_material_child.sql', '0118_send.sql', '0119_routine.sql', '0120_schedule.sql', '0121_fee.sql', '0122_exam.sql', '0123_score.sql', '0124_books.sql', '0125_board.sql', '0126_grid.sql', '0127_student.sql', '0128_files_video.sql', '0129_files_video_more.sql', '0130_fixture_schedule_end.sql', '0131_do_it_all.sql', '0132_today_finish.sql', '0133_send_kinds.sql', '0134_monthly.sql', '0135_classes.sql', '0136_touchups.sql', '0137_routine_todo.sql', '0138_notice_pref.sql', '0139_month_confirm.sql', '0140_progress_signals.sql', '0141_stay_slot.sql', '0142_excel_undo.sql', '0143_quiz_pos.sql', '0144_book_mode.sql', '0145_material_submit.sql', '0146_quiz_skip_visible.sql', '0147_unit_label_mode.sql', '0148_grid_share.sql', '0149_unit_test_due.sql', '0150_mine_reflections.sql', '0151_scheduled_other.sql', '0152_exam_change.sql', '0153_dash_classes.sql', '0154_sms.sql', '0155_road_parts.sql', '0156_student_month.sql', '0157_sms_kinds.sql', '0158_cc_skip.sql', '0159_site_import.sql', '0160_child_guard.sql', '0161_stop_one_rule.sql', '0162_exam_word.sql', '0163_today_prep.sql', '0164_no_dash.sql', '0165_legacy_choice_rows.sql', '0166_attend_reason.sql', '0167_timer.sql', '0168_login_id_fifth.sql', '0169_stamp_by.sql', '0170_arrival_undo.sql', '0171_staff_login.sql']);
  if 앞것 <> 72 then
    raise exception '앞 파일 0100~0171 이 아직 다 안 들어갔습니다 (72개 중 %개) — 앞 것부터 차례로 돌려 주세요.', 앞것;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────
-- 1/1 · 0172_etc.sql
-- ─────────────────────────────────────────────────────────────
-- 0172 (어69) 화면 글의 「그 밖에 · 그 밖」 을 **「기타」 한 낱말**로 (원장님 2026-09-17 「기타는 그냥 통일하면되겠고」).
--   앞서 「그 밖에 라는 표현은 전부 안 쓸 건데 무엇으로 바꿀지는 모르겠어」 → 자리마다 뜻이 다르지만 **한 낱말로 통일**하기로 정하셨다.
--   DB 에 글자로 박힌 자리는 자료실 유형 하나뿐이다: v2.file_bin.kind 의 CHECK · file_sort · file_board 의 목록.
--   멱등 — 이미 '기타' 로 바뀐 뒤에 또 돌려도 같다(SETUP_ALL 을 세 번 돌리는 check-sql 이 잰다).

-- ① 쌓인 줄을 옮긴다 — 제약을 먼저 풀고, 같은 (학교·학년·학기) 에 '기타' 칸이 이미 있으면 파일을 그리로 옮겨 합친다(유일 제약 때문)
alter table v2.file_bin drop constraint if exists file_bin_kind_check;
do $$
declare r record; keep uuid;
begin
  for r in select * from v2.file_bin where kind = '그 밖' loop
    select fb.id into keep from v2.file_bin fb
      where fb.kind = '기타' and fb.school_id is not distinct from r.school_id
        and fb.grade is not distinct from r.grade and fb.term is not distinct from r.term;
    if keep is null then
      update v2.file_bin set kind = '기타' where id = r.id;
    else
      delete from v2.file_link l where l.bin_id = r.id and exists (
        select 1 from v2.file_link k where k.bin_id = keep and k.file_id = l.file_id
          and k.day_item_id is not distinct from l.day_item_id
          and k.notice_id is not distinct from l.notice_id
          and k.consult_id is not distinct from l.consult_id);
      update v2.file_link set bin_id = keep where bin_id = r.id;
      delete from v2.file_bin where id = r.id;
    end if;
  end loop;
end $$;
alter table v2.file_bin add constraint file_bin_kind_check
  check (kind in ('수행평가','시험 안내','수업자료','학사일정','가정통신문','기타'));

-- ② 이미 나간 자동 답 한 줄도 같이 — 「받았어요. 「그 밖」로 넣었어요」 는 앱이 자동 글로 읽는 꼴이라 그대로 고친다(0129 ②)
update v2.file set reply = replace(reply, '「그 밖」', '「기타」') where reply like '%「그 밖」%';

-- ③ 유형 고르기 — '그 밖' 을 '기타' 로(학교·학년·학기를 안 붙이고 아이별 칸으로 가는 그 자리)
create or replace function v2.file_sort(p_file uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = v2, public as $function$
declare f record; b uuid; s uuid; g smallint; t text;
begin
  if not v2.is_staff() then raise exception '학원 사람만 갈래를 고릅니다'; end if;
  select fl.id, fl.student_id, fl.uploaded_at, fl.reply into f from v2.file fl where fl.id = p_file;
  if f.id is null then raise exception '파일이 없습니다'; end if;
  if p_kind = '기타' then s := null; g := null; t := null;
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
grant execute on function v2.file_sort(uuid, text) to authenticated, service_role;

-- ④ 자료실 판이 주는 유형 목록도 같은 여섯(화면이 이 목록으로 단추를 그린다) — 0129 의 판을 글자 하나만 바꿔 다시 낸다
create or replace function v2.file_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with staff as (select id from v2.profiles where role in ('principal', 'instructor', 'assistant')),
  fl as (select f.*, (f.by_profile in (select id from staff)) mine, p.name by_name, p.role by_role, st.name student_name, st.grade student_grade, sc.name school_name
           from v2.file f left join v2.profiles p on p.id = f.by_profile left join v2.students st on st.id = f.student_id left join v2.schools sc on sc.id = st.school_id
          where f.state <> 'purged'),
  linked as (select l.*, di.sheet_id, ds.date sheet_date, ds.student_id sheet_student, coalesce(li.name, di.range_note, '(이름 없음)') item_name, st.name item_student
               from v2.file_link l left join v2.day_item di on di.id = l.day_item_id left join v2.day_sheet ds on ds.id = di.sheet_id left join v2.learn_items li on li.id = di.item_id left join v2.students st on st.id = ds.student_id),
  lastsheet as (select distinct on (ds.student_id) ds.student_id, ds.id, ds.date from v2.day_sheet ds where ds.date <= p_on order by ds.student_id, ds.date desc, ds.created_at desc)
  select case when v2.is_staff() then jsonb_build_object(
    'today', p_on,
    'inbox', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'orig_name', x.orig_name, 'mime', x.mime, 'bytes', x.bytes, 'note', x.note, 'reply', x.reply, 'replied_at', x.replied_at, 'uploaded_at', x.uploaded_at, 'shrunk', x.shrunk,
                 'by_name', x.by_name, 'by_role', x.by_role, 'student_id', x.student_id, 'student_name', x.student_name, 'student_grade', x.student_grade, 'school_name', x.school_name,
                 'term', v2.term_of((x.uploaded_at at time zone 'Asia/Seoul')::date)) order by x.uploaded_at desc), '[]'::jsonb)
                from fl x where not x.mine and not exists (select 1 from v2.file_link l where l.file_id = x.id and l.bin_id is not null)),
    'bins', (select coalesce(jsonb_agg(jsonb_build_object('id', fb.id, 'school_id', fb.school_id, 'school', sc.name, 'grade', fb.grade, 'term', fb.term, 'kind', fb.kind,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'orig_name', x.orig_name, 'mime', x.mime, 'bytes', x.bytes, 'note', x.note, 'reply', x.reply, 'replied_at', x.replied_at, 'uploaded_at', x.uploaded_at, 'by_name', x.by_name, 'by_role', x.by_role, 'student_id', x.student_id, 'student_name', x.student_name) order by x.uploaded_at desc), '[]'::jsonb)
                             from v2.file_link l join fl x on x.id = l.file_id where l.bin_id = fb.id)) order by sc.name nulls last, fb.grade, fb.term desc, fb.kind), '[]'::jsonb)
                from v2.file_bin fb left join v2.schools sc on sc.id = fb.school_id),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'orig_name', x.orig_name, 'mime', x.mime, 'bytes', x.bytes, 'note', x.note, 'reply', x.reply, 'replied_at', x.replied_at, 'uploaded_at', x.uploaded_at, 'by_name', x.by_name, 'student_id', x.student_id, 'student_name', x.student_name,
                 'links', (select coalesce(jsonb_agg(jsonb_build_object('day_item_id', l.day_item_id, 'notice_id', l.notice_id, 'consult_id', l.consult_id, 'item_name', l.item_name, 'sheet_date', l.sheet_date, 'student_id', l.sheet_student, 'student_name', l.item_student, 'seen_by_child', l.seen_by_child, 'seen_at', l.seen_at, 'created_at', l.created_at) order by l.created_at desc), '[]'::jsonb)
                             from linked l where l.file_id = x.id and l.bin_id is null)) order by x.uploaded_at desc), '[]'::jsonb)
                from fl x where x.mine),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name,
                   'sheet', (select jsonb_build_object('id', ls.id, 'date', ls.date, 'items', (select coalesce(jsonb_agg(jsonb_build_object('id', di.id, 'name', coalesce(li.name, di.range_note, '(이름 없음)'), 'slot', di.slot) order by di.sort), '[]'::jsonb)
                                                                                                   from v2.day_item di left join v2.learn_items li on li.id = di.item_id where di.sheet_id = ls.id and di.slot = 'home' and not di.off))
                               from lastsheet ls where ls.student_id = st.id)) order by st.name), '[]'::jsonb)
                   from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'kinds', (select jsonb_agg(k) from unnest(array['수행평가', '시험 안내', '수업자료', '학사일정', '가정통신문', '기타']) k),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'file.%')
  ) end
$$;
grant execute on function v2.file_board(date) to authenticated, service_role;

-- 표 모양을 바꿨으니 API 기억을 새로 읽는다(원장님 9/10 밤 · 칸을 더해도 화면이 그 칸을 못 쓰던 일)
notify pgrst, 'reload schema';

insert into v2.migration(file, sha) values ('0172_etc.sql', '0196913f3eecc5ca')
  on conflict (file) do update set sha = excluded.sha, applied_at = now();

commit;
