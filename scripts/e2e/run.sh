#!/usr/bin/env bash
# 눌러보기 한 번에 — 받기 → 세우기 → 앱 빌드·띄우기 → 화면 검사(생기는 대로 아래에 더한다).
set -u
cd "$(dirname "$0")/../.."
APP_PORT=${E2E_APP_PORT:-3300}; API_PORT=55442
bash scripts/e2e/fetch.sh || exit 1
bash scripts/e2e/up.sh || exit 1
echo; echo "== 앱 띄우기 =="
pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f "next start -p $APP_PORT" 2>/dev/null; sleep 1
ANON="$(node scripts/e2e/token.mjs anon)"
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$API_PORT" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON" NEXT_TELEMETRY_DISABLED=1
npx next build --webpack > /var/tmp/e2e-build.log 2>&1 || { echo "  빌드 실패"; tail -30 /var/tmp/e2e-build.log; exit 1; }
npx next start -p "$APP_PORT" > /var/tmp/e2e-next.log 2>&1 &
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$APP_PORT/" >/dev/null && break; sleep 2; done
curl -sf "http://127.0.0.1:$APP_PORT/" >/dev/null || { echo "  앱이 안 떴습니다"; tail -20 /var/tmp/e2e-next.log; exit 1; }
echo "  떴습니다 :$APP_PORT"
# ── 화면 걷기 — 역할마다 로그인 · 비밀번호 바꾸기 문 · 권한 켜고 끄기 · 로그아웃 (쿠키 상태를 .tmp/state-principal.json 에 남긴다)
E2E_APP="http://127.0.0.1:$APP_PORT" node scripts/e2e/screens.mjs || exit 1
# ── 화면 검사 — 로그인한 채로 앱 화면을 치수·글꼴·대비 검사에 넣는다 (화면이 늘면 주소를 더한다)
export CHECK_STATE=.tmp/state-principal.json
export CHECK_URLS="http://127.0.0.1:$APP_PORT/login,http://127.0.0.1:$APP_PORT/,http://127.0.0.1:$APP_PORT/settings,http://127.0.0.1:$APP_PORT/settings/access"
node scripts/check-sizes.mjs || exit 1
node scripts/check-fonts.mjs || exit 1
node scripts/check-contrast.mjs || exit 1
echo; echo "눌러보기 끝. 내리려면 bash scripts/e2e/down.sh"
