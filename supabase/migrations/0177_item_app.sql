-- 0177 (어77 · 묶음 C) 이 항목은 어느 앱에서 하나 — 멱등
--
-- 원장님 2026-09-17:
--  「다했어요 누르면 클래스카드 숙제는 클래스카드 라고 버튼 누르고 넘어가규
--    교재숙제는 사진으로 제출 가능하게해줘」
--
-- ⚠️ 이름으로 짐작하지 않는다. 「클래스카드 문장훈련」처럼 이름에 든 글자를 보고 가르면
--    항목 이름을 고치는 날 조용히 어긋난다(숨은 규칙). 그래서 **칸 하나**로 정한다 —
--    원장님이 설정 › 루틴에서 항목마다 켜신다(대전제-19 · 항목은 더하고 고치고 빼는 것이 기본).
-- ⚠️ 값은 지금 'cc' 하나뿐이고, 비면(null) 교재 숙제다 — 사진·음성으로 낸다.
--    앞으로 다른 앱이 생기면 여기 check 에 한 낱말을 더한다(판단은 lib/item-plan nextStep 한 곳).

begin;

alter table v2.learn_items add column if not exists by_app text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'learn_items_by_app_chk') then
    alter table v2.learn_items add constraint learn_items_by_app_chk
      check (by_app is null or by_app in ('cc')) not valid;
  end if;
end $$;
alter table v2.learn_items validate constraint learn_items_by_app_chk;

comment on column v2.learn_items.by_app is
  '(어77) 아이가 이것을 하는 앱 — cc 면 🃏 클래스카드에서 하고(완료 뒤 「클래스카드」 단추), 비면 교재 숙제라 사진·음성으로 낸다';

-- 루틴 11 이 이 칸을 보고 칩을 그린다 — 판 함수를 **앞 정의 그대로** 다시 내고 'by_app' 두 자리만 더한다
-- (0143 본이 마지막이었다 · check-redefine 이 앞 정의의 키를 하나도 안 잃었는지 본다).
create or replace function v2.routine_board(p_student uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_student, (select id from v2.students where state = 'active' order by name limit 1)) sid)
  select jsonb_build_object(
    'student', pick.sid,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'method', i.method, 'checks', i.checks, 'state', i.state, 'sort', i.sort, 'by_app', i.by_app) order by i.sort, i.name), '[]'::jsonb) from v2.learn_items i),
    'area_lines', (select coalesce(jsonb_agg(jsonb_build_object('id', ar.id, 'area', ar.area::text, 'item_id', ar.item_id, 'place', ar.place, 'required', ar.required, 'gate_prev', ar.gate_prev, 'sort', ar.sort, 'state', ar.state,
                                                                 'name', li.name, 'method', li.method, 'checks', li.checks, 'item_state', li.state, 'by_app', li.by_app) order by ar.area, ar.sort), '[]'::jsonb)
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

commit;

-- 표 모양이 바뀌었으니 API 쪽(PostgREST)의 기억도 새로 읽게 한다. 여러 번 돌려도 탈 없다.
notify pgrst, 'reload schema';
