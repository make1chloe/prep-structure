#!/usr/bin/env bash
# **한 번에 다 돌린다** — 세우고 · 띄우고 · 눌러보고 · 내린다.
#
# 쓰는 법:  bash scripts/e2e/run.sh
#
# 오래 걸린다 (표를 새로 만들고 앱을 처음부터 띄운다). 평소 검사
# (scripts/check-pages.sh) 와 따로 두는 이유가 그것이다 — 그쪽은 몇 초면
# 끝나야 자꾸 돌리게 된다.
set -u
cd "$(dirname "$0")/../.."

APP_PORT=${E2E_APP_PORT:-3300}
API_PORT=55442

down() {
  pkill -f "next dev -p $APP_PORT" 2>/dev/null
  pkill -f "e2e/auth.mjs" 2>/dev/null
  pkill -f "postgrest" 2>/dev/null
  su postgres -c "PATH=/usr/lib/postgresql/16/bin:\$PATH pg_ctl -D /var/tmp/e2e-pg -m immediate stop" >/dev/null 2>&1
}
trap down EXIT

bash scripts/e2e/fetch.sh || exit 1
bash scripts/e2e/up.sh || exit 1

echo
echo "== 앱 띄우기 =="
pkill -f "next dev -p $APP_PORT" 2>/dev/null
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$API_PORT" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$(node scripts/e2e/token.mjs anon)" \
  npx next dev -p "$APP_PORT" > /var/tmp/e2e-next.log 2>&1 &

# **떴는지 확인하고 나서 누른다.** 안 그러면 「안 열립니다」 가 우수수 뜨는데
# 그건 화면 잘못이 아니라 아직 안 뜬 것이다
for i in $(seq 1 60); do
  curl -sf "http://127.0.0.1:$APP_PORT/login" >/dev/null && break
  sleep 2
done
curl -sf "http://127.0.0.1:$APP_PORT/login" >/dev/null || {
  echo "  앱이 안 떴습니다"; tail -20 /var/tmp/e2e-next.log; exit 1; }
echo "  떴습니다 :$APP_PORT"

echo
E2E_APP="http://127.0.0.1:$APP_PORT" node scripts/e2e/click.mjs
exit $?
