-- ─────────────────────────────────────────────────────────────
-- 0030 · 영역에 「단어」를 더한다 (원장님 2026-09-02)
--
-- 실측 — 옛 앱에 **「단어」 교재가 23권**이고 6영역에 접을 데가 없어 보류였다.
-- → 영역이 **7개**가 된다: 문법 · 의미덩어리 · 독해 · 영작 · 내신 · 블록구문 · **단어**
--
-- ⚠️ **단어 영역 루틴이 아직 없다.** 원장님이 채우신 39줄은 6영역 것이다.
--    루틴이 없으면 그 교재는 배정이 0줄이 되므로, 아래 함수가 재촉한다.
-- ⚠️ 단어책은 **단어 진행**이다 — Day 40 에서 끝나면 40·1·2 로 **순환**한다
--    (`Day 40-2` 표기). 「대단원이 끝나면」 규칙이 여기엔 안 걸린다.
-- ─────────────────────────────────────────────────────────────
do $$ declare r record; begin
  for r in select conrelid::regclass t, conname c from pg_constraint
           where connamespace='v2'::regnamespace and contype='c'
             and pg_get_constraintdef(oid) like '%의미덩어리%'
  loop execute format('alter table %s drop constraint %I', r.t, r.c); end loop;
end $$;
alter table v2.books add constraint books_area_check
  check (area in ('문법','의미덩어리','독해','영작','내신','블록구문','단어'));
alter table v2.area_routine add constraint area_routine_area_check
  check (area in ('문법','의미덩어리','독해','영작','내신','블록구문','단어'));

update v2.area_map set new_area='단어', why=null where old_area='단어';

-- 그 23권에 영역을 붙인다
update v2.books b set area='단어'
where b.import_batch='import' and b.area is null
  and (select t.area from public.textbooks t where t.id=b.id) = '단어';

-- 영역은 있는데 **루틴이 없는** 자리 — 조용히 0줄이 되지 않게
create or replace function v2.areas_without_routine()
returns table (area text, books int)
language sql stable as $$
  select b.area, count(*)::int from v2.books b
  where b.area is not null and b.state <> 'stopped'
    and not exists (select 1 from v2.area_routine r where r.area = b.area)
  group by 1
$$;
comment on function v2.areas_without_routine is
  '⚠️ 루틴이 없는 영역의 교재는 **배정이 0줄**이 된다. 화면이 재촉한다';
grant execute on function v2.areas_without_routine() to authenticated;
