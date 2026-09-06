-- 0128 · 자료함 20 · 영상 19 — 파일 한 줄 칸(한 마디 note) · 파기 목록에서 뺌(원장님 9/3 「그냥 둬. 지우지 마」 · 9/5 ㉒) · 규칙 넷 · 권한 · 판 둘(file_board · video_board) · 손 넷(file_sort · video_progress · video_mark · video_duration). 한 번 더 돌려도 같다.
-- ⚠️ 표는 0014(video · video_view) · 0015(file · file_bin · file_link) · 0075(video_assign) · 0076(video_seen) 그대로 — 새 표 없음(원칙-1).
-- ⚠️ 지우지 않는다 — 아이 화면의 붙임은 1달(규칙 file.child_days) 뒤 **안 보일 뿐**이고 원장님 자료함에는 그대로 있다(목업 20 「언제 지워지나」).
alter table v2.file add column if not exists note text;
comment on column v2.file.note is '올린 사람의 한 마디(「수행평가 안내문이에요」) — 원장님이 갈래를 고를 때 읽는다';
-- 파기 목록에서 뺀다 — 원장님 9/3 「그냥 둬. 지우지 마 수정하지 마」(목업 20 · 9/5 ㉒ 「파기 목록을 만들지 않습니다」). check-schema 가 file 을 예외로 안다
delete from v2.purge_map where tbl = 'file';
insert into v2.rule (key, value, note) values
  ('file.batch_max',  '30',   '자료함 — 한 번에 올리는 파일 수. 넘으면 나눠 올리라고 말한다(조용히 자르지 않는다, 목업 20)'),
  ('file.photo_px',   '1600', '자료함 — 사진은 올릴 때 긴 변을 이 px 로 줄인다(폰에서). pdf·문서는 안 줄인다(목업 20)'),
  ('file.child_days', '30',   '자료함 — 아이에게 보낸 붙임이 아이 화면에 보이는 날 수(원장님 9/2 「1달」). 지나면 안 보일 뿐 원장님 자료함엔 그대로'),
  ('file.max_mb',     '4',    '자료함 — 파일 하나의 상한(MB). 서버(Vercel) 한 요청이 4.5MB 라 그 아래 — 사진은 줄여서 늘 안이고 pdf·문서가 걸린다'),
  ('video.done_pct',  '95',   '영상 — 지나간 구간의 합이 이 % 이상이면 「다 봄」. 대략치라 100 으로 두지 않는다(목업 19 「정직하게」)')
on conflict (key) do nothing;
-- ══ 권한 — 규칙(staff_all 0016)은 있는데 권한이 없던 표(0070 의 함정). 아이의 시청 구간은 0017 이 이미 열었다
grant insert, update on v2.file_bin, v2.video, v2.video_assign to authenticated;
grant insert, update on v2.file, v2.file_bin, v2.file_link, v2.video, v2.video_assign, v2.video_view to service_role;

-- ══ 자료함 손 — 갈래 고르기(정의자 · 학원 사람만). 학교·학년은 아이에게서, 학기는 올린 날에서 저절로(목업 20 「학교·학년·학기는 아이에게서 저절로 붙습니다」). 「그 밖」은 학교와 상관없는 것 — 아이별 칸
create or replace function v2.term_of(p_on date) returns text
language sql immutable as $$
  select case when extract(month from p_on) between 3 and 8 then to_char(p_on, 'YY') || '-1'
              when extract(month from p_on) >= 9 then to_char(p_on, 'YY') || '-2'
              else to_char(p_on - interval '1 year', 'YY') || '-2' end
$$;
comment on function v2.term_of(date) is '학기 이름 「26-1」 — 3~8월은 1학기 · 9~2월은 2학기(1·2월은 지난해 2학기). 학사일정은 학기가 안 붙는다(kind 학사일정이면 term 비움)';
create or replace function v2.file_sort(p_file uuid, p_kind text) returns uuid
language plpgsql security definer set search_path = v2, public as $$
declare f record; b uuid; s uuid; g smallint; t text;
begin
  if not v2.is_staff() then raise exception '학원 사람만 갈래를 고릅니다'; end if;
  select fl.id, fl.student_id, fl.uploaded_at into f from v2.file fl where fl.id = p_file;
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
  return b;
