-- 0124 · 교재 · 단원 15 · 엑셀 올리기 15b — 학원 사람의 쓰기 권한(교재 · 다른 이름 · 단원 · 문법 분류 · 단원↔분류) · 분류 잇기 한 곳 · 「지우고 새로 올리기」 한 곳(정의자 — 진도가 걸려 있으면 못 지운다, 표가 막는다) · 쓰임 셈 · 교재 판 한 벌
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다.

-- ══ ① 쓰기 권한 — 규칙(staff_all)은 0009 에 있는데 권한이 없던 표들. 지우는 권한은 없다(대전제-6 · 단원 지우기는 restrict — 진도가 걸리면 못 지운다)
grant insert, update on v2.books, v2.book_alias, v2.units, v2.grammar_topics, v2.unit_topic to authenticated;

-- ══ ② 단원 ↔ 문법 분류 통째로 바꾸기(지우기 권한이 없어 정의자가 한다) — 학원 사람만
create or replace function v2.set_unit_topics(p_unit uuid, p_topics uuid[]) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int;
begin
  if not v2.is_staff() then raise exception '학원 사람만 문법 분류를 잇습니다'; end if;
  delete from v2.unit_topic where unit_id = p_unit;
  insert into v2.unit_topic (unit_id, topic_id) select distinct p_unit, t from unnest(coalesce(p_topics, '{}'::uuid[])) t on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
comment on function v2.set_unit_topics(uuid, uuid[]) is '단원 하나의 문법 분류를 통째로 바꾼다(단원평가의 「단원」 = 문법 분류, 원장님 ⑲). 학원 사람만';
grant execute on function v2.set_unit_topics(uuid, uuid[]) to authenticated, service_role;

-- ══ ③ 「② 지우고 새로 올리기」 — 이 교재의 단원을 다 지우고 파일 그대로. 진도·숙제·범위가 걸려 있으면 표(restrict)가 막아 통째로 실패한다(15b 의 ⚠️ 그대로)
create or replace function v2.replace_book_units(p_book uuid, p_rows jsonb, p_batch v2.batch default 'excel') returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int;
begin
  if not v2.is_staff() then raise exception '학원 사람만 단원을 올립니다'; end if;
  delete from v2.units where book_id = p_book;
  insert into v2.units (book_id, chapter, mid, sub, activity, is_workbook, sort, page_start, page_end, q_count, q_range, gist, state, import_batch)
    select p_book, r->>'chapter', nullif(r->>'mid', ''), nullif(r->>'sub', ''), coalesce(nullif(r->>'activity', ''), '본책'), coalesce((r->>'is_workbook')::boolean, false),
           coalesce((r->>'sort')::int, (row_number() over ())::int), nullif(r->>'page_start', '')::int, nullif(r->>'page_end', '')::int, nullif(r->>'q_count', '')::int, nullif(r->>'q_range', ''), nullif(r->>'gist', ''), 'active', p_batch
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r where coalesce(r->>'chapter', '') <> '';
  get diagnostics n = row_count;
  return n;
end $$;
comment on function v2.replace_book_units(uuid, jsonb, v2.batch) is '15b ② 지우고 새로 올리기 — 단원을 다 지우고 파일 그대로. 진도·숙제·범위가 걸린 단원은 restrict 가 막아 통째로 실패한다';
grant execute on function v2.replace_book_units(uuid, jsonb, v2.batch) to authenticated, service_role;

-- ══ ④ 교재 하나의 쓰임 — ②를 고르면 같이 사라질 것(단원 · 학생 진도 · 숙제 배정 · 시험 범위 · 쓰는 학생). 세어 나온다
create or replace function v2.book_usage(p_book uuid, p_on date) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  select jsonb_build_object(
    'units', (select count(*) from v2.units u where u.book_id = p_book),
    'progress', (select count(*) from v2.progress p join v2.units u on u.id = p.unit_id where u.book_id = p_book),
    'items', (select count(*) from v2.day_item i join v2.units u on u.id = i.unit_id where u.book_id = p_book),
    'scopes', (select count(*) from v2.prep_scope s where s.book_id = p_book),
    'students', (select count(distinct sb.student_id) from v2.student_book sb where sb.book_id = p_book and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on))
  ) where v2.is_staff()
