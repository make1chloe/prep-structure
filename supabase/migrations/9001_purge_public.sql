-- ═══════════════════════════════════════════════════════════════════════════
-- 9001 · D+30 · 옛 `public` 의 개인정보를 비운다
--
-- ⚠️⚠️ **이 줄을 밟는 순간 도메인 원복으로 되돌리는 길이 끝난다.** 되돌리기가 없다.
--
-- 왜 필요한가 — 전환일에 옛 앱은 **접근만** 닫혔다. 자료는 그대로 산다.
-- 같은 프로젝트를 쓰므로 DB 에는 v2 한 벌과 옛 public 한 벌이
-- **같은 아이의 이름·학부모 전화·상담일지·굳은 발송 글을 두 벌로** 들고 있다.
-- **지우는 날을 안 적으면 그 두 벌은 영구가 된다.**
--
-- ⚠️ 드롭이 아니라 **비식별화**다 — 이름·전화·굳은 글만 비우고 줄과 숫자는 남긴다.
--    옛 앱은 그 뒤 **이름 없는 통계 화면**이 된다.
--
-- 밟기 전 확인 두 줄:
--   □ 첫 주 매일 밤 대조가 끝났는가
--   □ 원장님이 「이제 옛 앱으로 안 돌아간다」를 확인했는가
--
-- 돌리는 법:  psql "$DATABASE_URL" -f supabase/migrations/9001_purge_public.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ **파기 목록의 `public` 줄을 돈다.** 여기 SQL 을 손으로 적지 않는다 —
--    적는 순간 목록과 두 벌이 되어, 목록에 줄을 더해도 여기는 안 돈다(원칙 1).
do $$
declare r record; n int; total int := 0;
begin
  if not exists (select 1 from v2.purge_map where schema_name = 'public') then
    raise exception '⚠️ 파기 목록에 public 줄이 하나도 없다 — 이 파일은 아무것도 안 지운다. '
                    '먼저 v2.purge_map 에 (schema_name=''public'', 표, 칸, 방법)을 채워라';
  end if;

  for r in select tbl, col, how from v2.purge_map where schema_name = 'public' order by tbl, col
  loop
    begin
      execute format(
        case r.how
          when 'null'  then 'update public.%I set %I = null where %I is not null'
          when 'blank' then 'update public.%I set %I = '''' where %I is not null and %I <> '''''
          when 'mask'  then 'update public.%I set %I = ''○○○'' where %I is not null'
          else 'update public.%I set %I = null where %I is not null'
        end, r.tbl, r.col, r.col, r.col);
      get diagnostics n = row_count;
      total := total + n;
      raise notice '  public.%.% — %줄 비움', r.tbl, r.col, n;
    exception when undefined_table or undefined_column then
      -- ⚠️ 옛 앱에 이미 없는 표·칸은 **넘어간다.** 여기서 던지면 나머지가 통째로 안 돈다
      raise warning '  public.%.% — 없다 (넘어감)', r.tbl, r.col;
    end;
  end loop;
  raise notice '■ 모두 %줄 비웠다', total;
end $$;
