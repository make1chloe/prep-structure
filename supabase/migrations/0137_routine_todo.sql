-- 0137 4단계-5(9/7) — 루틴·할 일 손질: ① 학생루틴 줄에 book_id(「이 교재만 루틴 다르게」 — 교재 › 아이 영역 › 학원 영역) ② day_item.gate_prev(줄 사이 잠금이 판까지 — 확정-㉒) ③ quiz.paper_at(재시험지 만들었음)
-- ④ 판 다시 냄 — routine_board(student_lines.book_id · student_books.to_date) · todo_board(retests.paper_at) · routine_areas(교재 줄도) ⑤ run_repeats 에 사건 갈래 둘(신규 학생 · 교재 끝나감). 표는 새로 없다 — 멱등
-- ① 교재 예외 — 열쇠는 둘: 영역 줄 (학생·영역·항목 · book_id 없음) · 교재 줄 (학생·교재·항목)
alter table v2.student_routine add column if not exists book_id uuid references v2.books(id) on delete restrict;
comment on column v2.student_routine.book_id is '「이 교재만 루틴 다르게」(목업 11 교재 예외 · 4단계-5) — 비면 그 영역의 아이 줄, 있으면 그 교재에만 쓰는 줄. 교재 줄이 하나라도 살아 있으면 그 교재는 교재 줄만 쓴다(교재 › 아이 영역 › 학원 영역 — 수강료의 학생 › 반 › 학년과 같은 꼴)';
alter table v2.student_routine drop constraint if exists student_routine_student_id_area_item_id_key;
alter table v2.student_routine drop constraint if exists student_routine_slot_key;             -- 0036 이 (학생·영역·항목·자리)로 바꾼 열쇠 — 교재 줄이 같은 항목을 또 가지므로 둘로 가른다
drop index if exists v2.student_routine_area_key; drop index if exists v2.student_routine_book_key;
create unique index if not exists student_routine_area_key on v2.student_routine (student_id, area, item_id, place) where book_id is null;
create unique index if not exists student_routine_book_key on v2.student_routine (student_id, book_id, item_id, place) where book_id is not null;
-- ② 줄 사이 잠금 — 학원 영역 줄에도(student_routine 엔 0010 부터 있었다 · 영역 줄이 바탕이라 여기서 걸면 그 영역을 쓰는 아이 전부) · 판까지
alter table v2.area_routine add column if not exists gate_prev boolean not null default false;
comment on column v2.area_routine.gate_prev is '앞 줄을 끝내야 열린다(확정-㉒ — 줄 사이에만 · 4단계-5). 아이 줄·교재 줄로 베낄 때 따라간다';
alter table v2.day_item add column if not exists gate_prev boolean not null default false;
comment on column v2.day_item.gate_prev is '앞 줄을 끝내야 열린다(확정-㉒ — 줄 사이에만, 모든 줄이 아니다) · 루틴 줄(student_routine.gate_prev)에서 깔 때 옮겨 적는다 · 아이 화면 07 의 숙제 줄이 「앞엣것부터」로 잠근다(학원 줄은 ⑰ 대로 늘 차례대로)';
-- ③ 재시험지 만들었음
alter table v2.quiz add column if not exists paper_at timestamptz;
comment on column v2.quiz.paper_at is '재시험지를 만든 때(05 🔁 재시험지 카드 「만들었음」 · 4단계-5) — 비면 아직. 시험을 보면 카드는 사라진다(quiz.state)';
-- ④ 판 다시 냄
create or replace function v2.routine_board(p_student uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_student, (select id from v2.students where state = 'active' order by name limit 1)) sid)
  select jsonb_build_object(
    'student', pick.sid,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'method', i.method, 'checks', i.checks, 'state', i.state, 'sort', i.sort) order by i.sort, i.name), '[]'::jsonb) from v2.learn_items i),
    'area_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', ar.id, 'area', ar.area::text, 'item_id', ar.item_id, 'place', ar.place, 'required', ar.required, 'gate_prev', ar.gate_prev, 'sort', ar.sort, 'state', ar.state,
                                                                 'name', li.name, 'method', li.method, 'checks', li.checks, 'item_state', li.state) order by ar.area, ar.sort), '[]'::jsonb)
                    from v2.area_routine ar join v2.learn_items li on li.id = ar.item_id),
    'book_counts', (select coalesce(jsonb_object_agg(b.area, b.n), '{}'::jsonb) from (select area::text area, count(*) n from v2.books where state = 'active' and area is not null group by area) b),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'grade', s.grade) order by s.name), '[]'::jsonb) from v2.students s where s.state = 'active'),
    'student_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'book_id', sr.book_id, 'area', sr.area::text, 'item_id', sr.item_id, 'place', sr.place, 'sort', sr.sort, 'state', sr.state,
                                                                    'count_n', sr.count_n, 'criterion', sr.criterion, 'gate_prev', sr.gate_prev, 'name', li.name, 'method', li.method, 'item_state', li.state) order by sr.area, sr.sort), '[]'::jsonb)
                       from v2.student_routine sr join v2.learn_items li on li.id = sr.item_id where sr.student_id = pick.sid),
    'student_books', (select coalesce(jsonb_agg(jsonb_build_object('id', sb.id, 'book_id', sb.book_id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'from_date', sb.from_date, 'to_date', sb.to_date, 'round', sb.round,
                                                                    'per_session', sb.per_session, 'order_basis', coalesce(sb.order_basis, b.order_basis), 'own_basis', sb.order_basis,
                                                                    'unit_test', sb.unit_test, 'unit_test_n', sb.unit_test_n, 'stop_mode', sb.stop_mode, 'stop_until', sb.stop_until, 'stop_from', sb.stop_from, 'stop_exam_id', sb.stop_exam_id,
                                                                    'remaining', (select count(*) from v2.todo_units(pick.sid, sb.book_id, p_on)),
                                                                    'total', (select count(*) from v2.units u where u.book_id = sb.book_id and u.state = 'active')) order by sb.from_date desc), '[]'::jsonb)
                       from v2.student_book sb join v2.books b on b.id = sb.book_id
                      where sb.student_id = pick.sid and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
    'days', (select coalesce(jsonb_agg(d.date order by d.date), '[]'::jsonb) from v2.student_days(pick.sid, p_on, p_on + 400) d where d.kind in ('class', 'makeup')),
    'books_free', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text) order by b.area, b.name), '[]'::jsonb) from v2.books b
                    where b.state = 'active' and pick.sid is not null
                      and not exists (select 1 from v2.student_book sb where sb.student_id = pick.sid and sb.book_id = b.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)))
  ) from pick where v2.is_staff()
