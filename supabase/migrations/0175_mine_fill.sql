-- 0175 (어72) 아이가 제 **빈 칸**을 채운다 · 원장님 2026-09-17
--   「학생어플에서 학생이 직접 재원생정보의 비어있는 칸을 채울 수 있게 해줘 …
--    모두 내가 설정페이지에서 켰을때 그리고 칸이 비어있을때만.」
--   「아 그럼 반은 빼」 · 「알겠어 그러면학교도 빼」 → 채울 칸은 **여섯**이다:
--   학부모 폰 · 학생 폰 · 클래스카드 아이디 · 학년 · 생년월일 · 교재 진도 체크.
--   ⚠️ 교재 진도 체크는 **이미 있다**(students.progress_edit · 0008) — 새로 짓지 않는다(원칙-1).
--   ⚠️ 수강료 · 반 · 학교는 아이가 못 건드린다.
--   몇 번을 돌려도 같다.

-- ── ① 생년월일 — 표에 없던 칸이다(students 를 전수로 훑어 확인) ────────────────
alter table v2.students add column if not exists birth date;
comment on column v2.students.birth is
  '생년월일 — (어72) 아이가 제 앱에서 채운다(비어 있을 때만 · 원장님이 켠 칸만). 원장님은 학생 14 에서 언제든 고친다';
insert into v2.purge_map(tbl, col, how, note) values ('students', 'birth', 'null', '생년월일')
on conflict do nothing;

-- ── ② 원장님이 켜는 스위치 다섯 — **기본은 전부 꺼짐**(안 켜면 아이 화면에 카드가 아예 없다) ──
--    켜고 끄는 자리는 설정 화면이고, 값은 코드에 안 박는다(뼈대-5 · lib/rule.js 로 읽는다).
--    진도 체크는 여기 없다 — 이미 설정 › ✎ 진도 체크에서 아이마다 정하신다(students.progress_edit).
insert into v2.rule (key, value, note) values
  ('me.fill.parent_phone', 'off', '아이 앱 · 학부모 전화번호를 아이가 채울 수 있나(비어 있을 때만)'),
  ('me.fill.phone',        'off', '아이 앱 · 제 전화번호를 아이가 채울 수 있나(비어 있을 때만)'),
  ('me.fill.grade',        'off', '아이 앱 · 학년을 아이가 채울 수 있나(비어 있을 때만)'),
  ('me.fill.birth',        'off', '아이 앱 · 생년월일을 아이가 채울 수 있나(비어 있을 때만)'),
  ('me.fill.cc',           'off', '아이 앱 · 클래스카드 아이디를 아이가 채울 수 있나(비어 있을 때만 · 앱 아이디 chloe… 는 못 적는다)')
on conflict (key) do nothing;

-- ── ③ 아이가 제 줄의 **그 네 칸만** · **비어 있을 때만** 채운다 ──────────────────
--    RLS 는 칸을 못 가른다 — 정책(제 줄인가)과 트리거(어느 칸인가 · 비었나) 두 겹으로 막는다.
--    본보기는 0082 day_item · 0160 file_link·score 의 child guard 와 같은 꼴(표-9).
drop policy if exists own_student_fill on v2.students;
create policy own_student_fill on v2.students for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function v2.students_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $g$
declare 누구 uuid := auth.uid();
begin
  -- ⚠️⚠️ **로그인한 사람이 없으면 지나간다.** 검사·마이그레이션·크론은 jwt 없이 `postgres` 로 돈다
  --    (0082 day_item_child_guard 와 같은 꼴 — 거기서 안 열어 줬다가 마이그레이션이 통째로 죽은 적이 있다).
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;                            -- 학원 사람은 제 문지기가 따로 있다(판별은 is_staff 한 곳 · 원칙-1)
  if new.profile_id is distinct from old.profile_id then raise exception '계정은 못 바꾼다 (students)' using errcode = '42501'; end if;
  if new.profile_id is distinct from 누구 then raise exception '제 줄만 고친다 (students)' using errcode = '42501'; end if;
  -- 네 칸 말고 **하나라도** 달라지면 거절한다(칸 이름이 아니라 줄 전체를 견준다 — 새 칸이 생겨도 저절로 막힌다)
  if (to_jsonb(new) - 'phone' - 'parent_phone' - 'grade' - 'birth' - 'updated_at')
     is distinct from (to_jsonb(old) - 'phone' - 'parent_phone' - 'grade' - 'birth' - 'updated_at') then
    raise exception '아이가 고칠 수 있는 칸이 아니다 (students)' using errcode = '42501'; end if;
  -- **비어 있을 때만** — 이미 적힌 칸은 아이가 못 바꾸고 못 지운다(원장님이 학생 14 에서 고치신다)
  if old.phone        is not null and new.phone        is distinct from old.phone        then raise exception '이미 적힌 칸이다: 전화번호' using errcode = '42501'; end if;
  if old.parent_phone is not null and new.parent_phone is distinct from old.parent_phone then raise exception '이미 적힌 칸이다: 학부모 전화번호' using errcode = '42501'; end if;
  if old.grade        is not null and new.grade        is distinct from old.grade        then raise exception '이미 적힌 칸이다: 학년' using errcode = '42501'; end if;
  if old.birth        is not null and new.birth        is distinct from old.birth        then raise exception '이미 적힌 칸이다: 생년월일' using errcode = '42501'; end if;
  return new;
