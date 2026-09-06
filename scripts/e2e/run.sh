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
export SUPABASE_SERVICE_ROLE_KEY="$(node scripts/e2e/token.mjs service_role)"   # 서버 자신 — 아이의 등원이 판을 세울 때(lib/arrival.js) 쓴다
npx next build --webpack > /var/tmp/e2e-build.log 2>&1 || { echo "  빌드 실패"; tail -30 /var/tmp/e2e-build.log; exit 1; }
npx next start -p "$APP_PORT" > /var/tmp/e2e-next.log 2>&1 &
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$APP_PORT/" >/dev/null && break; sleep 2; done
curl -sf "http://127.0.0.1:$APP_PORT/" >/dev/null || { echo "  앱이 안 떴습니다"; tail -20 /var/tmp/e2e-next.log; exit 1; }
echo "  떴습니다 :$APP_PORT"
# ── 화면 걷기 — 역할마다 로그인 · 비밀번호 바꾸기 문 · 권한 켜고 끄기 · 로그아웃 (쿠키 상태를 .tmp/state-principal.json 에 남긴다)
E2E_APP="http://127.0.0.1:$APP_PORT" node scripts/e2e/screens.mjs || exit 1
E2E_APP="http://127.0.0.1:$APP_PORT" node scripts/e2e/today.mjs || exit 1
# ── 화면 검사 — 로그인한 채로 앱 화면을 치수·글꼴·대비 검사에 넣는다 (화면이 늘면 주소를 더한다)
export CHECK_STATE=.tmp/state-principal.json
export CHECK_URLS="http://127.0.0.1:$APP_PORT/login,http://127.0.0.1:$APP_PORT/,http://127.0.0.1:$APP_PORT/settings,http://127.0.0.1:$APP_PORT/settings/access,http://127.0.0.1:$APP_PORT/today,http://127.0.0.1:$APP_PORT/send,http://127.0.0.1:$APP_PORT/settings/routine,http://127.0.0.1:$APP_PORT/schedule,http://127.0.0.1:$APP_PORT/schedule/import,http://127.0.0.1:$APP_PORT/schedule/exams,http://127.0.0.1:$APP_PORT/scores,http://127.0.0.1:$APP_PORT/books,http://127.0.0.1:$APP_PORT/ops,http://127.0.0.1:$APP_PORT/schedule/todo,http://127.0.0.1:$APP_PORT/schedule/exams/prep,http://127.0.0.1:$APP_PORT/settings/progress"
node scripts/check-sizes.mjs || exit 1
node scripts/check-fonts.mjs || exit 1
node scripts/check-contrast.mjs || exit 1
# ── 아이 화면(07)은 아이 자격으로 — screens.mjs 가 남긴 아이 쿠키 상태로 연다
if [ -f .tmp/state-student.json ]; then
  export CHECK_STATE=.tmp/state-student.json CHECK_URLS="http://127.0.0.1:$APP_PORT/me,http://127.0.0.1:$APP_PORT/me/cal,http://127.0.0.1:$APP_PORT/me/book"
  node scripts/check-sizes.mjs || exit 1
  node scripts/check-fonts.mjs || exit 1
  node scripts/check-contrast.mjs || exit 1
fi
if [ -f .tmp/state-parent.json ]; then
  export CHECK_STATE=.tmp/state-parent.json CHECK_URLS="http://127.0.0.1:$APP_PORT/parent,http://127.0.0.1:$APP_PORT/parent/cal"
  node scripts/check-sizes.mjs || exit 1
  node scripts/check-fonts.mjs || exit 1
  node scripts/check-contrast.mjs || exit 1
fi
echo; echo "눌러보기 끝. 내리려면 bash scripts/e2e/down.sh"
