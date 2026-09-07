-- 0138 4단계-6(9/7) — 📢 공지 화면 · 공지·상담에 붙이기 · 학생 14 의 영상·자료 줄 · 카드 순서(screen_pref). 표는 새로 없다(notice·notice_read 0012 · file_link.notice_id·consult_id 0015 · screen_pref 0031) — 멱등
-- ① 공지 — 학원 사람이 쓴다 · 읽기는 보낸 것만, 역할·반·학교로 거른다(0016 은 역할만 봤다)
grant insert, update on v2.notice to authenticated;
drop policy if exists read_notice on v2.notice;
create policy read_notice on v2.notice for select to authenticated using (
  v2.is_staff() or (sent_at is not null and (
    (to_role in ('both', 'student') and exists (select 1 from v2.students s where s.profile_id = auth.uid() and s.state = 'active'
        and (notice.school_id is null or s.school_id = notice.school_id)
        and (notice.class_id is null or exists (select 1 from v2.class_member m where m.class_id = notice.class_id and m.student_id = s.id and m.from_date <= v2.today() and (m.to_date is null or m.to_date >= v2.today())))))
    or (to_role in ('both', 'parent') and exists (select 1 from v2.parent_student ps join v2.students s on s.id = ps.student_id where ps.parent_profile_id = auth.uid() and s.state = 'active'
        and (notice.school_id is null or s.school_id = notice.school_id)
        and (notice.class_id is null or exists (select 1 from v2.class_member m where m.class_id = notice.class_id and m.student_id = s.id and m.from_date <= v2.today() and (m.to_date is null or m.to_date >= v2.today()))))))));
drop policy if exists staff_write_notice on v2.notice;
create policy staff_write_notice on v2.notice for insert to authenticated with check (v2.is_staff());
drop policy if exists staff_update_notice on v2.notice;
create policy staff_update_notice on v2.notice for update to authenticated using (v2.is_staff()) with check (v2.is_staff());
-- ② 읽음 — 서버(정의자 함수)가 찍는다. 아이·학부모는 표에 직접 못 넣는다(0017) · 보낸 공지만 · 두 번째부터는 last_at·open_count
create or replace function v2.mark_notice_read(p_ids uuid[]) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int;
begin
  if auth.uid() is null then return 0; end if;
  insert into v2.notice_read (notice_id, profile_id)
  select nt.id, auth.uid() from unnest(p_ids) x(id) join v2.notice nt on nt.id = x.id and nt.sent_at is not null
  on conflict (notice_id, profile_id) do update set last_at = now(), open_count = v2.notice_read.open_count + 1;
  get diagnostics n = row_count; return n;
end $$;
grant execute on function v2.mark_notice_read(uuid[]) to authenticated, service_role;
-- ③ 공지 판(원장) — 공지마다 받는 쪽·반·학교·📎·대상 수·읽은 수 · 반·학교 고르개 · 붙일 자료(학원 사람이 올린 것)
create or replace function v2.notice_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select case when v2.is_staff() then jsonb_build_object(
    'today', p_on,
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'to_role', n.to_role, 'ring', n.ring, 'place', n.place,
                   'class_id', n.class_id, 'class', c.nickname, 'school_id', n.school_id, 'school', sc.name, 'publish_at', n.publish_at, 'sent_at', n.sent_at, 'created_at', n.created_at,
                   'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime) order by f.orig_name), '[]'::jsonb) from v2.file_link l join v2.file f on f.id = l.file_id where l.notice_id = n.id),
                   'targets', (select count(*) from v2.students st where st.state = 'active' and (n.school_id is null or st.school_id = n.school_id)
                                 and (n.class_id is null or exists (select 1 from v2.class_member m where m.class_id = n.class_id and m.student_id = st.id and m.from_date <= p_on and (m.to_date is null or m.to_date >= p_on)))),
                   'reads', (select count(*) from v2.notice_read r where r.notice_id = n.id)) order by n.created_at desc), '[]'::jsonb)
                 from v2.notice n left join v2.classes c on c.id = n.class_id left join v2.schools sc on sc.id = n.school_id),
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nickname', c.nickname, 'kind', c.kind) order by c.nickname), '[]'::jsonb) from v2.classes c where c.state = 'active'),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'uploaded_at', f.uploaded_at) order by f.uploaded_at desc), '[]'::jsonb)
                from (select * from v2.file f where f.state <> 'purged' and f.by_profile in (select id from v2.profiles where role in ('principal', 'instructor', 'assistant')) order by f.uploaded_at desc limit 40) f)
  ) end
