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

# **포트로 죽인다.** `next start` 는 뜨고 나면 이름이 `next-server` 로
# 바뀌어서, 명령줄로 찾으면 안 잡힌다. 안 죽은 앞 판이 옛 화면을 그대로
# 내주면 새로 만든 조각과 짝이 안 맞아 400 이 난다 — 실제로 그렇게 걸렸다.
killport() {
  # `next start` 는 뜨고 나면 이름이 `next-server` 로 바뀐다 — 명령줄에서
  # 「next start -p 3300」 을 찾으면 안 잡힌다. 둘 다 찾는다.
  # (pkill 은 자기 자신은 안 죽인다)
  pkill -9 -f "next-server" 2>/dev/null
  pkill -9 -f "next start -p $1" 2>/dev/null
  pkill -9 -f "next dev -p $1" 2>/dev/null
  sleep 2
}

# **끝났다고 내리지 않는다.**
#
# 처음에는 EXIT 에서 Postgres·PostgREST 를 내렸다. 그런데 앞서 죽은 판의
# 뒷정리가 늦게 돌면서 **이번에 막 띄운 Postgres 를 내려버리는** 일이
# 생겼다 — 그러면 PostgREST 가 못 붙고, 앱 잘못이 아닌 것으로 검사가
# 빨개진다. 검사를 못 믿게 되면 검사가 없는 것보다 나쁘다.
#
# 뒷정리는 up.sh 가 **시작할 때** 한다 (그때는 무엇을 내리는지 분명하다).
# 다 끝내고 치우시려면: bash scripts/e2e/down.sh

bash scripts/e2e/fetch.sh || exit 1
bash scripts/e2e/up.sh || exit 1

echo
echo "== 앱 띄우기 =="
killport "$APP_PORT"

# **개발 모드로 띄운다.**
#
# 배포판(`next build && next start`)으로도 해봤는데, 앞 판이 안 죽고 남아
# 옛 화면을 내주면 새로 만든 조각과 짝이 안 맞아 **400 + ChunkLoadError** 가
# 났다. 검사가 앱 잘못이 아닌 것으로 빨개지면 아무도 안 믿게 된다.
#
# 개발 모드는 조각 이름을 안 박아두므로 그 일이 없다. 대신 개발 모드에만
# 나는 소리가 섞이는데, 그건 click.mjs 에서 이름을 적어 걸러낸다.
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
E2E_APP="http://127.0.0.1:$APP_PORT" node scripts/e2e/click.mjs || exit $?

# **설문지에서 상담 목록까지 값이 닿는가** (0114).
#   「기타」 뒤에 적어주신 글은 저장은 잘 되고 있었는데 상담 화면이 잃고
#   있었다. 넣고 → 보고 → 수정창을 열어보는 데까지 가야 잡힌다.
echo
E2E_APP="http://127.0.0.1:$APP_PORT" node scripts/e2e/apply-other.mjs || exit $?

# **학교 홈페이지에서 가져오기** (2026-08-11). 붙여넣은 표를 그대로 읽는지,
# 나이스를 못 물어봤을 때 「다 있습니다」 라고 하지 않는지 — 화면으로 본다.
echo
OUT=/var/tmp node scripts/e2e/homepage-shot.mjs
exit $?
