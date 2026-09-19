-- 0184 · 업무 한 줄에 아이를 **여럿** 잇는다 ((어95) · 2026-09-19)
--
-- 원장님 2026-09-19(여쭌 54 의 답): 「**b**」 — 「한 업무에 아이를 여럿 잇는다(잇는 표를 새로)」.
-- 사고: v2.todo 에 `student_id` 한 칸뿐이라 한 업무에 아이가 **한 명**만 붙었다. 「1학년 셋 학부모 전화」는
--       업무를 세 줄로 쪼개야 했고, 그러면 하나를 끝내도 나머지가 남아 **한 일이 세 번 보인다**.
--       아이를 한 줄 더 잇는 자리는 이미 배부(material_give)에 있는 꼴 그대로다 — 새 꼴을 만들지 않는다.
-- 고침: 잇는 표 v2.todo_student 하나를 **한 곳**으로 세우고 `v2.todo.student_id` 는 **없앤다**.
--       ⚠️ 두 벌로 두면 반드시 어긋난다(원칙-1) — 한쪽만 고쳐진 날 카드에 아이가 둘로 보인다.
--       옛 줄은 그대로 옮겨 담는다(한 명 이어 둔 업무는 이은 채로 남는다 · 대전제-0).
-- ⚠️ 뗀 아이도 **안 지운다**(대전제-6 · state='off') — v2 의 어느 표도 지울 권한이 없다(check-grants).
-- 멱등: create table if not exists · 옮겨 담기는 옛 칸이 남아 있을 때만 · drop column if exists ·
--       판 셋은 create or replace. 3번 돌려도 같다(check-sql 이 SETUP_ALL 을 3번 돌린다).
-- ⚠️ 앱이 먼저 올라간다(대전제-27) — 0184 를 안 붙이신 DB 에서도 업무 넣기·고치기는 살아야 해서
--    아이 잇기는 `lib/schedule.js setTodoStudents` 가 **따로** 적고, 표가 없으면 「0184 를 넣으세요」라고 말한다.