$$;
grant execute on function v2.notice_board(date) to authenticated, service_role;
-- ④ 아이·학부모 판 다시 — 'board'(내게 온 공지 · 📎 · 읽은 때) · 'prefs'(카드 순서)
create or replace function v2.mine_board(p_student uuid, p_lo date) returns jsonb
language sql stable security invoker set search_path = v2, public as $$
  select jsonb_build_object(
    'links', (select coalesce(jsonb_agg(jsonb_build_object(
                 'file_id', fl.file_id, 'day_item_id', fl.day_item_id, 'seen_by_child', fl.seen_by_child, 'seen_at', fl.seen_at, 'created_at', fl.created_at,
                 'file', case when f.id is null then null else jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'note', f.note) end,
                 'day_item', jsonb_build_object('id', di.id, 'slot', di.slot, 'range_note', di.range_note, 'item_id', di.item_id,
                               'learn_items', case when li.id is null then null else jsonb_build_object('name', li.name) end,
                               'day_sheet', jsonb_build_object('student_id', ds.student_id, 'date', ds.date))
               ) order by fl.created_at desc), '[]'::jsonb)
               from v2.file_link fl
               join v2.day_item di on di.id = fl.day_item_id
               join v2.day_sheet ds on ds.id = di.sheet_id
               left join v2.file f on f.id = fl.file_id
               left join v2.learn_items li on li.id = di.item_id
               where ds.student_id = p_student and fl.created_at >= (p_lo::timestamp at time zone 'UTC')),
    'sent', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes, 'note', f.note, 'uploaded_at', f.uploaded_at,
                                                          'reply', f.reply, 'replied_at', f.replied_at, 'student_id', f.student_id,
                                                          'students', case when st.id is null then null else jsonb_build_object('name', st.name) end) order by f.uploaded_at desc), '[]'::jsonb)
             from (select * from v2.file where by_profile = auth.uid() and uploaded_at >= (p_lo::timestamp at time zone 'UTC') order by uploaded_at desc limit 20) f
             left join v2.students st on st.id = f.student_id),
    'assigns', (select coalesce(jsonb_agg(jsonb_build_object('id', va.id, 'video_id', va.video_id, 'due_on', va.due_on, 'state', va.state, 'created_at', va.created_at,
                                                             'video', jsonb_build_object('id', v.id, 'title', v.title, 'url', v.url, 'folder', v.folder, 'seconds', v.seconds, 'state', v.state))), '[]'::jsonb)
                from v2.video_assign va join v2.video v on v.id = va.video_id where va.student_id = p_student and va.state = 'active'),
    'fee', (select jsonb_build_object('ym', p.ym, 'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method)
              from v2.payment p where p.student_id = p_student and p.ym = to_char(v2.today(), 'YYYY-MM') limit 1),   -- 이 달 수납 줄 — 학부모만 보인다(own_payment) · 아이는 null
    'notices', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'title', l.title, 'url', l.url, 'created_at', l.created_at, 'sent_at', l.sent_at, 'opened_at', l.opened_at, 'sink', l.sink, 'failed_at', l.failed_at) order by l.created_at desc), '[]'::jsonb)
                  from (select * from v2.notify_log where profile_id = auth.uid() and student_id = p_student and created_at >= (p_lo::timestamp at time zone 'UTC') order by created_at desc limit 30) l),   -- 내게 온 자취(own_log)
    'report', (select jsonb_build_object('ym', r.ym, 'body', r.body, 'frozen', r.frozen, 'sent_at', r.sent_at) from v2.monthly_report r where r.student_id = p_student and r.sent_at is not null order by r.ym desc limit 1),   -- 📊 마지막으로 보낸 월간 리포트(own_mr)
    'board', (select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'to_role', n.to_role, 'sent_at', n.sent_at, 'class', c.nickname, 'school', sc.name, 'read_at', r.first_at,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'orig_name', f.orig_name, 'mime', f.mime) order by f.orig_name), '[]'::jsonb) from v2.file_link l join v2.file f on f.id = l.file_id where l.notice_id = n.id)) order by n.sent_at desc), '[]'::jsonb)
                from v2.notice n left join v2.classes c on c.id = n.class_id left join v2.schools sc on sc.id = n.school_id left join v2.notice_read r on r.notice_id = n.id and r.profile_id = auth.uid()
               where n.sent_at is not null and n.sent_at >= (p_lo::timestamp at time zone 'UTC')
                 and (n.class_id is null or exists (select 1 from v2.class_member m where m.class_id = n.class_id and m.student_id = p_student and m.from_date <= v2.today() and (m.to_date is null or m.to_date >= v2.today())))
                 and (n.school_id is null or exists (select 1 from v2.students s where s.id = p_student and s.school_id = n.school_id))),   -- 📢 이 아이(집)에게 온 공지(4단계-6 · 읽기 규칙 read_notice 가 역할·반·학교를 본다)
    'prefs', (select coalesce(jsonb_object_agg(sp.screen, sp.layout), '{}'::jsonb) from v2.screen_pref sp where sp.profile_id = auth.uid()),   -- 카드 순서(확정-⑮ · 4단계-6 · own_sp)
    'progress', (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) from v2.video_progress(p_student) p)
  );
