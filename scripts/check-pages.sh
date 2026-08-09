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


# ── 검사 하나 돌리기 ────────────────────────────────────────
#
# **파이프가 실패를 삼키고 있었다** (2026-08-07).
#
#   if out=$(node scripts/check-date.mjs 2>&1 | grep -v "…"); then
#
# 파이프의 성패는 **마지막 명령(grep)** 의 것이다. node 가 1 로 죽어도
# grep 이 0 으로 끝나면 if 는 참이 된다. 그래서 「❌ 날짜 읽기에 어긋난
# 것이 있습니다」 를 화면에 찍어놓고도 **맨 끝은 「✅ 전부 통과」** 였다.
# 실제로 그렇게 하루를 지나갔다.
#
# 검사를 믿을 수 없으면 검사가 없는 것보다 나쁘다 — 있다고 여기게 되니까.
# node 를 먼저 돌려 성패를 받아두고, 걸러내기는 그다음에 한다.
runjs() {
  local out rc
  out=$(node "$1" 2>&1); rc=$?
  out=$(printf '%s\n' "$out" | grep -v "MODULE_TYPELESS\|Reparsing\|eliminate this\|trace-warnings")
  if [ $rc -eq 0 ]; then
    printf '%s\n' "$out" | tail -1
  else
    printf '%s\n' "$out"
    fail=1
  fi
}

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
runjs scripts/check-inquiry.mjs

echo
echo "== 5-2-1) 신규 상담 양식 (로그인 없이 여는 곳) =="
# 처음 오시는 학부모가 폰에서 **한 번** 채우는 양식이다. 여기서 잘못되면
# 그 문의는 그냥 사라진다 — 다시 채워달라고 할 수가 없다
runjs scripts/check-apply.mjs

echo
echo "== 5-2-2) 날짜 읽기 =="
# 날짜는 자료가 예상 밖으로 들어오는 대표적인 자리다. 「25/08」 하나 때문에
# 보강 171줄이 통째로 안 들어간 적이 있다 (2026-08-06)
runjs scripts/check-date.mjs

echo
echo "== 5-2-3) 연도 점검 (24·25·26 혼용) =="
# 노션은 「12/30」 처럼 연도 없이 적힌 것이 많아 지난 해 자료가 올해로
# 들어간다 — 오류가 안 난다. 여기서 잘못 세면 멀쩡한 자료를 1년 되돌리게 된다
runjs scripts/check-yearaudit.mjs

echo
echo "== 5-3) 성적 옮기기 · 리포트 계산 =="
# 리포트는 상담 중에 펴놓고 학부모께 설명하시는 화면이다 — 숫자가 틀리면
# 그 자리에서 곤란해지신다. 실제 자료에서 부딪힌 것을 못 박아 둔다
runjs scripts/check-report.mjs

echo
echo "== 5-4) 단원 엑셀 (분량 · 내용) =="
# 교재마다 「분량」 을 말하는 방식이 다르다 — 하나를 놓치면 그 교재는
# 화면에서 분량을 알 수 없게 되고, 숙제를 얼마나 낼지 못 정하신다
runjs scripts/check-unit.mjs

echo
echo "== 5-4-1) 시험 목록 (전국연합 가르기 · 연도·학기) =="
# 전국연합을 잘못 가리면 둘이 동시에 망가진다 — 내신 범위를 못 담게 되거나,
# 「범위 미등록」 재촉이 영영 안 꺼진다
runjs scripts/check-examlist.mjs

echo
echo "== 5-4-2) 교재 정렬 =="
# 정렬은 틀려도 오류가 안 난다 — 차례가 이상할 뿐이라 「원래 이런가 보다」 로
# 넘어간다. 학년을 글자로 견주는 것 · 빈칸을 0 으로 치는 것을 못 박아 둔다
runjs scripts/check-booksort.mjs

echo
echo "== 5-4-3) 방해금지 시간 =="
# 여기서 틀리면 **밤새 울리거나 하루 종일 안 울린다.** 둘 다 조용히 일어나고
# 알아채는 것은 학부모다. 특히 「안 정했으면 안 막는다」 가 무너지면 그 집
# 알림이 통째로 끊긴다
runjs scripts/check-quiet.mjs

