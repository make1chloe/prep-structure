#!/usr/bin/env bash
# 새 앱 검사 — 한 번에 돈다.
# ⚠️ 옛 앱의 함정: 검사 목록이 **손으로 나열**되어 있어 등록을 빠뜨리면 안 돌았다.
#    여기서는 `scripts/check-*.mjs` 를 **훑어서** 돌린다. 새로 만들면 저절로 들어온다.
set -u
cd "$(dirname "$0")/.." || exit 1
pass=0; fail=0; failed=()
echo "■ 새 앱 검사  (scripts/check-*.mjs 를 훑어서 돈다 — 새로 만들면 저절로 들어온다)"
for f in scripts/check-*.mjs; do
  [ -e "$f" ] || continue
  name=$(basename "$f" .mjs)
  if out=$(node "$f" 2>&1); then
    echo "   ✅ $name"; pass=$((pass+1))
  else
    echo "   ❌ $name"; echo "$out" | tail -12 | sed 's/^/        /'
    fail=$((fail+1)); failed+=("$name")
  fi
done
# ⚠️ 빌드도 검사다 — 계획의 `check-pages.sh` 는 「검사 N종 **+ 빌드**」였다.
#    빌드가 깨진 채로 초록을 보면 그날 배포가 안 나간다.
if [ "${SKIP_BUILD:-}" != "1" ]; then
  if out=$(npx next build --webpack 2>&1); then
    echo "   ✅ 빌드"; pass=$((pass+1))
  else
    echo "   ❌ 빌드"; echo "$out" | tail -15 | sed 's/^/        /'
    fail=$((fail+1)); failed+=("빌드")
  fi
fi

echo
echo "■ 합계 — 통과 $pass · 실패 $fail"
[ $fail -eq 0 ] || { echo "   실패: ${failed[*]}"; exit 1; }
echo
echo "■ 옛 앱 보고 (검사가 아니다 — 옛 앱은 동결이라 못 고친다)"
echo "   node scripts/report-old-rls.mjs      접근 규칙 — ⚠️ 사고 #7 (마감 술어 없음) 이 여기서 뜬다"
echo "   node scripts/report-old-rls-all.mjs  표 85개 전수"
