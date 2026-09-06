-- 0119 · 루틴 11 — 통과 기준 칸(확정-54) · 예습은 0065 의 자리(place next) 그대로(확정-57 · 답 ㉔ b) · 내린 줄(retired)은 루틴 셈에서 빠진다(0075 의 경고) · 학원 사람이 루틴·교재 잇기를 쓰는 권한 · 루틴 판 한 벌
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다 — check-sql 이 SETUP_ALL 을 3번 돌린다.

-- ══ ① 「예습」 줄(확정-57 · 답 ㉔ b) — 새 칸을 만들지 않는다: 0065 가 이미 루틴 자리(place)에 「예습(next)」을 더했고 실데이터 「교재예습」 2줄이 거기 있다(원칙-1, 한 벌).
--    예습 줄은 오늘 소단원이 아니라 **다음 소단원**을 숙제로 낸다 — 까는 손은 lib/routine.js(layRoutine)
-- ══ ② 통과 기준 칸 — 오답 고치기 같은 줄의 기준은 그때그때 다르다(확정-54). 고정 %를 코드에 두지 않는다. 비면 「검사받으면 끝」
alter table v2.student_routine add column if not exists criterion text;
comment on column v2.student_routine.criterion is '이 줄의 통과 기준 — 그때그때 다르다(확정-54). 비면 「검사받으면 끝」. 오답노트 갯수는 count_n';

-- ══ ③ 내린 줄은 루틴 셈에서 빠진다 — 0075 가 state 칸을 만들며 「lib 가 같이 걸러야 한다」고 적어 둔 것. 빵꾸 막이(routine_areas)도 같이
create or replace function v2.routine_areas(p_students uuid[])
returns table (student_id uuid, area text)
language sql stable as $$
  select distinct sr.student_id, sr.area::text from v2.student_routine sr join v2.learn_items li on li.id = sr.item_id
   where sr.student_id = any(p_students) and li.state = 'active' and sr.state = 'active'
  union
  select distinct null::uuid, ar.area::text from v2.area_routine ar join v2.learn_items li on li.id = ar.item_id
   where li.state = 'active' and ar.state = 'active'
$$;
comment on function v2.routine_areas(uuid[]) is '살아 있는 루틴 줄이 있는 영역 — student_id 가 있으면 그 아이의 학생 루틴, 없으면 학원의 영역 루틴. 내린 줄(retired)은 안 센다(0119)';

-- ══ ④ 권한 — 규칙(staff_all)은 0009·0016 에 있는데 쓰기 권한이 없었다(check-grants 가 잡는 그 사고). 지우는 권한은 없다(대전제-6 · 🗑 는 retired)
grant insert, update on v2.learn_items, v2.area_routine, v2.student_routine, v2.student_book to authenticated;

-- ══ ⑤ 루틴 판 한 벌 — 항목 · 영역 루틴(내린 것까지) · 영역별 교재 수 · 아이들 · 고른 아이의 루틴·교재(안 한 소단원 수 · 앞으로의 수업일) · 이을 수 있는 교재. 학원 사람만(아니면 null)
create or replace function v2.routine_board(p_student uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_student, (select id from v2.students where state = 'active' order by name limit 1)) sid)
  select jsonb_build_object(
    'student', pick.sid,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'method', i.method, 'checks', i.checks, 'state', i.state, 'sort', i.sort) order by i.sort, i.name), '[]'::jsonb) from v2.learn_items i),
    'area_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', ar.id, 'area', ar.area::text, 'item_id', ar.item_id, 'place', ar.place, 'required', ar.required, 'sort', ar.sort, 'state', ar.state,
                                                                 'name', li.name, 'method', li.method, 'checks', li.checks, 'item_state', li.state) order by ar.area, ar.sort), '[]'::jsonb)
                    from v2.area_routine ar join v2.learn_items li on li.id = ar.item_id),
    'book_counts', (select coalesce(jsonb_object_agg(b.area, b.n), '{}'::jsonb) from (select area::text area, count(*) n from v2.books where state = 'active' and area is not null group by area) b),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'grade', s.grade) order by s.name), '[]'::jsonb) from v2.students s where s.state = 'active'),
    'student_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', sr.id, 'area', sr.area::text, 'item_id', sr.item_id, 'place', sr.place, 'sort', sr.sort, 'state', sr.state,
                                                                    'count_n', sr.count_n, 'criterion', sr.criterion, 'gate_prev', sr.gate_prev, 'name', li.name, 'method', li.method, 'item_state', li.state) order by sr.area, sr.sort), '[]'::jsonb)
                       from v2.student_routine sr join v2.learn_items li on li.id = sr.item_id where sr.student_id = pick.sid),
    'student_books', (select coalesce(jsonb_agg(jsonb_build_object('id', sb.id, 'book_id', sb.book_id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'from_date', sb.from_date, 'round', sb.round,
                                                                    'per_session', sb.per_session, 'order_basis', coalesce(sb.order_basis, b.order_basis), 'own_basis', sb.order_basis,
                                                                    'unit_test', sb.unit_test, 'unit_test_n', sb.unit_test_n, 'stop_mode', sb.stop_mode, 'stop_until', sb.stop_until,
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
comment on function v2.routine_board(uuid, date) is '루틴 11 이 읽는 한 벌 — 학원 기본 루틴(내린 줄까지) · 고른 아이의 루틴·교재(안 한 소단원 수 · 앞으로 400일의 수업일) · 이을 수 있는 교재. 학원 사람만';
grant execute on function v2.routine_board(uuid, date) to authenticated, service_role;
