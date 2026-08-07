#!/usr/bin/env bash
# **진짜로 눌러보는 자리를 세운다** (원장님, 2026-08-07 —
# 「크롬 연결되어있는데 왜 안돼 가짜 db 돌리고서 크롬 클릭하면되잖아」).
#
# ── 왜 이렇게까지 하나 ──────────────────────────────────────
#
# 지금까지의 검사는 **코드를 읽는 것**이었다. 그래서 「눌렀는데 아무 일도
# 안 일어난다」 류는 늘 원장님이 먼저 발견하셨다 — 버튼이 화면 밖에 있거나,
# 오류가 조용히 삼켜지거나, 판이 잠겨서 안 눌리거나.
#
# 진짜 브라우저로 눌러봐야 잡힌다. 그러려면 앱이 실제로 떠야 하고, 앱은
# Supabase 에 붙는다.
#
# ── 왜 Supabase 를 그대로 못 쓰나 ────────────────────────────
#
# `supabase start` 는 도커 이미지를 받아온다. 이 환경은 **컨테이너 이미지
# 내려받기가 막혀 있다** (레지스트리 셋 다 403). 그래서 조각을 직접 세운다.
#
#   Postgres    이미 깔려 있다 (SQL 검사가 쓰던 것)
#   PostgREST   내려받는다 — 표를 HTTP 로 여는 부분
#   인증        여기서 흉내 낸다 (scripts/e2e/auth.mjs)
#   Storage     없다 — 사진은 이 검사로 못 본다
#
# **앱 코드에는 손대지 않는다.** 테스트를 위한 구멍을 앱에 내면, 그 구멍이
# 실수로 켜진 채 배포되는 날이 온다. 앱은 자기가 진짜 Supabase 에 붙는 줄
# 알고 그대로 돈다.
set -u
cd "$(dirname "$0")/../.."
ROOT=$(pwd)

PG=/usr/lib/postgresql/16/bin
export PATH="$PG:$PATH"
D=/var/tmp/e2e-pg
PORT=55440
PGRST_PORT=55441
API_PORT=55442
APP_PORT=3300

command -v initdb >/dev/null || { echo "postgres 가 없습니다"; exit 1; }

# 열쇠는 저장소에 두지 않는다 — 없으면 여기서 만든다
[ -s scripts/e2e/jwt-secret.txt ] || \
  head -c 32 /dev/urandom | base64 | tr -d '\n=' | head -c 40 > scripts/e2e/jwt-secret.txt
[ -x /tmp/postgrest ] || { echo "PostgREST 가 없습니다 (scripts/e2e/fetch.sh 를 먼저)"; exit 1; }

echo "== Postgres =="
# **깨끗이 내리고 시작한다.** 앞 판이 아직 내려가는 중인데 initdb 를 하면
# 「the database system is shutting down」 으로 조용히 실패한다
su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D -m immediate stop" >/dev/null 2>&1
pkill -9 -f "postgres.*$PORT" 2>/dev/null
sleep 2
rm -rf "$D"; mkdir -p "$D"; chown postgres "$D"; chmod 700 "$D"
su postgres -c "PATH=$PG:\$PATH initdb -D $D -U postgres -A trust" >/dev/null 2>&1
su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D -o '-p $PORT -k /var/tmp' -l $D/log -w start" >/dev/null 2>&1
sleep 2
Q="psql -h /var/tmp -p $PORT -U postgres -q"
$Q -c "create database chloe;" >/dev/null 2>&1

# Supabase 가 만들어 두는 것들 — 우리 SQL 이 이것들을 전제로 쓴다
$Q -d chloe -f scripts/e2e/supabase-shim.sql >/dev/null 2>&1 || {
  echo "  흉내 스키마 실패"; $Q -d chloe -f scripts/e2e/supabase-shim.sql 2>&1 | tail -5; exit 1; }

echo "== 표 만들기 =="
out=$($Q -d chloe -v ON_ERROR_STOP=1 -f supabase/SETUP_ALL.sql 2>&1 | grep -E "^psql.*(ERROR|치명적):")
if [ -n "$out" ]; then echo "$out" | head -5; exit 1; fi
echo "  됐습니다"

# **Supabase 는 표를 만들면 자동으로 열어준다** — 로컬에는 그게 없다.
# 안 해주면 RLS 규칙을 보기도 전에 「permission denied」 로 막혀서,
# 화면이 통째로 비는 것을 「RLS 가 막았나」 로 잘못 읽게 된다.
$Q -d chloe -c "
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
" >/dev/null 2>&1

echo "== 학원 하나 심기 =="
$Q -d chloe -v ON_ERROR_STOP=1 -f scripts/e2e/seed.sql 2>&1 | grep -E "^psql.*(ERROR|치명적):" | head -5
echo "  됐습니다"

echo "== PostgREST =="
pkill -f "postgrest" 2>/dev/null
cat > /var/tmp/e2e-pgrst.conf <<CONF
db-uri = "postgres://postgres@/postgres?host=/var/tmp&port=$PORT&dbname=chloe"
db-schemas = "public"
db-anon-role = "anon"
server-port = $PGRST_PORT
jwt-secret = "$(cat scripts/e2e/jwt-secret.txt)"
db-pre-request = "public.e2e_noop"
CONF
(/tmp/postgrest /var/tmp/e2e-pgrst.conf >/var/tmp/e2e-pgrst.log 2>&1 &)
sleep 3
curl -sf "http://127.0.0.1:$PGRST_PORT/" >/dev/null || { echo "  안 떴습니다"; tail -10 /var/tmp/e2e-pgrst.log; exit 1; }
echo "  떴습니다 :$PGRST_PORT"

echo "== 인증 흉내 + 앞단 =="
pkill -f "e2e/auth.mjs" 2>/dev/null
E2E_PG_PORT=$PORT E2E_PGRST=$PGRST_PORT E2E_PORT=$API_PORT \
  node scripts/e2e/auth.mjs >/var/tmp/e2e-auth.log 2>&1 &
sleep 2
curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null || { echo "  안 떴습니다"; tail -10 /var/tmp/e2e-auth.log; exit 1; }
echo "  떴습니다 :$API_PORT"

echo
echo "다 섰습니다."
echo "  앱을 띄우려면:"
echo "    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$API_PORT \\"
echo "    NEXT_PUBLIC_SUPABASE_ANON_KEY=\$(node scripts/e2e/token.mjs anon) \\"
echo "    npx next dev -p $APP_PORT"
