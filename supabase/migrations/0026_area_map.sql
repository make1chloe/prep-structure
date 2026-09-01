-- ─────────────────────────────────────────────────────────────
-- 0026 · 옛 영역 → 새 영역 접는 표
--
-- ⚠️ **제약이 이관을 막았다. 좋은 일이다** — 안 막았으면 「단어」·「듣기」가
--    그대로 들어와 영역이 8개가 됐고, 「루틴은 6벌」이 그 자리에서 깨졌다.
--
-- 실측 — 내신 46 · 독해 38 · 영작 24 · **단어 23** · 문법 22 · 빈칸 8 · **듣기 1**
-- v2 6영역 — 문법 · 의미덩어리 · 독해 · 영작 · 내신 · 블록구문
--
-- ⚠️ 「단어」·「듣기」·빈칸 **32권은 접을 데가 없다.** 임의로 접지 않는다 —
--    원장님이 정하실 자리다. **보류**로 세우고 화면이 재촉한다.
--    (계획: 「후보가 둘 이상이거나 없으면 그 줄을 보류로 세운다」)
-- ─────────────────────────────────────────────────────────────
create table v2.area_map (
  old_area text primary key,
  new_area text check (new_area in ('문법','의미덩어리','독해','영작','내신','블록구문')),
  why      text
);
insert into v2.area_map(old_area, new_area, why) values
  ('문법','문법',null), ('독해','독해',null), ('영작','영작',null), ('내신','내신',null),
  ('단어',   null, '⚠️ 6영역에 없다 — 원장님이 정하실 것 (23권)'),
  ('듣기',   null, '⚠️ 6영역에 없다 — 원장님이 정하실 것 (1권)')
on conflict (old_area) do nothing;
comment on table v2.area_map is
  '⚠️ 「의미덩어리」·「블록구문」은 옛 앱에 없다 — 원장님이 엑셀에서 정하신 것이라 **엑셀에서 온다**';

-- 영역이 안 붙은 교재는 **조용히 0줄이 되지 않게** 세워 둔다
create or replace function v2.books_without_area()
returns table (book_id uuid, name text, old_area text, why text)
language sql stable as $$
  select b.id, b.name, m.old_area,
         coalesce(m.why, '옛 앱에 영역이 비어 있었다')
  from v2.books b
  left join v2.area_map m on m.old_area = (select area from public.textbooks t where t.id=b.id)
  where b.area is null and b.state <> 'stopped'
$$;
comment on function v2.books_without_area is
  '⚠️ 영역이 없으면 **영역 루틴을 못 부른다** → 그 교재는 배정이 0줄이 된다.
   조용히 비우지 않고 「이 교재는 영역이 안 붙어 있다」로 재촉 목록에 세운다';
grant execute on function v2.books_without_area() to authenticated;
