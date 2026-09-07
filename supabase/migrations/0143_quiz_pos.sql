-- 0143 (가)-①(9/7 밤 — 원장님 「그다음 2번해」 · 5단계 뒤 남긴 것 1) — 🔤 시험 카드 자리를 **아이마다**: `students.quiz_pos` start(시작하자마자 · 기본 · 카드가 맨 위) | end(다 끝내고 · 학습·숙제 아래).
-- 목업 01 시험 카드 노트: 「맨 위에 있는 까닭 — 이 아이는 「시작하자마자」로 정해 뒀기 때문입니다. 「다 끝내고」인 아이는 이 카드가 아래로 내려가 있습니다 — 자리가 아이마다 다릅니다.」
-- 정하는 자리는 루틴 11 의 아이 머리(routine_board.students 에 quiz_pos 한 칸) · 읽는 자리는 오늘 01 의 반·아이 조회(lib/day rosterPeople · lib/plan 보강) · 이름 둘은 lib/quiz-plan QUIZ_POS 한 곳. 표는 새로 없다 — 멱등
alter table v2.students add column if not exists quiz_pos text not null default 'start';
do $$ begin if not exists (select 1 from pg_constraint where conname = 'students_quiz_pos_choice') then
  alter table v2.students add constraint students_quiz_pos_choice check (quiz_pos in ('start', 'end'));   -- 표-6(고르는 값은 DB 에도) · 새 칸이라 옛 줄도 기본값 — not valid 가 필요 없다
end if; end $$;
comment on column v2.students.quiz_pos is '🔤 시험 카드 자리(오늘 01) — start 시작하자마자(기본 · 카드가 맨 위) · end 다 끝내고(학습·숙제 아래). 루틴 11 아이 머리에서 정한다(0143 · lib/quiz-plan QUIZ_POS)';
-- routine_board(0137) 다시 냄 — students json 에 quiz_pos 한 칸. 나머지는 0137 그대로
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
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'grade', s.grade, 'quiz_pos', s.quiz_pos) order by s.name), '[]'::jsonb) from v2.students s where s.state = 'active'),
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