end $$;
grant execute on function v2.file_sort(uuid, text) to authenticated, service_role;

-- ══ 자료함 판 한 벌(정의자 · 학원 사람만) — 받은 것(갈래 안 고른 것 = 방금 온 것 · 갈래별 묶음) · 보낸 것(붙인 자리 · 아이가 처리했나) · 아이 목록 · 붙일 숙제 줄(아이마다 마지막 판의 숙제) · 규칙. 세는 것은 화면이 센다(대전제-5)
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
    'inbox', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'orig_name', x.orig_name, 'mime', x.mime, 'bytes', x.bytes, 'note', x.note, 'uploaded_at', x.uploaded_at, 'shrunk', x.shrunk,
                 'by_name', x.by_name, 'by_role', x.by_role, 'student_id', x.student_id, 'student_name', x.student_name, 'student_grade', x.student_grade, 'school_name', x.school_name,
                 'term', v2.term_of((x.uploaded_at at time zone 'Asia/Seoul')::date)) order by x.uploaded_at desc), '[]'::jsonb)
                from fl x where not x.mine and not exists (select 1 from v2.file_link l where l.file_id = x.id and l.bin_id is not null)),
    'bins', (select coalesce(jsonb_agg(jsonb_build_object('id', fb.id, 'school_id', fb.school_id, 'school', sc.name, 'grade', fb.grade, 'term', fb.term, 'kind', fb.kind,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'orig_name', x.orig_name, 'mime', x.mime, 'bytes', x.bytes, 'note', x.note, 'uploaded_at', x.uploaded_at, 'by_name', x.by_name, 'by_role', x.by_role, 'student_id', x.student_id, 'student_name', x.student_name) order by x.uploaded_at desc), '[]'::jsonb)
                             from v2.file_link l join fl x on x.id = l.file_id where l.bin_id = fb.id)) order by sc.name nulls last, fb.grade, fb.term desc, fb.kind), '[]'::jsonb)
                from v2.file_bin fb left join v2.schools sc on sc.id = fb.school_id),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'orig_name', x.orig_name, 'mime', x.mime, 'bytes', x.bytes, 'note', x.note, 'uploaded_at', x.uploaded_at, 'by_name', x.by_name, 'student_id', x.student_id, 'student_name', x.student_name,
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

-- ══ 영상 — 지나간 구간의 합(아이마다 · 0076 video_seen 과 같은 셈, 여러 영상을 한 번에). 부르는 사람 자격(RLS: 아이는 제 것만)
create or replace function v2.video_progress(p_student uuid) returns table (video_id uuid, secs int, pct int, done_at timestamptz, last_pos int)
language sql stable as $$
  with m as (select vv.video_id, vv.done_at, vv.last_pos, range_agg(r) mr from v2.video_view vv, unnest(vv.spans) r where vv.student_id = p_student group by vv.video_id, vv.done_at, vv.last_pos),
  s as (select m.video_id, m.done_at, m.last_pos, coalesce((select sum(upper(x) - lower(x)) from unnest(m.mr) x), 0)::int t from m)
  select s.video_id, s.t, case when coalesce(v.seconds, 0) > 0 then least(100, round(s.t * 100.0 / v.seconds))::int end, s.done_at, s.last_pos
    from s join v2.video v on v.id = s.video_id
$$;
grant execute on function v2.video_progress(uuid) to authenticated, service_role;
-- 아이가 구간을 찍는다 — 지나간 구간만(끌어다 놓은 자리는 구간이 안 생긴다). 겹침 합치기는 Postgres(range_agg)가 한다(0076). 「다 봄」은 규칙 video.done_pct 를 넘는 순간 한 번
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
  return jsonb_build_object('secs', secs, 'pct', pct, 'done_at', d, 'last_pos', p_pos);
