-- 0129 · 자료함 20 · 영상 19 고도화 ①②③(원장님 2026-09-06 「네 추천대로 이어서」 — ㉙) — ② 보낸 사진에 원장님 답 한 줄(file.reply · replied_at · 갈래를 고르면 저절로, 고쳐 쓰면 그대로) · ③ 시청 구간을 돌려준다(video_progress · video_mark 에 spans) · ① 사진 미리보기는 길 그대로(/api/files/id). 한 번 더 돌려도 같다.
alter table v2.file add column if not exists reply text;
alter table v2.file add column if not exists replied_at timestamptz;
comment on column v2.file.reply is '원장님 답 한 줄 — 보낸 아이·학부모의 📎 카드 「내가 보낸 것」에 뜬다. 갈래를 고르면 「받았어요 — 「수행평가」로 넣었어요」가 저절로(자동 글일 때만 갈래 따라 바뀐다) · 원장님이 고쳐 쓰면 그대로';
grant update on v2.file to authenticated;   -- 학원 사람만 지나간다(staff_all 0016) — 아이·학부모는 update 정책이 없어 막힌다(올린 사람도 제 줄을 못 고친다 · 답은 원장님 것)
create or replace function v2.file_reply_auto(p_kind text) returns text
language sql immutable as $$ select '받았어요 — 「' || p_kind || '」로 넣었어요' $$;
comment on function v2.file_reply_auto(text) is '갈래를 골랐을 때의 자동 답 한 줄 — 이 꼴이면 갈래를 옮길 때 따라 바뀐다(원장님이 고쳐 쓴 글은 안 건드린다)';
create or replace function v2.file_sort(p_file uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = v2, public as $$
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
  if f.reply is null or f.reply ~ '^받았어요 — 「.*」로 넣었어요$' then
    update v2.file set reply = v2.file_reply_auto(p_kind), replied_at = coalesce(replied_at, now()) where id = p_file;
  end if;
  return b;
end $$;
grant execute on function v2.file_sort(uuid, text) to authenticated, service_role;
-- ③ 지나간 구간을 돌려준다 — 막대를 그린다(목업 19 vbar). 돌려주는 꼴이 바뀌어 지우고 다시 만든다(같은 인자라 부르는 쪽은 그대로)
drop function if exists v2.video_progress(uuid);
create function v2.video_progress(p_student uuid) returns table (video_id uuid, secs int, pct int, done_at timestamptz, last_pos int, spans jsonb)
language sql stable as $$
  with m as (select vv.video_id, vv.done_at, vv.last_pos, range_agg(r) mr from v2.video_view vv, unnest(vv.spans) r where vv.student_id = p_student group by vv.video_id, vv.done_at, vv.last_pos),
  s as (select m.video_id, m.done_at, m.last_pos, coalesce((select sum(upper(x) - lower(x)) from unnest(m.mr) x), 0)::int t,
               coalesce((select jsonb_agg(jsonb_build_array(lower(x), upper(x)) order by lower(x)) from unnest(m.mr) x), '[]'::jsonb) sp from m)
  select s.video_id, s.t, case when coalesce(v.seconds, 0) > 0 then least(100, round(s.t * 100.0 / v.seconds))::int end, s.done_at, s.last_pos, s.sp
    from s join v2.video v on v.id = s.video_id
$$;
grant execute on function v2.video_progress(uuid) to authenticated, service_role;
create or replace function v2.video_mark(p_video uuid, p_from int, p_to int, p_pos int) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare me uuid; merged int4range[]; total int; secs int; pct int; cut int; d timestamptz;
begin
  select id into me from v2.students where id in (select v2.my_students()) and profile_id = auth.uid() limit 1;
  if me is null then raise exception '아이 계정만 구간을 찍습니다'; end if;
  if not exists (select 1 from v2.video_assign va where va.video_id = p_video and va.student_id = me and va.state = 'active') then raise exception '배정된 영상이 아닙니다'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_from < 0 or p_to - p_from > 120 then raise exception '구간이 이상합니다(%~%)', p_from, p_to; end if;   -- 한 번에 2분 넘는 구간은 끌어다 놓은 것이다
  insert into v2.video_view (video_id, student_id, spans, last_pos) values (p_video, me, array[int4range(p_from, p_to)], p_pos)
    on conflict (video_id, student_id) do update set spans = v2.video_view.spans || array[int4range(p_from, p_to)], last_pos = p_pos, updated_at = now();
  select array_agg(x) into merged from (select unnest(range_agg(r)) x from v2.video_view vv, unnest(vv.spans) r where vv.video_id = p_video and vv.student_id = me) q;
  update v2.video_view set spans = merged where video_id = p_video and student_id = me;
  select seconds into total from v2.video where id = p_video;
  select coalesce(sum(upper(x) - lower(x)), 0)::int into secs from unnest(merged) x;
  pct := case when coalesce(total, 0) > 0 then least(100, round(secs * 100.0 / total))::int end;
  cut := coalesce((select value::int from v2.rule where key = 'video.done_pct'), 95);
  select done_at into d from v2.video_view where video_id = p_video and student_id = me;
  if d is null and pct is not null and pct >= cut then update v2.video_view set done_at = now() where video_id = p_video and student_id = me returning done_at into d; end if;
  return jsonb_build_object('secs', secs, 'pct', pct, 'done_at', d, 'last_pos', p_pos,
    'spans', coalesce((select jsonb_agg(jsonb_build_array(lower(x), upper(x)) order by lower(x)) from unnest(merged) x), '[]'::jsonb));
end $$;
grant execute on function v2.video_mark(uuid, int, int, int) to authenticated;

-- ② 판에도 답을 싣는다 — 방금 온 것 · 묶음 · 보낸 것 줄이 답 칸을 그린다(0128 의 file_board 그대로 + reply·replied_at)
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
    'kinds', (select jsonb_agg(k) from unnest(array['수행평가', '시험 안내', '수업자료', '학사일정', '가정통신문', '그 밖']) k),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'file.%')
  ) end
$$;
grant execute on function v2.file_board(date) to authenticated, service_role;