echo
echo "== 5-4-4) 알림 켜기 안내 (기기별) =="
# 화면을 막아두고 **그 기기에서 못 할 일**을 시키면 앱을 아예 못 쓴다.
# 윈도우에 「홈 화면에 추가하세요」 를 보여주는 것이 그 경우다
runjs scripts/check-pushclient.mjs

echo
echo "== 5-4-5) 쉬는 시간 알림 규칙 =="
# 넓게 잡으면 하루 스무 번 울려서 알림을 꺼버리시게 되고, 좁게 잡으면
# 20분씩 사라지는 아이를 놓친다
runjs scripts/check-breaks.mjs

echo
echo "== 5-4-6) 검사 안 하는 항목 (공지 · 다음테스트 · 단원평가) =="
# 여기가 무너지면 조용히 나쁜 일이 벌어진다 — 매일 「안 낸 숙제」 로 떠서
# 경고가 쌓이고, 안 한 적도 없는 아이가 반성문 대상이 된다
runjs scripts/check-unittest.mjs

echo
echo "== 5-4-7) 넓은 화면 배치 (반응형 유지) =="
# 넓게 만든다고 폰에서 두 줄이 되면 글씨가 손톱만 해진다 — 그건 고친 것이
# 아니라 망가뜨린 것이다. 좁을 때 한 줄인지를 못 박는다
runjs scripts/check-layout.mjs

echo
echo "== 5-4-8) 안 본 알림 배지 =="
# 배지는 틀리면 안 뜨느니만 못하다 — 「3」 이라고 떠 있는데 들어가서 아무것도
# 없으면 그다음부터 안 믿게 되고, 진짜 3건이 왔을 때도 안 들어가신다
runjs scripts/check-inbox.mjs

echo
echo "== 5-4-9) 학부모 화면 (예민한 것들) =="
# 여기서 무너지면 사람 사이가 상한다 — 오류가 아니라서 아무도 못 잡는다
runjs scripts/check-parentview.mjs

echo
echo "== 5-4-10) 리포트 · 숙제 안내 양식 =="
# 같은 말이 두 글에 다 들어가면, 어머니는 두 번 읽으시다가 정작 위쪽
# 「단어 12/20」 을 놓치신다
runjs scripts/check-reportform.mjs

echo
echo "== 5-4-11) 여러 날 이어지는 일정 합치기 =="
# 학교마다 방학 등록 방식이 다르다 — 평일만 넣는 학교는 주말마다 끊겨서
# 방학 한 번이 목록에서 여섯 줄이 됐다
runjs scripts/check-neisrun.mjs

echo
echo "== 5-4-11-2) 나이스가 다는 칸이 표에 다 있나 =="
# 우리끼리 쓰는 표시(학년 · 전국 여부)를 안 떼고 보내면 **그 학교가 통째로**
# 실패한다. 빌드도 검사도 통과하고, 원장님이 받아오기를 누르셔야 나온다
runjs scripts/check-neiscols.mjs

echo
echo "== 5-4-12) 달력 한 칸에 같은 일정이 두 번 =="
# 나이스에서 받은 「여름방학」 과 원장님이 넣으신 「여름방학 — 휴강」 이
# 같은 날에 나란히 뜨면, 어느 쪽이 맞는 말인지 알 수가 없다
runjs scripts/check-caldup.mjs

echo
echo "== 5-4-13) 화면에 적을 말만 남나 =="
# 「노션 이관」 은 옮기던 그 주에만 쓸모가 있었다. 지금은 한 줄에 붙는 말만
# 하나 늘리고, 어머니께는 뜻조차 없다
runjs scripts/check-note.mjs

echo
echo "== 5-4-14) 보강 잡을 것 (대시보드와 출결이 같은 숫자를 말하나) =="
# 셈을 두 벌 만들면 두 화면이 다른 숫자를 말하고, 그러면 둘 다 안 믿게 된다
runjs scripts/check-makeuptodo.mjs

echo
echo "== 5-4-15) 흩어진 것 · 안 읽히는 말 =="
# 고쳐놓아도 다음에 화면 하나 만들 때 도로 흩어진다 — 새 기능은 늘
# 「일단 새 화면에」 로 붙기 때문이다
runjs scripts/check-tidy.mjs