$$;

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
                     'solved', (select count(*) from v2.material_give g where g.material_id = m.id and g.stage = 'done')) end,
                 'rule', r.name)
               order by t.due_on nulls last, t.due_time nulls last, t.created_at), '[]'::jsonb)
                from v2.todo t left join v2.students st on st.id = t.student_id left join v2.schools ssc on ssc.id = st.school_id
                left join v2.exams e on e.id = t.exam_id left join v2.schools esc on esc.id = e.school_id
                left join v2.material m on m.id = t.material_id left join v2.material_type ty on ty.id = m.type_id
                left join v2.auto_rule r on r.id = t.rule_id
               where t.state in ('todo', 'doing') or t.updated_at >= (p_on - 30)::timestamptz),
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
    'repeat_ran', exists (select 1 from v2.day_ran d where d.kind = 'repeat' and d.ran_on = p_on),
    'rules', (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'todo.%')
  ) where v2.is_staff()
$$;

drop function if exists v2.routine_areas(uuid[]);
create or replace function v2.routine_areas(p_students uuid[])
returns table (student_id uuid, area text, book_id uuid)
language sql stable as $$
  select distinct sr.student_id, sr.area::text, sr.book_id from v2.student_routine sr join v2.learn_items li on li.id = sr.item_id
   where sr.student_id = any(p_students) and li.state = 'active' and sr.state = 'active'
  union
  select distinct null::uuid, ar.area::text, null::uuid from v2.area_routine ar join v2.learn_items li on li.id = ar.item_id
   where li.state = 'active' and ar.state = 'active'
$$;
grant execute on function v2.routine_areas(uuid[]) to authenticated, service_role;
-- ⑤ 되풀이 — 날짜 규칙(매달·매주)에 사건 규칙 둘: {"event":"new_student","days":7} 들어온 지 N일 · {"event":"book_ending","left":5} 남은 소단원 N개 이하. 열쇠는 auto_key(규칙·아이·교재·회독·기준 날)
create or replace function v2.run_repeats(p_on date) returns int
language plpgsql security definer set search_path = v2, public as $$
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
          values ('repeat', format('%s — %s', s.name, r.name), due, r.id, s.id, format('들어온 지 %s일(%s 등록) — 저절로', days_, to_char(s.joined_on, 'MM/DD')));
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
          values ('repeat', format('%s · %s — %s', s.name, s.book, r.name), p_on, r.id, s.student_id, format('남은 소단원 %s개 — 저절로', cnt));
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
            case when r.threshold ? 'day' then format('매달 %s일 — 저절로', d)
                 else format('매주 %s요일 — 저절로', (array['일','월','화','수','목','금','토'])[wd + 1]) end);
    n := n + 1;
  end loop;
  insert into v2.day_ran (kind, ran_on) values ('repeat', p_on) on conflict do nothing;
  return n;
end $$;
comment on function v2.run_repeats(date) is '되풀이 규칙이 오늘 걸리면 할 일 한 줄 — 날짜 규칙은 열쇠 (규칙, 마감 날) · 사건 규칙은 (규칙, 아이, 들어온 날) / (규칙, 아이, 교재, 회독). 하루 한 번(day_ran repeat) · 05 첫 열기와 크론(lib/todo beforeRun)이 부른다 — 4단계-5';
grant execute on function v2.run_repeats(date) to authenticated, service_role;