-- ══ ① 잇는 표 — 한 줄 = 「이 업무에 이 아이가 걸려 있다」
create table if not exists v2.todo_student (
  todo_id uuid not null references v2.todo(id) on delete cascade,
  student_id uuid not null references v2.students(id) on delete cascade,
  state text not null default 'active' check (state in ('active', 'off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (todo_id, student_id)
);
comment on table v2.todo_student is '한 줄 = 「이 업무(v2.todo)에 이 아이가 걸려 있다」. 한 업무에 아이가 여럿이다((어95) · 원장님 2026-09-19 「b」) · 뗀 아이는 **안 지우고 내린다**(state=off · 대전제-6)라서 도로 고르면 그 줄이 다시 선다 · 아이나 업무가 지워지면 이은 줄도 같이 사라진다(cascade)';
alter table v2.todo_student enable row level security;
alter table v2.todo_student force row level security;
drop policy if exists staff_all on v2.todo_student;
create policy staff_all on v2.todo_student for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.todo_student to authenticated, service_role;
drop trigger if exists todo_student_touch on v2.todo_student;
create trigger todo_student_touch before update on v2.todo_student for each row execute function v2.touch_row();
drop trigger if exists todo_student_audit on v2.todo_student;
create trigger todo_student_audit after insert or update or delete on v2.todo_student for each row execute function v2.audit_row();
create index if not exists todo_student_student on v2.todo_student(student_id);

-- ══ ② 옛 칸을 옮겨 담고 없앤다 — 두 벌이면 어긋난다(원칙-1)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'v2' and table_name = 'todo' and column_name = 'student_id') then
    insert into v2.todo_student (todo_id, student_id)
    select t.id, t.student_id from v2.todo t where t.student_id is not null
    on conflict do nothing;
  end if;
end $$;
alter table v2.todo drop column if exists student_id;

-- ══ ③ 업무 판 — 한 명 칸 넷 대신 **아이 목록**을 싣는다
-- 뺌: student_school_id student_school   (한 명 꼴이던 칸 — 이제 'students' 목록 안에 school_id · school 로 들어간다)

create or replace function v2.todo_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'note', t.note, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'done_at', t.done_at, 'why', t.why, 'private', t.private, 'created_at', t.created_at, 'start_on', t.start_on,
                 'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.orig_name, 'mime', f.mime, 'bytes', f.bytes) order by fl.created_at), '[]'::jsonb)
                             from v2.file_link fl join v2.file f on f.id = fl.file_id where fl.todo_id = t.id and f.state = 'active'),
                 'students', (select coalesce(jsonb_agg(jsonb_build_object('id', ts.student_id, 'name', tst.name, 'school_id', tst.school_id, 'school', tsc.name) order by tst.name), '[]'::jsonb)
                               from v2.todo_student ts join v2.students tst on tst.id = ts.student_id left join v2.schools tsc on tsc.id = tst.school_id where ts.todo_id = t.id and ts.state = 'active'),
                 'exam', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'school', esc.name, 'school_id', e.school_id, 'level', esc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
                                                                             'takers', (select count(*) from v2.exam_takers(e.id))) end,
                 'material', case when m.id is null then null else jsonb_build_object('id', m.id, 'title', m.title, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'state', m.state, 'reuse_of', m.reuse_of,
                     'items', (select count(*) from v2.material_item i where i.material_id = m.id),
                     'gives', (select count(*) from v2.material_give g where g.material_id = m.id),
                     'handed', (select count(*) from v2.material_give g where g.material_id = m.id and g.handed_at is not null),
                     'got', (select count(*) from v2.material_give g where g.material_id = m.id and g.got_at is not null),
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done'),
                     'submitted', (select count(*) from v2.material_give g where g.material_id = m.id and g.submitted_at is not null),
                     'scored', (select count(*) from v2.material_give g where g.material_id = m.id and g.scored_at is not null),
                     'students', (select coalesce(jsonb_agg(jsonb_build_object('id', g.student_id, 'name', gs.name, 'handed', g.handed_at is not null, 'stage', g.stage, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at) order by gs.name), '[]'::jsonb) from v2.material_give g join v2.students gs on gs.id = g.student_id where g.material_id = m.id)) end,
                 'rule', r.name)
               order by t.due_on nulls last, t.due_time nulls last, t.created_at), '[]'::jsonb)
                from v2.todo t
                left join v2.exams e on e.id = t.exam_id left join v2.schools esc on esc.id = e.school_id
                left join v2.material m on m.id = t.material_id left join v2.material_type ty on ty.id = m.type_id
                left join v2.auto_rule r on r.id = t.rule_id
               where t.state in ('todo', 'doing') or t.updated_at >= (p_on - 30)::timestamptz),
    'materials', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'type', ty.name, 'source', ty.source, 'steps', to_jsonb(ty.steps), 'state', m.state, 'reuse_of', m.reuse_of, 'created_at', m.created_at,
                     'exam', case when e.id is null then null else jsonb_build_object('id', e.id, 'name', e.name, 'school', esc.name, 'school_id', e.school_id, 'level', esc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to) end,
                     'items', (select count(*) from v2.material_item i where i.material_id = m.id),
                     'gives', (select count(*) from v2.material_give g where g.material_id = m.id),
                     'handed', (select count(*) from v2.material_give g where g.material_id = m.id and g.handed_at is not null),
                     'got', (select count(*) from v2.material_give g where g.material_id = m.id and g.got_at is not null),
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done'),
                     'submitted', (select count(*) from v2.material_give g where g.material_id = m.id and g.submitted_at is not null),
                     'scored', (select count(*) from v2.material_give g where g.material_id = m.id and g.scored_at is not null),
                     'students', (select coalesce(jsonb_agg(jsonb_build_object('id', g.student_id, 'name', gs.name, 'handed', g.handed_at is not null, 'stage', g.stage, 'submitted_at', g.submitted_at, 'scored_at', g.scored_at) order by gs.name), '[]'::jsonb) from v2.material_give g join v2.students gs on gs.id = g.student_id where g.material_id = m.id)) order by m.created_at), '[]'::jsonb)
                    from v2.material m join v2.material_type ty on ty.id = m.type_id left join v2.exams e on e.id = m.exam_id left join v2.schools esc on esc.id = e.school_id
                   where m.state <> 'dropped' and ('solve' = any(ty.steps) or 'score' = any(ty.steps))
                     and exists (select 1 from v2.material_give g where g.material_id = m.id and g.handed_at is not null)),   -- 준 자료만(0145 · (가)-⑧)
    'unit_tests', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'student_id', u.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'topic', gt.name, 'q_count', u.q_count, 'assigned_on', u.assigned_on, 'state', u.state,
                      'next_class', (select min(d.date) from v2.student_days(u.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) order by u.assigned_on, st.name), '[]'::jsonb)
                     from v2.unit_test u join v2.students st on st.id = u.student_id left join v2.schools sc on sc.id = st.school_id left join v2.grammar_topics gt on gt.id = u.topic_id
                    where u.state = 'todo'),
    'retests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'student_id', q.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'kind', q.kind, 'total', q.total, 'assigned_on', q.assigned_on, 'paper_at', q.paper_at, 'sheet_id', q.assigned_sheet_id, 'retry_of', q.retry_of, 'closed', (select d.closed_at is not null from v2.day_sheet d where d.id = q.assigned_sheet_id),
                      'book', b.name, 'unit', case when q.unit_from is null then null else v2.unit_label(q.unit_from, false) end, 'free_note', q.free_note, 'style', qs.text,
                      'pct', o.pct, 'harder', q.harder) order by q.assigned_on, st.name), '[]'::jsonb)
                  from v2.quiz q join v2.students st on st.id = q.student_id left join v2.schools sc on sc.id = st.school_id left join v2.books b on b.id = q.book_id
                  left join v2.quiz_style qs on qs.id = q.style_id left join v2.quiz o on o.id = q.retry_of
                 where q.state = 'planned' and q.retry_of is not null),
    'scores', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'school_id', e.school_id, 'level', sc.level, 'grade', e.grade, 'english_on', e.english_on, 'term_from', e.term_from, 'term_to', e.term_to,
                      'takers', (select count(*) from v2.exam_takers(e.id)),
                      'scored', (select count(*) from v2.score s where s.exam_id = e.id and s.student_id in (select student_id from v2.exam_takers(e.id)))) order by coalesce(e.english_on, e.term_from)), '[]'::jsonb)
                 from v2.exams e left join v2.schools sc on sc.id = e.school_id
                where e.state = 'active' and not e.hidden and coalesce(e.english_on, e.term_to, e.term_from) between p_on - 45 and p_on + 45),
    'repeats', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'threshold', r.threshold, 'active', r.active) order by r.name), '[]'::jsonb) from v2.auto_rule r where r.kind = 'repeat'),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active' and exists (select 1 from v2.students st where st.school_id = s.id and st.state = 'active')),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'school_id', st.school_id, 'school', sc.name, 'grade', st.grade) order by st.name), '[]'::jsonb) from v2.students st left join v2.schools sc on sc.id = st.school_id where st.state = 'active'),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.sort, g.name), '[]'::jsonb) from v2.grammar_topics g),
    'exams_soon', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'school', sc.name, 'english_on', e.english_on, 'term_from', e.term_from,
                       'materials', (select count(*) from v2.material m where m.exam_id = e.id and m.state <> 'dropped')) order by coalesce(e.english_on, e.term_from)), '[]'::jsonb)
                     from v2.exams e left join v2.schools sc on sc.id = e.school_id where e.state = 'active' and not e.hidden and coalesce(e.term_to, e.english_on, e.term_from) >= p_on),
    'unit_test_due', (select coalesce(jsonb_agg(x order by x->>'student', x->>'book', (x->>'seq')::int nulls first, x->>'chapter'), '[]'::jsonb) from (
        -- 대단원마다 — 이 회독에서 대단원의 살아 있는 소단원이 전부 ○·건너뜀(todo_units 와 같은 셈)이면 한 장 · 이미 낸 대단원은 뺀다
        select jsonb_build_object('student_id', sb.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id,
                 'book_id', sb.book_id, 'book', b.name, 'round', sb.round, 'mode', 'per_chapter', 'chapter', ch.chapter, 'seq', null, 'n', null, 'covers', ch.chapter,
                 'topics', (select coalesce(jsonb_agg(distinct gt.name), '[]'::jsonb) from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id join v2.units u2 on u2.id = ut.unit_id
                             where u2.book_id = sb.book_id and u2.chapter = ch.chapter and u2.state = 'active'),
                 'topic_id', (select ut.topic_id from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id join v2.units u2 on u2.id = ut.unit_id
                               where u2.book_id = sb.book_id and u2.chapter = ch.chapter and u2.state = 'active' order by gt.sort, gt.name limit 1),
                 'next_class', (select min(d.date) from v2.student_days(sb.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) x
          from v2.student_book sb join v2.students st on st.id = sb.student_id left join v2.schools sc on sc.id = st.school_id join v2.books b on b.id = sb.book_id
          cross join lateral (select u.chapter from v2.units u where u.book_id = sb.book_id and u.state = 'active' group by u.chapter
                              having bool_and(exists (select 1 from v2.progress p where p.student_id = sb.student_id and p.unit_id = u.id and p.round = sb.round
                                                        and p.status in ('done', 'skip') and coalesce(p.done_on, p.marked_on, p_on) <= p_on))) ch
         where sb.unit_test = 'per_chapter' and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on) and st.state = 'active'
           and not exists (select 1 from v2.unit_test t where t.student_id = sb.student_id and t.book_id = sb.book_id and t.round = sb.round and t.chapter = ch.chapter)
        union all
        -- 소단원 N개마다 — 이 회독에서 ○·건너뜀 된 소단원을 차례대로 N개씩 묶어 꽉 찬 묶음마다 한 장 · 이미 낸 묶음(seq)은 뺀다
        select jsonb_build_object('student_id', sb.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id,
                 'book_id', sb.book_id, 'book', b.name, 'round', sb.round, 'mode', 'per_n_sub', 'chapter', null, 'seq', g.seq, 'n', sb.unit_test_n, 'covers', g.covers,
                 'topics', (select coalesce(jsonb_agg(distinct gt.name), '[]'::jsonb) from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id where ut.unit_id = any(g.ids)),
                 'topic_id', (select ut.topic_id from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id where ut.unit_id = any(g.ids) order by gt.sort, gt.name limit 1),
                 'next_class', (select min(d.date) from v2.student_days(sb.student_id, p_on, p_on + 21) d where d.kind in ('class', 'makeup'))) x
          from v2.student_book sb join v2.students st on st.id = sb.student_id left join v2.schools sc on sc.id = st.school_id join v2.books b on b.id = sb.book_id
          cross join lateral (select d.seq, array_agg(d.id order by d.rn) ids, string_agg(v2.unit_label(d.id, false), ' · ' order by d.rn) covers
                                from (select u.id, row_number() over (order by u.sort) rn, ((row_number() over (order by u.sort)) - 1) / sb.unit_test_n + 1 seq
                                        from v2.units u
                                       where u.book_id = sb.book_id and u.state = 'active'
                                         and exists (select 1 from v2.progress p where p.student_id = sb.student_id and p.unit_id = u.id and p.round = sb.round
                                                       and p.status in ('done', 'skip') and coalesce(p.done_on, p.marked_on, p_on) <= p_on)) d
                               group by d.seq having count(*) = sb.unit_test_n) g
         where sb.unit_test = 'per_n_sub' and coalesce(sb.unit_test_n, 0) > 0 and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on) and st.state = 'active'
           and not exists (select 1 from v2.unit_test t where t.student_id = sb.student_id and t.book_id = sb.book_id and t.round = sb.round and t.seq = g.seq)
      ) s),
    'repeat_ran', exists (select 1 from v2.day_ran d where d.kind = 'repeat' and d.ran_on = p_on),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'todo.%')
  ) where v2.is_staff()
