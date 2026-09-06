-- 0116 — 서버 자신(service_role)의 표 권한
-- 왜: ⚠️ 실측(2026-09-06 눌러보기): 아이가 「출석」을 찍자 「등원 설정을 못 읽음: permission denied for table integration」.
--     service_role 은 v2 스키마 **usage 만** 있었다(0005) — 표 권한이 한 줄도 없다. RLS 를 지나치는 것(bypassrls)과 표를 만질 권한은 다른 것이다.
--     크론(lib/queue.js runDue)도 같은 자리에서 죽게 되어 있었다 — 아직 안 돌아 본 것뿐이다.
--     Supabase 는 public 스키마에만 기본 권한을 주므로 v2 는 여기서 직접 준다(규칙(정책)과 권한(GRANT)은 짝이다 — check-grants).
-- ⚠️ delete 는 안 준다(대전제-6 「지우지 않는다」 — 서버 자신도 예외가 아니다). 앞으로 세울 표에도 같은 권한이 저절로 붙게 기본 권한을 정한다.
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다.
grant usage on schema v2 to service_role;
grant select, insert, update on all tables in schema v2 to service_role;
grant usage, select on all sequences in schema v2 to service_role;
grant execute on all functions in schema v2 to service_role;
alter default privileges in schema v2 grant select, insert, update on tables to service_role;
alter default privileges in schema v2 grant usage, select on sequences to service_role;
alter default privileges in schema v2 grant execute on functions to service_role;