$$;
grant execute on function v2.book_usage(uuid, date) to authenticated, service_role;

-- ══ ⑤ 교재 판 한 벌(속도-상한 일정 8 · 4단: 로그인 1 · 주소 인자 · 오늘 1 · 이것 1) — 교재 목록(단원 수 · 쓰는 아이 수 · 다른 이름) · 고른 교재(단원 전부 · 다른 이름 · 분류 · 쓰는 아이 · 쓰임) · 분류 목록. 학원 사람만
create or replace function v2.book_board(p_on date, p_book uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_book, (select b.id from v2.books b where b.state = 'active' order by b.area, b.name limit 1)) bid)
  select jsonb_build_object(
    'today', p_on,
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'publisher', b.publisher, 'pub_year', b.pub_year, 'level', b.level,
                'chunk_depth', b.chunk_depth, 'order_basis', b.order_basis, 'unit_test', b.unit_test, 'state', b.state,
                'units', (select count(*) from v2.units u where u.book_id = b.id and u.state = 'active'),
                'students', (select count(distinct sb.student_id) from v2.student_book sb where sb.book_id = b.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
                'aliases', (select coalesce(jsonb_agg(a.alias order by a.alias), '[]'::jsonb) from v2.book_alias a where a.book_id = b.id)) order by b.state, b.area, b.name), '[]'::jsonb)
               from v2.books b),
    'book', (select jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'publisher', b.publisher, 'pub_year', b.pub_year, 'level', b.level,
               'chunk_depth', b.chunk_depth, 'order_basis', b.order_basis, 'unit_test', b.unit_test, 'state', b.state, 'import_batch', b.import_batch::text,
               'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'chapter', u.chapter, 'mid', u.mid, 'sub', u.sub, 'activity', u.activity, 'is_workbook', u.is_workbook, 'sort', u.sort,
                                                                     'page_start', u.page_start, 'page_end', u.page_end, 'q_count', u.q_count, 'q_range', u.q_range, 'gist', u.gist, 'state', u.state, 'batch', u.import_batch::text,
                                                                     'short', v2.unit_label(u.id, false)) order by u.sort), '[]'::jsonb) from v2.units u where u.book_id = b.id),
               'aliases', (select coalesce(jsonb_agg(jsonb_build_object('alias', a.alias, 'source', a.source) order by a.alias), '[]'::jsonb) from v2.book_alias a where a.book_id = b.id),
               'topics', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', ut.unit_id, 'topic_id', ut.topic_id, 'name', gt.name)), '[]'::jsonb) from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id join v2.units u on u.id = ut.unit_id where u.book_id = b.id),
               'students', (select coalesce(jsonb_agg(st.name order by st.name), '[]'::jsonb) from v2.student_book sb join v2.students st on st.id = sb.student_id where sb.book_id = b.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
               'usage', v2.book_usage(b.id, p_on))
              from v2.books b, pick where b.id = pick.bid),
    'topics_all', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.sort, t.name), '[]'::jsonb) from v2.grammar_topics t)
  ) from pick where v2.is_staff()
$$;
comment on function v2.book_board(date, uuid) is '교재 15 가 읽는 한 벌 — 목록(단원 수 · 쓰는 아이 수 · 다른 이름) · 고른 교재(단원 전부 · 다른 이름 · 문법 분류 · 쓰는 아이 · 쓰임) · 분류 목록. 세는 것(N권 · 단원 없음 N · 활동 차례)은 화면이 센다';
grant execute on function v2.book_board(date, uuid) to authenticated, service_role;
