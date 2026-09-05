#!/usr/bin/env bash
# **진짜로 눌러보는 자리를 세운다** — 옛 앱 scripts/e2e/up.sh 를 새 앱에 맞게 옮겼다.
#   Postgres  /usr/lib/postgresql/16 (깔려 있다)   :55440
#   PostgREST /tmp/postgrest (fetch.sh 가 받는다)   :55441   표를 HTTP 로 여는 부분
#   인증 흉내 scripts/e2e/auth.mjs                   :55442   앱은 자기가 진짜 Supabase 에 붙는 줄 안다
#   앱       npx next start                          :3300
# 표는 supabase/migrations/*.sql 을 **차례대로** 넣는다(실제 배포와 같은 길). 앱 코드에는 손대지 않는다.
set -u
cd "$(dirname "$0")/../.."
PG=/usr/lib/postgresql/16/bin; export PATH="$PG:$PATH"
D=/var/tmp/e2e-pg; PORT=55440; PGRST_PORT=55441; API_PORT=55442
SCHEMAS=${E2E_SCHEMAS:-v2}          # 새 앱도 v2 — 표는 하나
command -v initdb >/dev/null || { echo "postgres 가 없습니다"; exit 1; }
[ -s scripts/e2e/jwt-secret.txt ] || head -c 32 /dev/urandom | base64 | tr -d '\n=' | head -c 40 > scripts/e2e/jwt-secret.txt
[ -x /tmp/postgrest ] || { echo "PostgREST 가 없습니다 (bash scripts/e2e/fetch.sh 먼저)"; exit 1; }
echo "== Postgres =="
su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D -m immediate stop" >/dev/null 2>&1; pkill -9 -f "^$PG/postgres .*-p $PORT" 2>/dev/null; sleep 1   # pkill -f 는 명령줄 전체를 본다 — 실행 파일 경로로 못 박는다(우리 셸을 죽인 적 있다)
rm -rf "$D"; mkdir -p "$D"; chown postgres "$D"; chmod 700 "$D"
su postgres -c "PATH=$PG:\$PATH initdb -D $D -U postgres -A trust" >/dev/null 2>&1
# SSL 을 켠다 — 앱 검사(check-schema 따위)가 진짜 DB 처럼 ssl 로 붙는다. 데비안 기본 인증서(postgres 가 ssl-cert 그룹)
SSL=""; [ -r /etc/ssl/private/ssl-cert-snakeoil.key ] && SSL="-c ssl=on -c ssl_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem -c ssl_key_file=/etc/ssl/private/ssl-cert-snakeoil.key"
su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D -o '-p $PORT -k /var/tmp $SSL' -l $D/log -w start" >/dev/null 2>&1; sleep 1
Q="psql -h /var/tmp -p $PORT -U postgres -q"
$Q -c "create database chloe;" >/dev/null 2>&1
$Q -d chloe -v ON_ERROR_STOP=1 -f scripts/e2e/supabase-shim.sql >/dev/null 2>&1 || { echo "  흉내 스키마 실패"; $Q -d chloe -f scripts/e2e/supabase-shim.sql 2>&1 | tail -5; exit 1; }
echo "== 옛 앱 표 (public — 이관 마이그레이션이 읽는다, git main 에서) =="
# ⚠️ 새 앱의 이관 마이그레이션(0023~)은 옛 앱의 public.* 표를 읽는다. 실제 DB 에도 둘이 같이 있다.
git show main:supabase/SETUP_ALL.sql > /var/tmp/e2e-old.sql || { echo "  main 의 SETUP_ALL.sql 을 못 읽음"; exit 1; }
out=$($Q -d chloe -v ON_ERROR_STOP=1 -f /var/tmp/e2e-old.sql 2>&1 | grep -E "^psql.*(ERROR|치명적|오류):"); [ -n "$out" ] && { echo "$out" | head -3; exit 1; }
echo "  됐습니다"
echo "== 표 만들기 (supabase/migrations 차례대로) =="
# ⚠️ 0081_map_orphans 는 실제 DB 의 짝 없는 줄 19개를 단언하는 데이터 고침이라 빈 DB 에선 못 돈다 — 이름을 적어 건너뛴다(조용히 넘기지 않는다).
#    9000·9001 전환일 파일은 전환 전엔 안 돌린다 — 실제와 같다.
SKIP=${E2E_SKIP_MIGRATIONS:-"0081_map_orphans.sql"}
# 실제와 같은 길로 — scripts/_ap.mjs 가 돌리고 v2.migration 에 sha 를 적는다(check-migrations 가 그것을 본다)
files=""; skipped=""
for f in $(ls supabase/migrations/0*.sql | sort); do b=$(basename "$f"); case " $SKIP " in *" $b "*) skipped="$skipped $b";; *) files="$files $b";; esac; done
[ -n "$skipped" ] && echo "  ⏭$skipped (실제 데이터 단언 — 빈 DB 에선 못 돈다. check-migrations 가 이것 하나를 빨갛게 센다)"
out=$(DATABASE_URL="postgres://postgres@127.0.0.1:$PORT/chloe" node scripts/_ap.mjs $files 2>&1) || { echo "$out" | grep "❌" | head -5; exit 1; }
echo "  $(echo "$files" | wc -w)개 됐습니다 · $(echo "$out" | tail -1)"
# ⚠️ v2·v3 의 권한은 마이그레이션(0005·0017·0100)이 정한다 — 여기서 덧씌우지 않는다(check-grants 가 실제와 같은 것을 재야 한다). 흉내 낸 auth·storage·public 만 연다
$Q -d chloe -c "
grant usage on schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;" >/dev/null 2>&1
echo "== 리허설 계정 심기 =="
$Q -d chloe -v ON_ERROR_STOP=1 -f scripts/e2e/seed.sql 2>&1 | grep -E "^psql.*(ERROR|치명적|오류):" | head -5; echo "  됐습니다"
echo "== PostgREST =="
pkill -f "^/tmp/postgrest " 2>/dev/null; sleep 1
cat > /var/tmp/e2e-pgrst.conf <<CONF
db-uri = "postgres://postgres@/postgres?host=/var/tmp&port=$PORT&dbname=chloe"
db-schemas = "$SCHEMAS"
db-anon-role = "anon"
server-port = $PGRST_PORT
jwt-secret = "$(cat scripts/e2e/jwt-secret.txt)"
db-pre-request = "public.e2e_noop"
CONF
(/tmp/postgrest /var/tmp/e2e-pgrst.conf >/var/tmp/e2e-pgrst.log 2>&1 &)
for i in $(seq 1 15); do curl -sf "http://127.0.0.1:$PGRST_PORT/" >/dev/null && break; sleep 2; done
curl -sf "http://127.0.0.1:$PGRST_PORT/" >/dev/null || { echo "  안 떴습니다"; tail -10 /var/tmp/e2e-pgrst.log; exit 1; }
echo "  떴습니다 :$PGRST_PORT"
echo "== 인증 흉내 =="
pkill -f "^node scripts/e2e/auth.mjs" 2>/dev/null; sleep 1
E2E_PG_PORT=$PORT E2E_PGRST=$PGRST_PORT E2E_PORT=$API_PORT node scripts/e2e/auth.mjs >/var/tmp/e2e-auth.log 2>&1 &
sleep 2; curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null || { echo "  안 떴습니다"; tail -10 /var/tmp/e2e-auth.log; exit 1; }
echo "  떴습니다 :$API_PORT"
echo; echo "DB 검사도 여기로 돌릴 수 있다: DATABASE_URL=postgres://postgres@127.0.0.1:$PORT/chloe bash scripts/check-all.sh"
echo "다 섰습니다. 앱을 띄우려면 bash scripts/e2e/run.sh (또는 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$API_PORT NEXT_PUBLIC_SUPABASE_ANON_KEY=\$(node scripts/e2e/token.mjs anon) npx next dev -p 3300)"
