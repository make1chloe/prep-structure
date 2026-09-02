-- ═══════════════════════════════════════════════════════════════════════════
-- 9001 · 옛 `public` 의 사람 정보를 비운다
--
-- 원장님 2026-09-02: **「옛날앱 파기는 계획 안 세우고 그냥 하면 돼. 그거 그냥 안 씀.」**
-- → 날짜를 못 박지 않는다(D+30 같은 것 없다). **전환하고 나면 아무 때나 돌린다.**
--
-- ⚠️⚠️ **딱 하나 지켜야 할 것 — 마지막 재적재가 끝난 뒤에 돌린다.**
--    이관이 옛 public 에서 값을 읽는다. 파기 목록의 표 중 **11개를 이관이 읽는다** —
--    profiles · students · attendance · inquiries · scores · score_items ·
--    student_notes · student_unit_progress · tasks · notices · daily_report_items.
--    먼저 지우면 **이름·전화·상담 글·결석 사유가 통째로 사라져 이관이 못 한다.**
--    아래 자물쇠가 그것을 막는다 — 9000(전환일 파일)을 안 돌렸으면 여기서 선다.
--
-- ⚠️ 드롭이 아니라 **비식별화**다 — 이름·전화·굳은 글만 비우고 줄과 숫자는 남긴다.
--    옛 앱은 그 뒤 **이름 없는 통계 화면**이 된다.
-- ⚠️ 되돌리기는 없다.
--
-- 돌리는 법:  psql "$DATABASE_URL" -f supabase/migrations/9001_purge_public.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ 자물쇠 — 전환(9000)을 안 했으면 안 돈다. 이관 원본을 먼저 지우는 것을 막는다
do $$
begin
  if not exists (select 1 from v2.migration where file = '9000_switch_day.sql') then
    raise exception '⚠️ 아직 전환 전이다 (9000_switch_day.sql 을 안 돌렸다). '
                    '지금 지우면 **이관이 읽을 원본이 사라진다** — 마지막 재적재를 먼저 끝내라';
  end if;
end $$;

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
