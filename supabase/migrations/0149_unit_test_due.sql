-- 0149 (버) 단원평가를 내는 자리 — 루틴 11 의 「단원평가 본다」(대단원마다 · 소단원 N개마다)가 켜진 교재에서 그 묶음이 끝나면
-- 할 일 05 에 「📝 단원평가 출제」 카드가 저절로 선다(남긴 것 6 · 목업 05 「🧾 … 저절로」 · 목업 01 「교재 CHAPTER → 단원평가 단원」 화살표).
-- 단원평가 줄에 어느 교재·묶음에서 났는지를 새긴다(book_id · round · chapter | seq · covers) — 같은 묶음은 한 번만(부분 유일 색인) · 손으로 낸 것은 비어 있다.
alter table v2.unit_test add column if not exists book_id uuid references v2.books(id) on delete restrict;
alter table v2.unit_test add column if not exists round   smallint;
alter table v2.unit_test add column if not exists chapter text;
alter table v2.unit_test add column if not exists seq     smallint;
alter table v2.unit_test add column if not exists covers  text;
comment on column v2.unit_test.book_id is '(버) 어느 교재의 묶음이 끝나서 낸 단원평가인가 — 손으로 낸 것은 비어 있다';
comment on column v2.unit_test.round   is '(버) 그 교재의 몇 회독에서 났나';
comment on column v2.unit_test.chapter is '(버) 대단원마다 — 끝난 대단원 이름';
comment on column v2.unit_test.seq     is '(버) 소단원 N개마다 — 몇 번째 묶음인가(1부터)';
comment on column v2.unit_test.covers  is '(버) 무엇을 덮는 단원평가인가(대단원 이름 · 소단원 목록) — 01 카드의 「교재 … → 단원평가 단원」 줄';
create unique index if not exists unit_test_one_per_group on v2.unit_test (student_id, book_id, round, coalesce(chapter, ''), coalesce(seq, 0)) where book_id is not null;

-- todo_board 다시 냄(0145 본 그대로 + 'unit_test_due') — 검사-74: 앞 정의의 열쇠를 전부 품는다
create or replace function v2.todo_board(p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'today', p_on,
    'todos', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'note', t.note, 'due_on', t.due_on, 'due_time', t.due_time, 'state', t.state, 'done_at', t.done_at, 'why', t.why, 'private', t.private, 'created_at', t.created_at,
                 'student_id', t.student_id, 'student', st.name, 'student_school_id', st.school_id, 'student_school', ssc.name,
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
                from v2.todo t left join v2.students st on st.id = t.student_id left join v2.schools ssc on ssc.id = st.school_id
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
    'retests', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'student_id', q.student_id, 'student', st.name, 'school', sc.name, 'school_id', st.school_id, 'kind', q.kind, 'total', q.total, 'assigned_on', q.assigned_on, 'paper_at', q.paper_at,
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
