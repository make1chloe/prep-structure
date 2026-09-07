-- 0142 5단계-④(9/7 밤) — 15b 「묶음 번호로 되돌릴 수 있습니다」: 엑셀 올리기(단원 시트 · 교재 시트)가 0057 의 묶음(excel_run)·줄(excel_row)을 **적고**,
-- 묶음 하나를 SQL 한 곳(undo_excel_run)이 **통째로** 되돌린다. 목업 15b 맨 아래 줄 · 남긴 것 20(4단계-4 에서 봤다: 올리기가 묶음을 안 적어 되돌릴 단위가 없었다).
-- ① excel_row.op 에 delete — 15b ②(지우고 새로 올리기)만 적는다. before 에 지운 줄 전체가 있어 되돌리면 **같은 id 로 되살린다**(대전제-6: 지운 것도 자료가 남는다).
--    단원 시트의 ①(덮어쓰기)·교재 시트는 insert·update 만 적는다(엑셀에서 줄을 지워도 앱에서는 안 지워진다 — 그대로).
alter table v2.excel_row drop constraint if exists excel_row_op_check;
alter table v2.excel_row add constraint excel_row_op_check check (op in ('insert', 'update', 'delete'));
comment on column v2.excel_row.op is
  'insert · update · delete. ⚠️ delete 는 15b ②(지우고 새로 올리기)가 지운 단원만 — 엑셀에서 줄을 지워도 앱에서는 안 지워진다(대전제 6 · 규칙 9). before 에 줄 전체가 있어 되돌리면 같은 id 로 되살린다(0142)';

-- ② 지우고 새로 올리기가 묶음(p_run)을 받으면 지운 줄(before = 줄 전체)과 새 줄을 excel_row 에 적는다 — 한 트랜잭션(0-4).
--    옛 세 인자 꼴은 걷는다(PostgREST 가 둘 중 하나를 못 고른다).
drop function if exists v2.replace_book_units(uuid, jsonb, v2.batch);
create or replace function v2.replace_book_units(p_book uuid, p_rows jsonb, p_batch v2.batch default 'excel', p_run bigint default null) returns int
language plpgsql security definer set search_path = v2, public as $$
declare n int;
begin
  if not v2.is_staff() then raise exception '학원 사람만 단원을 올립니다'; end if;
  if p_run is not null then
    insert into v2.excel_row (run_id, tbl, row_id, op, before)
      select p_run, 'units', u.id::text, 'delete', to_jsonb(u) from v2.units u where u.book_id = p_book order by u.sort;
  end if;
  delete from v2.units where book_id = p_book;
  with ins as (
    insert into v2.units (book_id, chapter, mid, sub, activity, is_workbook, sort, page_start, page_end, q_count, q_range, gist, state, import_batch)
      select p_book, r->>'chapter', nullif(r->>'mid', ''), nullif(r->>'sub', ''), coalesce(nullif(r->>'activity', ''), '본책'), coalesce((r->>'is_workbook')::boolean, false),
             coalesce((r->>'sort')::int, (row_number() over ())::int), nullif(r->>'page_start', '')::int, nullif(r->>'page_end', '')::int, nullif(r->>'q_count', '')::int, nullif(r->>'q_range', ''), nullif(r->>'gist', ''), 'active', p_batch
        from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r where coalesce(r->>'chapter', '') <> ''
      returning id)
  insert into v2.excel_row (run_id, tbl, row_id, op)
    select p_run, 'units', i.id::text, 'insert' from ins i where p_run is not null;
  select count(*)::int into n from v2.units u where u.book_id = p_book;
  return n;
end $$;
comment on function v2.replace_book_units(uuid, jsonb, v2.batch, bigint) is
  '15b ② 지우고 새로 올리기 — 단원을 다 지우고 파일 그대로. 진도·숙제·범위가 걸린 단원은 restrict 가 막아 통째로 실패한다. p_run 을 주면 지운 줄(before = 줄 전체)·새 줄을 excel_row 에 적어 되돌릴 수 있다(0142)';
grant execute on function v2.replace_book_units(uuid, jsonb, v2.batch, bigint) to authenticated, service_role;

-- ③ 묶음 하나 되돌리기 — 한 곳. 줄을 **거꾸로**(늦게 적힌 것부터) 밟는다:
--    update → before 로 · insert → 지운다(진도·숙제·분류가 걸려 못 지우면 숨김/안 씀으로 내린다 — 지우지 않는다) · delete → 같은 id 로 되살린다(같은 열쇠의 줄이 살아 있으면 그 줄을 before 내용으로).
--    막는 것: 이미 되돌린 묶음 · 같은 표에 **뒤에 올린 묶음이 살아 있으면**(그것부터) · before 가 비워진 묶음(0087 파기 — 90일).
create or replace function v2.undo_excel_run(p_run bigint) returns jsonb
language plpgsql security definer set search_path = v2, public as $$
declare run v2.excel_run; r record; later bigint; k int; live uuid; u v2.units; b v2.books;
        restored int := 0; removed int := 0; hidden int := 0; revived int := 0;
