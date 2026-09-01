-- ─────────────────────────────────────────────────────────────
-- 0020 · 고친 때 도장이 없는 표에 트리거를 걸어 두었다
-- ⚠️ 검사가 잡았다 — `units` 에 `updated_at` 칸이 없는데 `units_touch` 를 걸었다.
--    **그 표를 한 번도 고쳐 보지 않아서 아무도 몰랐다.** 실제로 쓰면 그 자리에서 터진다.
--    → 칸을 더하고, **트리거와 칸이 짝이 맞는지 보는 검사**를 만든다.
-- ─────────────────────────────────────────────────────────────
alter table v2.units add column if not exists updated_at timestamptz not null default now();
do $$ declare r record; begin
  for r in select c.relname t from pg_trigger g
    join pg_class c on c.oid=g.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='v2' and g.tgname like '%_touch' and not g.tgisinternal
      and not exists (select 1 from information_schema.columns col
                      where col.table_schema='v2' and col.table_name=c.relname
                        and col.column_name='updated_at')
  loop
    execute format('alter table v2.%I add column updated_at timestamptz not null default now()', r.t);
    raise notice '칸을 더했다: %', r.t;
  end loop;
end $$;