end $$;
grant execute on function v2.video_mark(uuid, int, int, int) to authenticated;
-- 길이를 모르는 영상은 아이 폰의 재생기가 처음 알려 준다(원장님이 안 적었을 때만). 배정된 아이만 · 비어 있을 때만
create or replace function v2.video_duration(p_video uuid, p_seconds int) returns boolean
language plpgsql security definer set search_path = v2, public as $$
begin
  if p_seconds is null or p_seconds <= 0 then return false; end if;
  if not (v2.is_staff() or exists (select 1 from v2.video_assign va where va.video_id = p_video and va.student_id in (select v2.my_students()))) then return false; end if;
  update v2.video set seconds = p_seconds where id = p_video and coalesce(seconds, 0) = 0;
  return found;
end $$;
grant execute on function v2.video_duration(uuid, int) to authenticated;

-- ══ 영상 판 한 벌(정의자 · 학원 사람만) — 영상(폴더 · 길이 · 상태) · 배정마다 아이 · 마감 · 지나간 %(video_progress) · 다 봄 · 아이 목록 · 규칙. 「다 봄 / 보다 맒 / 안 봄」은 화면이 센다
create or replace function v2.video_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select case when v2.is_staff() then jsonb_build_object(
    'today', p_on,
    'videos', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'url', v.url, 'folder', v.folder, 'seconds', v.seconds, 'state', v.state,
                  'assigns', (select coalesce(jsonb_agg(jsonb_build_object('id', va.id, 'student_id', va.student_id, 'student_name', st.name, 'due_on', va.due_on, 'state', va.state, 'created_at', va.created_at,
                                  'secs', vp.secs, 'pct', vp.pct, 'done_at', vp.done_at, 'last_pos', vp.last_pos) order by st.name), '[]'::jsonb)
                                from v2.video_assign va join v2.students st on st.id = va.student_id
                                left join lateral (select p.secs, p.pct, p.done_at, p.last_pos from v2.video_progress(va.student_id) p where p.video_id = v.id) vp on true
                               where va.video_id = v.id)) order by v.folder nulls last, v.title), '[]'::jsonb)
                 from v2.video v),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name) order by st.name), '[]'::jsonb)
                   from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'video.%')
  ) end
$$;
grant execute on function v2.video_board(date) to authenticated, service_role;
-- 파기 목록 — 영상 배정·시청은 아이 것(0075 의 ⚠️ 를 갚는다). 자료함은 위에서 뺐다
insert into v2.purge_map(tbl, col, how, note) values ('video_assign', 'student_id', 'row', '이 아이의 영상 배정'), ('video_view', 'student_id', 'row', '이 아이의 시청 구간') on conflict do nothing;

-- ══ 접근 규칙의 맞물림을 푼다 — 0016 의 own_file 은 file_link 를 보고 own_link 는 file 을 봐서, 아이가 「내 숙제에 붙은 파일」을 읽는 순간 서로를 불렀다
--    (실측 2026-09-06 e2e: 「infinite recursion detected in policy for relation "file"」 — 옛 앱은 이 길을 한 번도 안 열어 몰랐다, 인수인계 s20 「반쪽이 없다」).
--    판단은 그대로(내 것 · 내 숙제·공지에 붙은 것)이고 **정의자 함수**로 한 번만 본다 — v2.my_students() 와 같은 결(0003)
create or replace function v2.file_mine(p_file uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.file f where f.id = p_file and f.by_profile = auth.uid())
$$;
create or replace function v2.file_reachable(p_file uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.file_link l where l.file_id = p_file
                    and ((l.day_item_id is not null and v2.sheet_visible((select di.sheet_id from v2.day_item di where di.id = l.day_item_id)))
                         or l.notice_id is not null))
$$;
comment on function v2.file_reachable(uuid) is '이 파일이 내 숙제(보이는 판)·공지에 붙어 있나 — file 의 읽기 규칙이 쓴다. 정의자라 file_link 의 규칙을 다시 안 탄다(맞물림 없음)';
grant execute on function v2.file_mine(uuid), v2.file_reachable(uuid) to authenticated, service_role;
drop policy if exists own_file on v2.file;
create policy own_file on v2.file for select to authenticated using (by_profile = auth.uid() or v2.file_reachable(id));
drop policy if exists own_link on v2.file_link;
create policy own_link on v2.file_link for select to authenticated
  using (v2.file_mine(file_id) or notice_id is not null
      or (day_item_id is not null and v2.sheet_visible((select di.sheet_id from v2.day_item di where di.id = day_item_id))));