begin
  if not v2.is_staff() then raise exception '학원 사람만 되돌립니다'; end if;
  select * into run from v2.excel_run x where x.id = p_run for update;
  if run.id is null then raise exception '묶음이 없습니다: #%', p_run; end if;
  if run.undone_at is not null then raise exception '#% 은 이미 되돌린 묶음입니다', p_run; end if;
  if run.tbl not in ('units', 'books') then raise exception '이 묶음(%)은 여기서 못 되돌립니다', run.tbl; end if;
  select min(x.id) into later from v2.excel_run x where x.tbl = run.tbl and x.id > p_run and x.undone_at is null;
  if later is not null then raise exception '뒤에 올린 묶음 #% 을 먼저 되돌리세요', later; end if;
  if exists (select 1 from v2.excel_row x where x.run_id = p_run and x.op in ('update', 'delete') and x.before is null) then
    raise exception '되돌리기 자료(바꾸기 전 값)가 비워져 있습니다 — 90일이 지난 묶음은 못 되돌립니다';
  end if;
  for r in select * from v2.excel_row x where x.run_id = p_run order by x.id desc loop
    if r.tbl = 'units' then
      if r.op = 'update' then
        u := jsonb_populate_record(null::v2.units, r.before);
        update v2.units t set chapter = u.chapter, mid = u.mid, sub = u.sub, activity = u.activity, is_workbook = u.is_workbook, sort = u.sort,
                              page_start = u.page_start, page_end = u.page_end, q_count = u.q_count, q_range = u.q_range, gist = u.gist, state = u.state, import_batch = u.import_batch
         where t.id = r.row_id::uuid;
        get diagnostics k = row_count; restored := restored + k;
      elsif r.op = 'insert' then
        begin
          delete from v2.units t where t.id = r.row_id::uuid;
          get diagnostics k = row_count; removed := removed + k;
        exception when foreign_key_violation then
          update v2.units t set state = 'hidden' where t.id = r.row_id::uuid; hidden := hidden + 1;
        end;
      elsif r.op = 'delete' then
        u := jsonb_populate_record(null::v2.units, r.before);
        select t.id into live from v2.units t where t.book_id = u.book_id and t.chapter = u.chapter and t.mid is not distinct from u.mid and t.sub is not distinct from u.sub and t.activity = u.activity limit 1;
        if live is not null then
          update v2.units t set is_workbook = u.is_workbook, sort = u.sort, page_start = u.page_start, page_end = u.page_end, q_count = u.q_count, q_range = u.q_range, gist = u.gist, state = u.state, import_batch = u.import_batch
           where t.id = live;
        else
          insert into v2.units select * from jsonb_populate_record(null::v2.units, r.before);
        end if;
        revived := revived + 1;
      end if;
    elsif r.tbl = 'books' then
      if r.op = 'update' then
        b := jsonb_populate_record(null::v2.books, r.before);
        update v2.books t set code = b.code, name = b.name, area = b.area, publisher = b.publisher, pub_year = b.pub_year, level = b.level, price = b.price, buy_url = b.buy_url
         where t.id = r.row_id::uuid;
        get diagnostics k = row_count; restored := restored + k;
      elsif r.op = 'insert' then
        begin
          delete from v2.books t where t.id = r.row_id::uuid;
          get diagnostics k = row_count; removed := removed + k;
        exception when foreign_key_violation then
          update v2.books t set state = 'stopped' where t.id = r.row_id::uuid; hidden := hidden + 1;
        end;
      end if;
    end if;
  end loop;
  update v2.excel_run x set undone_at = now() where x.id = p_run;
  return jsonb_build_object('run', p_run, 'tbl', run.tbl, 'restored', restored, 'removed', removed, 'hidden', hidden, 'revived', revived);
end $$;
comment on function v2.undo_excel_run(bigint) is
  '15b 묶음 하나 되돌리기(0142) — 줄을 거꾸로 밟는다: update → before · insert → 지움(걸려 있으면 숨김/안 씀) · delete → 같은 id 로 되살림. 같은 표의 뒤 묶음이 살아 있으면 그것부터 · before 가 비워졌으면(90일) 못 한다';
grant execute on function v2.undo_excel_run(bigint) to authenticated, service_role;

-- ④ 교재 판에 「올린 묶음」 — 최근 8개(단원·교재 시트) · 되돌릴 수 있나는 SQL 이 정한다(같은 표의 마지막 살아 있는 묶음만 — 화면이 다시 세지 않는다)
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
    'book', (select jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'area', b.area::text, 'publisher', b.publisher, 'pub_year', b.pub_year, 'level', b.level, 'price', b.price, 'buy_url', b.buy_url,
               'chunk_depth', b.chunk_depth, 'order_basis', b.order_basis, 'unit_test', b.unit_test, 'state', b.state, 'import_batch', b.import_batch::text,
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
comment on function v2.book_board(date, uuid) is '교재 15 가 읽는 한 벌 — 목록(단원 수 · 쓰는 아이 수 · 다른 이름) · 고른 교재(단원 전부 · 다른 이름 · 문법 분류 · 쓰는 아이 · 쓰임) · 분류 목록 · 올린 묶음 8(되돌릴 수 있나는 여기서 정한다 — 0142). 세는 것(N권 · 단원 없음 N · 활동 차례)은 화면이 센다';
grant execute on function v2.book_board(date, uuid) to authenticated, service_role;
