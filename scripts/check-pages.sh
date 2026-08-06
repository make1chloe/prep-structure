#!/bin/bash
# 화면이 열리는지 미리 잡아내는 검사
#
# `next build` 는 **문법과 import 만** 본다. 아래 것들은 빌드를 통과하고
# 화면을 열었을 때 비로소 터진다. 실제로 두 번 다 이걸로 당했다.
#
#   1) 선언 안 된 이름  — 리팩터링하다 변수를 지웠는데 쓰는 곳이 남은 경우
#                          (예: target 을 지웠는데 `target.getMonth()` 가 남음)
#   2) 없는 함수를 불러다 쓰는 곳 — 빌드는 통과하고 그 버튼을 누를 때 터진다
#   3) "use server" 파일에서 async 함수가 아닌 것을 export
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
echo "== 4) 없는 함수를 불러다 쓰는 곳 =="
# 빌드는 통과하고, 그 버튼을 누르는 순간 터진다. 실제로 「교재 배정」이 그랬다.
if out=$(node scripts/check-imports.mjs 2>&1); then echo "$out"; else echo "$out"; fail=1; fi

echo
echo "== 5) SQL (진짜 Postgres 에 세 번 실행) =="
if [ -x scripts/check-sql.sh ]; then
  bash scripts/check-sql.sh || fail=1
else
  echo "  건너뜀"
fi

echo
echo "== 5-2) 신규 문의 옮기기 파서 =="
# 노션 방문상담목록DB 는 **한 번만 옮긴다.** 틀리면 다음 기회가 없어서
# (원장님이 노션을 지우시면 원본이 사라진다) 실제 파일의 모양을 못 박아 둔다
if out=$(node scripts/check-inquiry.mjs 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|eliminate this\|trace-warnings"); then
  echo "$out" | tail -1
else
  echo "$out"; fail=1
fi

echo
echo "== 5-3) 성적 옮기기 · 리포트 계산 =="
# 리포트는 상담 중에 펴놓고 학부모께 설명하시는 화면이다 — 숫자가 틀리면
# 그 자리에서 곤란해지신다. 실제 자료에서 부딪힌 것을 못 박아 둔다
if out=$(node scripts/check-report.mjs 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|eliminate this\|trace-warnings"); then
  echo "$out" | tail -1
else
  echo "$out"; fail=1
fi

echo
echo "== 5-4) 단원 엑셀 (분량 · 내용) =="
# 교재마다 「분량」 을 말하는 방식이 다르다 — 하나를 놓치면 그 교재는
# 화면에서 분량을 알 수 없게 되고, 숙제를 얼마나 낼지 못 정하신다
if out=$(node scripts/check-unit.mjs 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|eliminate this\|trace-warnings"); then
  echo "$out" | tail -1
else
  echo "$out"; fail=1
fi

echo
echo "== 5-5) 출제분석 =="
# 「교과서에서 60% 나왔다」 가 틀리면 한 학기 공부 방향이 틀어진다.
# 「몇 명 중 몇 명」 은 사람 수를 잘못 세면 곧바로 거짓말이 된다
if out=$(node scripts/check-analysis.mjs 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|eliminate this\|trace-warnings"); then
  echo "$out" | tail -1
else
  echo "$out"; fail=1
fi

echo
echo "== 5-5-2) 특강 기한이 달력까지 닿나 =="
# 계산은 진작 맞았는데 **자료가 안 와서** 종강한 특강이 계속 수업하고 있었다.
# 계산만 보는 검사로는 영원히 못 잡는다 — 화면이 기간 칸을 읽는지도 같이 본다
if out=$(node scripts/check-classterm.mjs 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|eliminate this\|trace-warnings"); then
  echo "$out" | tail -1
else
  echo "$out"; fail=1
fi

echo
echo "== 5-6) 한 달 살아보기 (진짜 Postgres · 원장·학생·학부모 셋의 눈) =="
# 계산만 돌리는 시뮬레이션으로는 못 잡는 것이 있다 — 읽기 규칙 때문에 화면이
# 통째로 비는 것, 한 달 치가 쌓여야 보이는 것. 오래 걸려서 마지막 줄만 남긴다
if out=$(node scripts/live-month.mjs 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|eliminate this\|trace-warnings"); then
  echo "$out" | grep -E "걸린 곳|걸리는 곳" | tail -1
  echo "$out" | grep -A2 "^[0-9]\+\. \[" | head -20
else
  echo "$out" | tail -20; fail=1
fi

echo
echo "== 6) 옛 자료가 새 모양으로 옮겨지나 (진짜 Postgres) =="
if [ -f scripts/check-exam-merge.sh ]; then
  bash scripts/check-exam-merge.sh || fail=1
else
  echo "  건너뜀"
fi
echo

echo "== 7) 학생이 열 수 있는 화면 =="
if out=$(node scripts/check-routes.mjs 2>/dev/null); then
  echo "$out"
else
  echo "$out"; fail=1     # 여기가 FAIL 로 잘못 적혀 있어서, 뚫려도 통과로 나왔다
fi


echo "  기계가 부르는 주소 (로고 · 달력 · manifest)"
if out=$(node scripts/check-public.mjs 2>/dev/null); then
  echo "$out"
else
  echo "$out"; fail=1
fi

echo
echo "== 8) 학생 계정에 남의 것이 보이나 (진짜 Postgres) =="
# 화면을 막는 것과 데이터를 막는 것은 다른 이야기다. 5번은 화면, 여기는 데이터.
if [ -f scripts/check-leak.sh ]; then
  bash scripts/check-leak.sh || fail=1
else
  echo "  건너뜀"
fi
echo

echo "== 8-2) 학부모에게 자기 아이 것이 보이나 (진짜 Postgres) =="
# check-leak 는 「남의 것이 보이면 실패」 만 본다 — 그것만 보면 **아무것도 안
# 보이는 것이 만점**이다. 실제로 학부모 화면이 몇 주 동안 통째로 비어 있었고
# (0016 의 읽기 규칙이 학생 본인만이었다), 원장님 미리보기는 선생님 권한이라
# 다 보여서 아무도 몰랐다. 그래서 **보여야 하는 것이 보이는지**도 본다.
if [ -f scripts/check-parent.sh ]; then
  bash scripts/check-parent.sh || fail=1
else
  echo "  건너뜀"
fi
echo

echo "== 9) 조교가 수강료를 볼 수 있나 (진짜 Postgres) =="
# 메뉴에서 감추는 것과 데이터를 막는 것은 다른 이야기다 (0079)
if [ -f scripts/check-roles.sh ]; then
  bash scripts/check-roles.sh || fail=1
else
  echo "  건너뜀"
fi

echo
echo "== 10) 빌드 =="
if npx next build >/tmp/.pagecheck-build.log 2>&1; then
  echo "  통과"
else
  tail -30 /tmp/.pagecheck-build.log
  fail=1
fi

echo
[ $fail -eq 0 ] && echo "✅ 전부 통과" || echo "❌ 위 항목을 고쳐주세요"
exit $fail
