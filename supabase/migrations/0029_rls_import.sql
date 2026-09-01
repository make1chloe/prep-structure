-- 0029 · 이관 표에도 접근 규칙 — **검사가 잡았다**
-- ⚠️ `import_map` 에는 옛 학생 번호가 들어 있다. 아이가 보면 안 된다.
--    RLS 를 켜고 정책을 안 만들면 **원장님도 못 본다** — 둘 다 해야 한다.
do $$ declare t text; begin
  foreach t in array array['import_map','import_skip','area_map','import_check','stop_rule'] loop
    execute format('alter table v2.%I enable row level security', t);
    execute format('alter table v2.%I force row level security', t);
    begin
      execute format($f$create policy staff_all on v2.%I for all to authenticated
                        using (v2.is_staff()) with check (v2.is_staff())$f$, t);
    exception when duplicate_object then null; end;
  end loop;
end $$;
revoke insert, update, delete on v2.import_map, v2.import_skip, v2.area_map, v2.import_check
  from authenticated;