$$;

comment on function v2.todo_board(date) is '내 할 일 05 가 읽는 한 벌 — 할 일 줄(하는 것 전부 + 지난 30일의 끝낸·뺀 것 · **이은 아이 목록**·회차·자료·규칙 붙여) · 단원평가 낼 것 · 재시험 줄 · 성적 받을 회차 · 되풀이 규칙 · 학교 · 아이 · 문법 분류 · 다가오는 회차 · 오늘 되풀이 돌았나 · todo.* 규칙. 학원 사람만';


-- ══ ④ 일정 판 — 달력 줄의 「누구」도 이은 아이 전부를 이어 붙인다(한 명이면 그 이름 그대로)

create or replace function v2.schedule_board(p_ym char(7), p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with span as (select ((p_ym || '-01')::date - 7) f, ((p_ym || '-01')::date + interval '1 month' + interval '7 day')::date t, (p_ym || '-01')::date m1)
  select jsonb_build_object(
    'classes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'nickname', c.nickname,
                  'weekdays', s.weekdays, 'start_time', s.start_time, 'end_time', s.end_time,
                  'members', (select count(*) from v2.class_roster(c.id, greatest(span.m1, p_on)) r),
                  'sessions', v2.session_count(c.id, p_ym), 'extra', v2.class_extra_days(c.id, p_ym)) order by s.start_time, c.created_at), '[]'::jsonb)
                 from v2.classes c, span
                 left join lateral (select * from v2.class_schedule x where x.class_id = c.id and x.from_date <= span.t and (x.to_date is null or x.to_date >= span.m1) order by x.from_date desc limit 1) s on true
                where c.state = 'active'),
    'holidays', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'date', h.date, 'class_id', h.class_id, 'reason', h.reason, 'state', h.state) order by h.date), '[]'::jsonb)
                  from v2.holiday h, span where h.date between span.f and span.t),
    'makeups', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'student_id', m.student_id, 'name', st.name, 'of_date', m.of_date, 'on_date', m.on_date, 'at_time', m.at_time, 'state', m.state, 'reason', m.reason,
                  'class_ids', (select coalesce(jsonb_agg(sc.class_id), '[]'::jsonb) from v2.student_classes(m.student_id, p_on) sc)) order by coalesce(m.of_date, m.on_date), st.name), '[]'::jsonb)
                 from v2.makeup m join v2.students st on st.id = m.student_id, span
                where m.state <> 'cancelled' and ((m.of_date between span.f and span.t) or (m.on_date between span.f and span.t))),
    'lates', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'student_id', l.student_id, 'name', st.name, 'date', l.date, 'minutes', l.minutes, 'reason', l.reason,
                  'class_ids', (select coalesce(jsonb_agg(sc.class_id), '[]'::jsonb) from v2.student_classes(l.student_id, p_on) sc)) order by l.date, st.name), '[]'::jsonb)
               from v2.late_plan l join v2.students st on st.id = l.student_id, span
              where l.cancelled_at is null and l.date between span.f and span.t),
    'exams', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'scope', e.scope, 'school_id', e.school_id, 'school', sc.name, 'grade', e.grade, 'name', e.name, 'term_from', e.term_from, 'term_to', e.term_to, 'english_on', e.english_on, 'source', e.source) order by coalesce(e.term_from, e.english_on)), '[]'::jsonb)
               from v2.exams e left join v2.schools sc on sc.id = e.school_id, span
              where e.state = 'active' and ((e.term_from <= span.t and e.term_to >= span.f) or (e.english_on between span.f and span.t))),
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state,
                  'name', (select string_agg(st.name, ' · ' order by st.name) from v2.todo_student ts join v2.students st on st.id = ts.student_id where ts.todo_id = t.id and ts.state = 'active')) order by t.due_on, t.due_time), '[]'::jsonb)
               from v2.todo t, span
              where t.state in ('todo', 'doing') and t.due_on between span.f and span.t),
    'schools', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level) order by s.name), '[]'::jsonb) from v2.schools s where s.state = 'active'),
    'rules', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from v2.rule where key like 'schedule.%'),
    'confirm', (select coalesce(jsonb_agg(jsonb_build_object('class_id', m.class_id, 'at', m.at, 'undone_at', m.undone_at, 'by', pr.name) order by m.at), '[]'::jsonb)
                 from v2.month_confirm m left join v2.profiles pr on pr.id = m.by_who where m.ym = p_ym and m.step = 3),
    'confirm_sent', (select count(distinct l.student_id)::int from v2.notify_log l where l.kind = 'schedule' and l.tag like 'month-' || p_ym || '-%')
  ) where v2.is_staff()