echo
echo "== 5-4-16) 들어가면 자기 자리로 · 대시보드는 알림센터 =="
# 「원장 로그인하면 학생 화면이 나와」 의 진짜 원인은 계정 역할이 아니라
# 로그인이 자리를 하나로 박아두고 있던 것이었다
runjs scripts/check-home.mjs

echo
echo "== 5-4-17) 열쇠는 한 곳 · 안 쓰는 것은 뒤로 · 수업 중 동선 =="
# 솔라피는 설정, 나이스는 학교 화면, AI 는 또 다른 데였다 — 넣으려는 사람은
# 「어느 화면이었더라」 부터 떠올려야 했다
runjs scripts/check-keys.mjs

echo
echo "== 5-4-18) 사진 (돌리기 · 확대 · 받기) =="
# 사진은 30일이 지나면 지워진다. 받는 길이 없으면 그때는 되돌릴 수가 없다
runjs scripts/check-photo.mjs

echo
echo "== 5-4-19) 신규 문의 문자 (설문지 링크 · 일정 · 오시는 길) =="
# 처음 오시는 분께 가는 **첫 글**이다. 「{{상담일시}}」 가 그대로 적혀 나가면
# 그 집은 학원을 그렇게 기억하게 된다
runjs scripts/check-inqsms.mjs

echo
echo "== 5-4-20) 새 SQL 이 점검 목록에 들어갔나 =="
# 목록에 안 넣으면 화면이 「90/90 다 됐습니다」 라고 말한다. 원장님은 다 된
# 줄 알고 넘어가시고, 그 기능만 조용히 안 된다 (「109 안 떠」)
runjs scripts/check-sqllist.mjs

echo
echo "== 5-4-21) 잠금화면에 내용이 새지 않나 =="
# 알림 미리보기는 폰을 안 열어도 보인다 — 옆 사람에게도, 형제 폰에도.
# 거기 「단어 6/20」 이나 코멘트 첫 줄이 적히면 우리가 흘린 것이다
runjs scripts/check-preview.mjs

echo
echo "== 5-4-22) 수업 전달사항은 메모다 (알림이 가면 안 된다) =="
# 적는 순간 아이 폰이 울리는데 원장님은 아직 아무 말도 안 하신 상태다.
# 그런 알림이 몇 번 오면 그다음부터 안 누른다
runjs scripts/check-notice.mjs

echo
echo "== 5-4-23) 부르는 중을 가봤으면 지운다 =="
# 남아 있으면 다음에 정말 부른 아이가 그 사이에 묻힌다
runjs scripts/check-call.mjs

echo
echo "== 5-4-24) 메뉴마다 남은 일 배지 =="
# 배지는 틀려도 오류가 안 난다 — 키를 하나 잘못 적으면 그 메뉴에만 조용히
# 안 붙고, 없는 배지가 「다 했다」 는 말이 된다
runjs scripts/check-badges.mjs
runjs scripts/check-kanban.mjs

echo
echo "== 5-4-25) 선언보다 먼저 쓴 변수 (빌드는 통과하고 실행하면 터진다) =="
# `withAcademy(supabase, …)` 를 `const supabase` 위에 두었는데 next build 가
# 통과했다. 학부모 알림을 보내실 때까지 안 보이는 종류다
runjs scripts/check-tdz.mjs

echo
echo "== 5-5) 출제분석 =="
# 「교과서에서 60% 나왔다」 가 틀리면 한 학기 공부 방향이 틀어진다.
# 「몇 명 중 몇 명」 은 사람 수를 잘못 세면 곧바로 거짓말이 된다
runjs scripts/check-analysis.mjs

echo
echo "== 5-5-2) 특강 기한이 달력까지 닿나 =="
# 계산은 진작 맞았는데 **자료가 안 와서** 종강한 특강이 계속 수업하고 있었다.
# 계산만 보는 검사로는 영원히 못 잡는다 — 화면이 기간 칸을 읽는지도 같이 본다
runjs scripts/check-classterm.mjs

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