end $g$;
comment on function v2.students_child_guard() is
  '(어72) 아이는 제 줄의 전화번호·학부모 전화번호·학년·생년월일 넷만, 그것도 **비어 있을 때만** 채운다. 그 밖의 칸은 하나도 못 바꾼다';
drop trigger if exists students_child_guard on v2.students;
create trigger students_child_guard before update on v2.students for each row execute function v2.students_child_guard();

-- ── ④ 클래스카드 아이디 — 아이가 **제 줄을 보고**, 줄이 없을 때 **한 번 넣는다** ────────
--    「비어 있다」는 곧 「줄이 없다」다. 그래서 넣기(insert)만 열고 고치기는 안 연다 —
--    잘못 넣었으면 원장님이 학생 14 에서 다시 이으신다(덮어쓰기는 원장님 몫).
drop policy if exists own_cc_read on v2.cc_student;
create policy own_cc_read on v2.cc_student for select to authenticated
  using (student_id in (select id from v2.students where profile_id = auth.uid()));
drop policy if exists own_cc_fill on v2.cc_student;
create policy own_cc_fill on v2.cc_student for insert to authenticated
  with check (student_id in (select id from v2.students where profile_id = auth.uid()));

-- ── ⑤ 학생 14 판에 생년월일을 싣는다 — 아이가 채운 값을 원장님이 보셔야 한다(대전제-0) ──
--    0156 의 정의를 그대로 두고 'birth' 한 줄만 더해 다시 낸다(0155 를 베끼면 0156 의 달 출결을 잃는다).