$$;

comment on function v2.schedule_board(char, date) is '일정 12 가 읽는 한 벌 — 그 달(앞뒤 7일)의 반·회차(요일×달−휴강+반 보강일) · 휴강 · 결석·보강 · 지각 예정 · 시험 · 할 일(이은 아이 이름을 이어 붙여) · 규칙 · 확정 도장(반마다 · 푼 때)과 알림 받은 아이 수. 학원 사람만';


-- ══ ⑤ 되풀이 — 저절로 서는 아이 업무도 잇는 표에 적는다(0164 본에서 두 줄만 바뀐다)

CREATE OR REPLACE FUNCTION v2.run_repeats(p_on date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'v2', 'public'
AS $function$
declare r record; s record; tid uuid; n int := 0; d int; lead_ int; due date; lastday int; wd int; days_ int; left_ int; cnt int;
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
          insert into v2.todo (kind, title, due_on, rule_id, why)
          values ('repeat', format('%s · %s', s.name, r.name), due, r.id, format('들어온 지 %s일(%s 등록) · 저절로', days_, to_char(s.joined_on, 'MM/DD')))
          returning id into tid;
          insert into v2.todo_student (todo_id, student_id) values (tid, s.id) on conflict do nothing;
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
          insert into v2.todo (kind, title, due_on, rule_id, why)
          values ('repeat', format('%s · %s · %s', s.name, s.book, r.name), p_on, r.id, format('남은 소단원 %s개 · 저절로', cnt))
          returning id into tid;
          insert into v2.todo_student (todo_id, student_id) values (tid, s.student_id) on conflict do nothing;
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

comment on function v2.run_repeats(date) is '되풀이 규칙이 오늘 걸리면 할 일 한 줄 — 날짜 규칙은 열쇠 (규칙, 마감 날) · 사건 규칙은 (규칙, 아이, 들어온 날) / (규칙, 아이, 교재, 회독). 아이는 v2.todo_student 에 잇는다((어95)). 하루 한 번(day_ran repeat) · 05 첫 열기와 크론(lib/todo beforeRun)이 부른다';
grant execute on function v2.run_repeats(date) to authenticated, service_role;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';
