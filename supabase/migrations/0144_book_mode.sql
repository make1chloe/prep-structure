-- 0144 (가)-⑥(9/8 새벽 — 남긴 것 20 「진행 방식」 세그 · 표 3번 기본 ㉰) — 교재의 **진행 방식** `books.mode`: unit 단원(기본) · passage 지문 · set 세트 · word 단어. 목업 15 고른 교재 머리의 「진행 방식 [단원 | 지문 | 세트 | 단어]」.
-- 교재마다 한 번 정하는 사실(배정 겹·도는 차례와 같은 자리) — 지금은 15 에 보이고 book_board 가 실어 나른다. 소단원의 이름을 지문·세트·Day 로 바꾸는 것은 다음(소비처가 넓다). 표는 새로 없다 — 멱등
alter table v2.books add column if not exists mode text not null default 'unit';
do $$ begin if not exists (select 1 from pg_constraint where conname = 'books_mode_choice') then
  alter table v2.books add constraint books_mode_choice check (mode in ('unit', 'passage', 'set', 'word'));   -- 표-6 · 새 칸이라 옛 줄도 기본값
end if; end $$;
comment on column v2.books.mode is '진행 방식(목업 15) — unit 단원(기본) · passage 지문 · set 세트 · word 단어. 교재마다 한 번(0144 · lib/book-plan MODE)';
-- book_board(0142) 다시 냄 — 목록·고른 교재에 mode 한 칸. 나머지는 0142 그대로
create or replace function v2.book_board(p_on date, p_book uuid) returns jsonb
language sql stable security definer set search_path = v2, public as $$
  with pick as (select coalesce(p_book, (select b.id from v2.books b where b.state = 'active' order by b.area, b.name limit 1)) bid)
  select jsonb_build_object(
    'today', p_on,
    'books', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'publisher', b.publisher, 'pub_year', b.pub_year, 'level', b.level,
                'chunk_depth', b.chunk_depth, 'order_basis', b.order_basis, 'unit_test', b.unit_test, 'mode', b.mode, 'state', b.state,
                'units', (select count(*) from v2.units u where u.book_id = b.id and u.state = 'active'),
                'students', (select count(distinct sb.student_id) from v2.student_book sb where sb.book_id = b.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
                'aliases', (select coalesce(jsonb_agg(a.alias order by a.alias), '[]'::jsonb) from v2.book_alias a where a.book_id = b.id)) order by b.state, b.area, b.name), '[]'::jsonb)
               from v2.books b),
    'book', (select jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'publisher', b.publisher, 'pub_year', b.pub_year, 'level', b.level, 'price', b.price, 'buy_url', b.buy_url,
               'chunk_depth', b.chunk_depth, 'order_basis', b.order_basis, 'unit_test', b.unit_test, 'mode', b.mode, 'state', b.state, 'import_batch', b.import_batch::text,
               'units', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'chapter', u.chapter, 'mid', u.mid, 'sub', u.sub, 'activity', u.activity, 'is_workbook', u.is_workbook, 'sort', u.sort,
                                                                     'page_start', u.page_start, 'page_end', u.page_end, 'q_count', u.q_count, 'q_range', u.q_range, 'gist', u.gist, 'state', u.state, 'batch', u.import_batch::text,
                                                                     'short', v2.unit_label(u.id, false)) order by u.sort), '[]'::jsonb) from v2.units u where u.book_id = b.id),
               'aliases', (select coalesce(jsonb_agg(jsonb_build_object('alias', a.alias, 'source', a.source) order by a.alias), '[]'::jsonb) from v2.book_alias a where a.book_id = b.id),
               'topics', (select coalesce(jsonb_agg(jsonb_build_object('unit_id', ut.unit_id, 'topic_id', ut.topic_id, 'name', gt.name)), '[]'::jsonb) from v2.unit_topic ut join v2.grammar_topics gt on gt.id = ut.topic_id join v2.units u on u.id = ut.unit_id where u.book_id = b.id),
               'students', (select coalesce(jsonb_agg(st.name order by st.name), '[]'::jsonb) from v2.student_book sb join v2.students st on st.id = sb.student_id where sb.book_id = b.id and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)),
               'usage', v2.book_usage(b.id, p_on))
              from v2.books b, pick where b.id = pick.bid),
    'topics_all', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.sort, t.name), '[]'::jsonb) from v2.grammar_topics t),
    'runs', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'tbl', x.tbl, 'sheet', x.sheet, 'note', x.note, 'at', x.at, 'undone_at', x.undone_at,
                'who', (select p.name from v2.profiles p where p.id = x.who),
                'n_insert', (select count(*) from v2.excel_row e where e.run_id = x.id and e.op = 'insert'),
                'n_update', (select count(*) from v2.excel_row e where e.run_id = x.id and e.op = 'update'),
                'n_delete', (select count(*) from v2.excel_row e where e.run_id = x.id and e.op = 'delete'),
                'can_undo', (x.undone_at is null and not exists (select 1 from v2.excel_run y where y.tbl = x.tbl and y.id > x.id and y.undone_at is null))) order by x.id desc), '[]'::jsonb)
             from (select * from v2.excel_run z where z.tbl in ('units', 'books') order by z.id desc limit 8) x)
  ) from pick where v2.is_staff()
$$;
