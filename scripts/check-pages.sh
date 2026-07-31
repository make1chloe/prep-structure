#!/bin/bash
# 화면이 열리는지 미리 잡아내는 검사
#
# `next build` 는 **문법과 import 만** 본다. 아래 두 가지는 빌드를 통과하고
# 화면을 열었을 때 비로소 터진다. 실제로 두 번 다 이걸로 당했다.
#
#   1) 선언 안 된 이름  — 리팩터링하다 변수를 지웠는데 쓰는 곳이 남은 경우
#                          (예: target 을 지웠는데 `target.getMonth()` 가 남음)
#   2) "use server" 파일에서 async 함수가 아닌 것을 export
#                          → "A 'use server' file can only export async functions"
#
# 쓰는 법:  bash scripts/check-pages.sh
set -u
cd "$(dirname "$0")/.."
fail=0

echo "== 1) 선언 안 된 이름 =="
cat > /tmp/.pagecheck-eslintrc.json <<'JSON'
{
  "root": true,
  "parserOptions": { "ecmaVersion": 2022, "sourceType": "module", "ecmaFeatures": { "jsx": true } },
  "env": { "es2022": true, "browser": true, "node": true },
  "rules": { "no-undef": "error" }
}
JSON
out=$(npx eslint --no-eslintrc -c /tmp/.pagecheck-eslintrc.json \
      'app/**/*.js' 'app/**/*.jsx' 'lib/**/*.js' 'components/**/*.jsx' 2>&1 \
      | grep "no-undef")
if [ -n "$out" ]; then echo "$out"; fail=1; else echo "  없음"; fi

echo
echo "== 2) \"use server\" 파일의 잘못된 export =="
bad=""
for f in $(grep -rl '^"use server"' app --include=*.js 2>/dev/null); do
  hit=$(grep -nE '^export (const|let|var|class)' "$f")
  [ -n "$hit" ] && bad="$bad\n  $f\n$(echo "$hit" | sed 's/^/     /')"
done
if [ -n "$bad" ]; then
  echo -e "$bad"
  echo "  → 상수는 별도 파일로 빼세요 (예: app/consult/status.js)"
  fail=1
else
  echo "  없음"
fi

echo
echo "== 3) 여러 줄 import 안에 끼어든 import =="
# import { 
#   import X from "..."   ← 이러면 빌드가 깨진다 (스크립트로 넣다 두 번 당했다)
mid=$(grep -rn -B1 '^import .* from' app lib components --include=*.js --include=*.jsx 2>/dev/null \
      | grep -A1 '^\S*-import {$' | grep ':import ' || true)
if [ -n "$mid" ]; then echo "$mid"; fail=1; else echo "  없음"; fi

echo
echo "== 4) SQL (진짜 Postgres 에 세 번 실행) =="
if [ -x scripts/check-sql.sh ]; then
  bash scripts/check-sql.sh || fail=1
else
  echo "  건너뜀"
fi

echo
echo "== 5) 학생이 열 수 있는 화면 =="
if out=$(node scripts/check-routes.mjs 2>/dev/null); then
  echo "$out"
else
  echo "$out"; fail=1     # 여기가 FAIL 로 잘못 적혀 있어서, 뚫려도 통과로 나왔다
fi

echo
echo "== 6) 학생 계정에 남의 것이 보이나 (진짜 Postgres) =="
# 화면을 막는 것과 데이터를 막는 것은 다른 이야기다. 5번은 화면, 여기는 데이터.
if [ -f scripts/check-leak.sh ]; then
  bash scripts/check-leak.sh || fail=1
else
  echo "  건너뜀"
fi
echo

echo "== 7) 빌드 =="
if npx next build >/tmp/.pagecheck-build.log 2>&1; then
  echo "  통과"
else
  tail -30 /tmp/.pagecheck-build.log
  fail=1
fi

echo
[ $fail -eq 0 ] && echo "✅ 전부 통과" || echo "❌ 위 항목을 고쳐주세요"
exit $fail