create or replace function v2.student_board(p_student uuid, p_on date, p_month date default null) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with m as (select date_trunc('month', coalesce(p_month, p_on))::date f, (date_trunc('month', coalesce(p_month, p_on)) + interval '1 month - 1 day')::date t),   -- (뎌) 달 넘기기 — 안 주면 오늘의 달
  cur_class as (select cm.student_id, c.id class_id, c.kind, c.nickname, cs.weekdays, cs.start_time, cs.end_time
                  from v2.class_member cm join v2.classes c on c.id = cm.class_id
                  left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
                 where cm.from_date <= p_on and (cm.to_date is null or cm.to_date >= p_on)),
  cls as (select c.id, c.kind, c.nickname, c.state, cs.weekdays, cs.start_time, cs.end_time from v2.classes c
            left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
           where c.state = 'active'),
  pass as (select coalesce((select value::int from v2.rule where key = 'unit_test.pass_pct'), 80) pct)
  select jsonb_build_object(
    'today', p_on, 'month', to_char(coalesce(p_month, p_on), 'YYYY-MM'),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_id', st.school_id, 'level', sc.level, 'state', st.state, 'joined_on', st.joined_on, 'left_on', st.left_on,
                'class', (select jsonb_build_object('id', x.class_id, 'kind', x.kind, 'nickname', x.nickname, 'weekdays', to_jsonb(x.weekdays), 'start_time', x.start_time) from cur_class x where x.student_id = st.id limit 1),
                'books', (select coalesce(jsonb_agg(distinct b.name), '[]'::jsonb) from v2.student_book sb join v2.books b on b.id = sb.book_id where sb.student_id = st.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
                'last_consult', (select max(c.at) from v2.consult c where c.student_id = st.id),
                'login_id', pr.login_id, 'must_change_pw', pr.must_change_pw, 'issued_by_app', pr.issued_by_app,
                'parent_login', (select pp.login_id from v2.parent_student ps join v2.profiles pp on pp.id = ps.parent_profile_id where ps.student_id = st.id order by ps.created_at limit 1),
                'att', (select jsonb_build_object('came', count(*) filter (where ds.attend in ('present','online')), 'late', count(*) filter (where ds.attend = 'late'),
                          'absent', count(*) filter (where ds.attend = 'absent'), 'makeup', count(*) filter (where ds.attend = 'makeup'), 'days', count(*) filter (where ds.attend is not null))
                        from v2.day_sheet ds, m where ds.student_id = st.id and ds.date between m.f and m.t))   -- (뎌) 그 달 출결 요약 — 재원생 목록에서 한눈에
              order by case st.state when 'active' then 0 when 'paused' then 1 else 2 end, st.name), '[]'::jsonb)
              from v2.students st left join v2.schools sc on sc.id = st.school_id left join v2.profiles pr on pr.id = st.profile_id where st.state <> 'prospect'),
    'student', (select jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_id', st.school_id, 'level', sc.level, 'state', st.state, 'joined_on', st.joined_on, 'left_on', st.left_on,
                  'birth', st.birth, 'phone', st.phone, 'parent_phone', st.parent_phone, 'memo', st.memo, 'score_show', st.score_show, 'progress_edit', st.progress_edit, 'stop_weeks', st.stop_weeks, 'warn_report_at', st.warn_report_at, 'profile_id', st.profile_id, 'updated_at', st.updated_at,
                  'login_id', pr.login_id, 'must_change_pw', pr.must_change_pw, 'issued_by_app', pr.issued_by_app,
                  'class', (select jsonb_build_object('id', x.class_id, 'kind', x.kind, 'nickname', x.nickname, 'weekdays', to_jsonb(x.weekdays), 'start_time', x.start_time) from cur_class x where x.student_id = st.id limit 1),
                  'parents', (select coalesce(jsonb_agg(jsonb_build_object('profile_id', pp.id, 'login_id', pp.login_id, 'name', pp.name, 'rel', ps.rel, 'issued_by_app', pp.issued_by_app) order by ps.created_at), '[]'::jsonb) from v2.parent_student ps join v2.profiles pp on pp.id = ps.parent_profile_id where ps.student_id = st.id),
                  'siblings', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', o.id, 'name', o.name, 'grade', o.grade, 'school', osc.name, 'level', osc.level)), '[]'::jsonb)
                                 from v2.parent_student a join v2.parent_student b on b.parent_profile_id = a.parent_profile_id and b.student_id <> a.student_id
                                 join v2.students o on o.id = b.student_id left join v2.schools osc on osc.id = o.school_id where a.student_id = st.id))
                from v2.students st left join v2.schools sc on sc.id = st.school_id left join v2.profiles pr on pr.id = st.profile_id where st.id = p_student),
    'kpi', (select jsonb_build_object(
              'hw_done', (select count(*) from v2.day_item i join v2.day_sheet ds on ds.id = i.sheet_id, m where ds.student_id = p_student and ds.date between m.f and m.t and i.slot = 'check' and i.status = 'done'),
              'hw_total', (select count(*) from v2.day_item i join v2.day_sheet ds on ds.id = i.sheet_id, m where ds.student_id = p_student and ds.date between m.f and m.t and i.slot = 'check' and i.status in ('done', 'weak', 'missing')),
              'word_pass', (select count(*) from v2.quiz q where q.student_id = p_student and q.kind = 'word' and q.passed = true),
              'word_total', (select count(*) from v2.quiz q where q.student_id = p_student and q.kind = 'word' and q.passed is not null),
              'ut_pass', (select count(*) from v2.unit_test u, pass where u.student_id = p_student and u.state = 'scored' and u.correct * 100 >= coalesce(u.q_count, 0) * pass.pct),
              'ut_total', (select count(*) from v2.unit_test u where u.student_id = p_student and u.state = 'scored'),
              'att_present', (select count(*) from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t and ds.attend in ('present', 'late', 'early', 'online', 'makeup')),
              'att_absent', (select count(*) from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t and ds.attend = 'absent'),
              'att_total', (select count(*) from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t and ds.attend is not null and ds.attend <> 'off'),
              'late21', (select count(*) from v2.late_stay l join v2.day_sheet ds on ds.id = l.sheet_id where ds.student_id = p_student and l.until_at is not null and ds.date > p_on - 21 and ds.date <= p_on),
              'warn', (select to_jsonb(w) from v2.warn_states(array[p_student], p_on) w limit 1))
            where p_student is not null),
    'attend', (select coalesce(jsonb_agg(jsonb_build_object('date', ds.date, 'attend', ds.attend, 'closed', ds.closed_at is not null,
                  'arrived_at', (select a.at from v2.arrival a where a.student_id = p_student and a.date = ds.date and a.step = 2 limit 1),
                  'left_at', (select a.at from v2.arrival a where a.student_id = p_student and a.date = ds.date and a.step = 4 limit 1)) order by ds.date), '[]'::jsonb)   -- 하원은 arrival 걸음 4 한 곳(0083 — late_stay.left_at 은 걷어냈다)
                 from v2.day_sheet ds, m where ds.student_id = p_student and ds.date between m.f and m.t),
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'book_id', x.book_id, 'name', b.name, 'area', b.area::text, 'round', x.round, 'order_basis', coalesce(x.order_basis, b.order_basis), 'stop_mode', x.stop_mode, 'stop_from', x.stop_from, 'stop_until', x.stop_until, 'from_date', x.from_date,
                  'total', (select count(*) from v2.units u where u.book_id = x.book_id and u.state = 'active'),
                  'done', (select count(*) from v2.progress p join v2.units u on u.id = p.unit_id where p.student_id = p_student and p.round = x.round and u.book_id = x.book_id and u.state = 'active' and p.status in ('done', 'skip')),
                  'cursor', (select c.chapter from v2.cursor_of(p_student, x.book_id, p_on) c limit 1)) order by x.from_date desc, b.name), '[]'::jsonb)
                from (select distinct on (book_id) * from v2.student_book where student_id = p_student and from_date <= p_on and (to_date is null or to_date >= p_on) order by book_id, from_date desc) x join v2.books b on b.id = x.book_id),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'raw', s.raw, 'full_score', s.full_score, 'grade', s.grade, 'confirmed', s.confirmed, 'show_to', s.show_to, 'taken_on', s.taken_on, 'by_who', s.by_who,
                  'wrongs', (select coalesce(jsonb_agg(w.q_no order by w.q_no), '[]'::jsonb) from v2.score_wrong w where w.score_id = s.id),
                  'exam', jsonb_build_object('id', e.id, 'name', e.name, 'scope', e.scope, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to, 'cuts', to_jsonb(e.cuts), 'level', sc.level, 'school', sc.name,
                    'questions', (select coalesce(jsonb_agg(jsonb_build_object('q_no', q.q_no, 'kind', q.kind) order by q.q_no), '[]'::jsonb) from v2.exam_question q where q.exam_id = e.id)))
                order by coalesce(e.english_on, e.term_from) desc), '[]'::jsonb)
                 from v2.score s join v2.exams e on e.id = s.exam_id left join v2.schools sc on sc.id = e.school_id where s.student_id = p_student),
    'unit_tests', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'topic', g.name, 'correct', u.correct, 'q_count', u.q_count, 'taken_on', u.taken_on, 'state', u.state) order by coalesce(u.taken_on, u.assigned_on)), '[]'::jsonb)
                     from v2.unit_test u left join v2.grammar_topics g on g.id = u.topic_id where u.student_id = p_student),
    'history', jsonb_build_object(
      'books', (select coalesce(jsonb_agg(jsonb_build_object('from_date', x.from_date, 'to_date', x.to_date, 'round', x.round, 'name', b.name) order by x.from_date desc), '[]'::jsonb) from v2.student_book x join v2.books b on b.id = x.book_id where x.student_id = p_student),
      'classes', (select coalesce(jsonb_agg(jsonb_build_object('from_date', cm.from_date, 'to_date', cm.to_date, 'class', jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', to_jsonb(cs.weekdays), 'start_time', cs.start_time)) order by cm.from_date desc), '[]'::jsonb)
                    from v2.class_member cm join v2.classes c on c.id = cm.class_id
                    left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= cm.from_date and (s.to_date is null or s.to_date >= cm.from_date) order by s.from_date desc limit 1) cs on true
                   where cm.student_id = p_student),
      'consults', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'at', c.at, 'way', c.way, 'body', c.body,
                     'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime) order by f.orig_name), '[]'::jsonb) from v2.file_link l join v2.file f on f.id = l.file_id where l.consult_id = c.id)) order by c.at desc), '[]'::jsonb) from v2.consult c where c.student_id = p_student)),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'uploaded_at', f.uploaded_at, 'note', f.note, 'by_role', p.role,
                 'links', (select coalesce(jsonb_agg(jsonb_build_object('day_item_id', l.day_item_id, 'notice_id', l.notice_id, 'consult_id', l.consult_id)), '[]'::jsonb) from v2.file_link l where l.file_id = f.id and l.bin_id is null)) order by f.uploaded_at desc), '[]'::jsonb)
                from (select * from v2.file f where f.student_id = p_student and f.state <> 'purged' order by f.uploaded_at desc limit 20) f left join v2.profiles p on p.id = f.by_profile),   -- 이 아이의 자료(4단계-6 — 14 📎 줄)
    'videos', (select coalesce(jsonb_agg(jsonb_build_object('id', va.id, 'video_id', v.id, 'title', v.title, 'folder', v.folder, 'due_on', va.due_on, 'state', va.state, 'pct', vp.pct, 'done_at', vp.done_at) order by va.created_at desc), '[]'::jsonb)
                 from v2.video_assign va join v2.video v on v.id = va.video_id
                 left join lateral (select p.pct, p.done_at from v2.video_progress(p_student) p where p.video_id = v.id) vp on true
                where va.student_id = p_student and va.state = 'active'),   -- 이 아이의 영상(4단계-6 — 14 🎬 줄)
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname, 'weekdays', to_jsonb(c.weekdays), 'start_time', c.start_time) order by c.start_time, c.nickname), '[]'::jsonb) from cls c),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'access', (select coalesce(jsonb_agg(jsonb_build_object('role', a.role, 'key', a.key, 'allowed', a.allowed)), '[]'::jsonb) from v2.role_access a where a.key like 'ops.%'),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key in ('unit_test.pass_pct', 'late.repeat_days', 'late.repeat_count', 'warn.report_at')),
    'progress_pending', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', p.unit_id, 'round', p.round, 'status', p.status, 'marked_on', p.marked_on,
                           'book', b.name, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false)) order by p.marked_on desc nulls last), '[]'::jsonb)
                          from v2.progress p join v2.units u on u.id = p.unit_id join v2.books b on b.id = u.book_id
                         where p.student_id = p_student and p.last_by = 'student' and p.confirmed = false),   -- (허) 아이가 찍고 확인 안 한 줄 — 08 원장 쪽과 같은 셈
    'progress_flags', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'unit_id', f.unit_id, 'round', f.round, 'kind', f.kind, 'said', f.said,
                          'raised_at', f.raised_at, 'seen_at', f.seen_at, 'outcome', f.outcome, 'book', b.name, 'chapter', u.chapter, 'short', v2.unit_label(u.id, false),
                          'status', coalesce((select pr.status::text from v2.progress pr where pr.student_id = p_student and pr.unit_id = f.unit_id and pr.round = f.round), 'none')) order by f.raised_at desc), '[]'::jsonb)
                        from v2.progress_flag f join v2.units u on u.id = f.unit_id join v2.books b on b.id = u.book_id
                       where f.student_id = p_student and f.seen_at is null),   -- (허) 아직 안 본 ❗ 만
    'progress_edit', jsonb_build_object('academy_open', (select is_open from v2.progress_edit where scope = 'academy'),
                       'opened_on', (select opened_on from v2.progress_edit where scope = 'academy'),
                       'mode', (select st.progress_edit from v2.students st where st.id = p_student),
                       'can_edit', v2.can_edit_progress(p_student))
  ) where v2.is_staff()
$$;

notify pgrst, 'reload schema';