$$;

-- ⑤ 학생 판 다시 — 상담에 붙은 📎 · 이 아이의 자료 20 · 영상 배정(본 %)
create or replace function v2.student_board(p_student uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with m as (select date_trunc('month', p_on)::date f, (date_trunc('month', p_on) + interval '1 month - 1 day')::date t),
  cur_class as (select cm.student_id, c.id class_id, c.kind, c.nickname, cs.weekdays, cs.start_time, cs.end_time
                  from v2.class_member cm join v2.classes c on c.id = cm.class_id
                  left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
                 where cm.from_date <= p_on and (cm.to_date is null or cm.to_date >= p_on)),
  cls as (select c.id, c.kind, c.nickname, c.state, cs.weekdays, cs.start_time, cs.end_time from v2.classes c
            left join lateral (select * from v2.class_schedule s where s.class_id = c.id and s.from_date <= p_on and (s.to_date is null or s.to_date >= p_on) order by s.from_date desc limit 1) cs on true
           where c.state = 'active'),
  pass as (select coalesce((select value::int from v2.rule where key = 'unit_test.pass_pct'), 80) pct)
  select jsonb_build_object(
    'today', p_on, 'month', to_char(p_on, 'YYYY-MM'),
    'list', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_id', st.school_id, 'level', sc.level, 'state', st.state, 'joined_on', st.joined_on, 'left_on', st.left_on,
                'class', (select jsonb_build_object('id', x.class_id, 'kind', x.kind, 'nickname', x.nickname, 'weekdays', to_jsonb(x.weekdays), 'start_time', x.start_time) from cur_class x where x.student_id = st.id limit 1),
                'books', (select coalesce(jsonb_agg(distinct b.name), '[]'::jsonb) from v2.student_book sb join v2.books b on b.id = sb.book_id where sb.student_id = st.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
                'last_consult', (select max(c.at) from v2.consult c where c.student_id = st.id),
                'login_id', pr.login_id, 'must_change_pw', pr.must_change_pw, 'issued_by_app', pr.issued_by_app,
                'parent_login', (select pp.login_id from v2.parent_student ps join v2.profiles pp on pp.id = ps.parent_profile_id where ps.student_id = st.id order by ps.created_at limit 1))
              order by case st.state when 'active' then 0 when 'paused' then 1 else 2 end, st.name), '[]'::jsonb)
              from v2.students st left join v2.schools sc on sc.id = st.school_id left join v2.profiles pr on pr.id = st.profile_id where st.state <> 'prospect'),
    'student', (select jsonb_build_object('id', st.id, 'name', st.name, 'grade', st.grade, 'school', sc.name, 'school_id', st.school_id, 'level', sc.level, 'state', st.state, 'joined_on', st.joined_on, 'left_on', st.left_on,
                  'phone', st.phone, 'parent_phone', st.parent_phone, 'memo', st.memo, 'score_show', st.score_show, 'progress_edit', st.progress_edit, 'stop_weeks', st.stop_weeks, 'warn_report_at', st.warn_report_at, 'profile_id', st.profile_id, 'updated_at', st.updated_at,
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
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key in ('unit_test.pass_pct', 'late.repeat_days', 'late.repeat_count', 'warn.report_at'))
  ) where v2.is_staff()
$$;

-- ⑥ 대시보드 잡동사니 한 조회에 카드 순서까지(파도 20 상한을 안 넘긴다 — 되돌림 타입이 바뀌어 다시 만든다)
drop function if exists v2.dash_ops(date);
create function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int, progress_open boolean, progress_opened_on date, progress_pending int, progress_flags int, pref jsonb)
language sql stable security definer set search_path = v2, public as $$
  select (select max(ran_on) from v2.day_ran where kind = 'queue'),
         (select count(*)::int from v2.job_queue where state = 'fail'),
         (select count(*)::int from v2.job_queue where state in ('wait', 'taking')),
         (select max(fetched_at) from v2.cc_planner),
         (select count(*)::int from v2.day_sheet where date = p_on and closed_at is not null),
         (select is_open from v2.progress_edit where scope = 'academy'),
         (select opened_on from v2.progress_edit where scope = 'academy'),
         (select count(*)::int from v2.progress where not confirmed),
         (select count(*)::int from v2.progress_flag where seen_at is null),
         (select layout from v2.screen_pref where profile_id = auth.uid() and screen = 'dash')
   where v2.is_staff()
$$;
grant execute on function v2.dash_ops(date) to authenticated, service_role;
