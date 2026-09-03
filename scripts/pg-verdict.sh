#!/usr/bin/env bash
# 검사가 끝난 뒤 **무엇이라고 말하고 어떤 코드로 끝낼까** — 그 판정 한 곳.
#
# ── 왜 따로 뗐나 (2026-09-03) ────────────────────────────────
#   이 판정이 check-pages.sh 맨 끝에 박혀 있어서, 「건너뛰었는데 0 으로 끝난다」를
#   확인하려면 검사 63개를 다 돌려야 했다(몇 분). 그래서 아무도 확인 안 했고
#   실제로 **일곱을 안 돌리고도 0 으로 끝나고 있었다.**
#   따로 떼면 검사(scripts/check-skip.sh)가 이 한 파일만 여러 번 돌려 볼 수 있다.
#
# 쓰는 법:  bash scripts/pg-verdict.sh <실패개수>      (PGSKIP_FILE 을 읽는다)
set -u
fail=${1:-0}

skipped=$(grep -c . "${PGSKIP_FILE:-/dev/null}" 2>/dev/null || true)
skipped=${skipped:-0}

if [ "$skipped" -gt 0 ]; then
  echo "⚠️  진짜 Postgres 가 없어 ${skipped}가지를 **건너뛰었습니다** (통과가 아닙니다):"
  sed 's/^/     · /' "$PGSKIP_FILE"
  echo "     맥이면 한 번만:  brew install postgresql@16"
  echo
fi

if [ "$fail" -ne 0 ]; then
  echo "❌ 위 항목을 고쳐주세요"
elif [ "$skipped" -gt 0 ]; then
  echo "⚠️  돌린 것은 다 통과 — 다만 위 ${skipped}가지는 **안 돌았습니다** (통과가 아닙니다)"
else
  echo "✅ 전부 통과"
fi

# ❌ 인데 종료코드 0 으로 끝나서 && 뒤의 push 가 나가버렸다 (2026-08-17).
# 검사를 믿을 수 없으면 없는 것보다 나쁘다 — 실패는 실패 코드로 끝난다.
#
# ⚠️⚠️ **건너뜀도 마찬가지다** (2026-09-03).
#   화면에는 「안 돌았습니다」라고 정직하게 적어 놓고 종료코드는 0 을 줬다.
#   그래서 `bash scripts/check-pages.sh && git push` 처럼 걸어 두면
#   **RLS 검사 일곱을 한 번도 안 돌리고 그대로 나간다.** 같은 병인데 그때 교훈이
#   실패에만 걸리고 건너뜀에는 안 걸려 있었다.
#   → 안 돈 것이 있으면 **0 을 주지 않는다.** 정말 넘기려면 `PGSKIP_OK=1` 을 손으로 붙인다.
if [ "$fail" -eq 0 ] && [ "$skipped" -gt 0 ] && [ "${PGSKIP_OK:-}" != "1" ]; then
  echo "   (정말 넘기시려면:  PGSKIP_OK=1 bash scripts/check-pages.sh)"
  exit 2
fi
exit "$fail"
