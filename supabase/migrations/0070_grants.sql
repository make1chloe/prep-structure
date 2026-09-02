-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️⚠️ **앱이 통째로 읽기 전용이었다.**
--
-- 실측 2026-09-02 — v2 의 표 **82개 중 56개**가 「쓰라는 규칙(정책)은 있는데 **권한이 없다**」.
-- 정책은 `staff_all ... for all` 로 열려 있는데 GRANT 가 SELECT 뿐이라
-- **출결·마감·부모님께 나갈 글·늦귀가·시험 점수·교재·루틴이 전부 permission denied** 였다.
--
-- 0005 가 처음에 적어 둔 그 함정이다 — 「규칙만 있고 권한이 없으면 아무도 못 본다. **둘 다** 있어야 한다」.
-- 0005·0017 이 그때 있던 26개에 권한을 줬고, **그 뒤에 만든 56개는 아무도 안 줬다.**
-- 화면을 처음 붙인 담당이 저장 단추를 눌러 보고 잡았다.
--
-- ⚠️ **delete 는 안 준다** — 대전제 6(지우지 않는다, 상태로 내린다). 0017 이 회수해 둔 것을 지킨다.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'v2' and c.relkind = 'r'
       -- 「쓰라는 규칙」이 있는 표만
       and exists (select 1 from pg_policies p where p.schemaname = 'v2'
                    and p.tablename = c.relname and p.cmd in ('ALL','INSERT','UPDATE'))
       -- ⚠️ **아래 넷은 사람이 쓰면 안 된다** (아래에서 규칙 자체를 읽기로 조인다)
       and c.relname not in ('audit','import_map','import_skip','import_check')
  loop
    execute format('grant insert, update on v2.%I to authenticated', t);
    execute format('revoke delete on v2.%I from authenticated', t);
  end loop;
end $$;

-- ⚠️ 감사 기록에 **사람이 쓸 수 있으면 감사가 아니다.** 트리거(security definer)만 쓴다.
drop policy if exists staff_all on v2.audit;
create policy staff_read on v2.audit for select to authenticated using (v2.is_staff());
comment on table v2.audit is
  '누가 언제 어느 줄을 무엇으로 바꿨나 — 한 번의 바뀜이 한 줄. '
  '⚠️ 사람은 **읽기만** 한다. 쓰는 것은 트리거(v2.audit_row)뿐이다';

-- ⚠️ 이관 표는 **이관 스크립트(service_role)만** 쓴다. 사람이 고치면 대조가 뜻을 잃는다.
do $$ declare t text; begin
  foreach t in array array['import_map','import_skip','import_check'] loop
    execute format('drop policy if exists staff_all on v2.%I', t);
    execute format('create policy staff_read on v2.%I for select to authenticated using (v2.is_staff())', t);
  end loop;
end $$;
