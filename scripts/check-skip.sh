#!/usr/bin/env bash
# **안 돈 검사를 통과로 세지 않는가** — 2026-09-03 에 실제로 그랬던 자리.
#
# 그날 무슨 일이 있었나: RLS 검사 일곱(학생이 남의 것 보나 · 학부모 가시성 ·
# 조교 자물쇠 …)이 진짜 Postgres 가 없어 **한 줄도 안 돌았는데**,
# check-pages.sh 는 화면에 「안 돌았습니다」라고 적어 놓고도 **종료코드 0** 을 줬다.
# `check-pages.sh && git push` 로 걸어 두면 그대로 나간다.
#
# 그리고 그 일곱이 왜 안 돌았나: 발판(pg-boot.sh)이 **리눅스 자리 하나만** 보고
# 맥의 postgresql@16(keg-only)을 못 찾았다. live-month.mjs 는 아예 **제 손으로
# 두 벌째** 갖고 있어서 여섯을 고쳐도 혼자 계속 건너뛰었다.
#
# 이 검사는 그 셋을 다시 잡는다. **DB 가 없어도 돈다** (verdict 파일만 돌려 본다).
set -u
n=0; bad=0
ok() { n=$((n+1)); if [ "$1" = "1" ]; then echo "   ✅ $2"; else bad=$((bad+1)); echo "   ❌ $2${3:+ — $3}"; fi; }
cd "$(dirname "$0")/.."

echo "■ 안 돈 검사를 통과로 세지 않는가 (2026-09-03)"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
NONE="$TMP/none"; : > "$NONE"
TWO="$TMP/two"; printf '학생 계정 유출 (RLS)\n조교가 수강료를 볼 수 있나\n' > "$TWO"

verdict() { PGSKIP_FILE="$1" PGSKIP_OK="${3:-}" bash scripts/pg-verdict.sh "${2:-0}" >/dev/null 2>&1; echo $?; }

ok "$([ "$(verdict "$NONE" 0)" = "0" ] && echo 1 || echo 0)" \
   "다 돌고 다 통과하면 **0** (초록)"
ok "$([ "$(verdict "$TWO" 0)" != "0" ] && echo 1 || echo 0)" \
   "⚠️⚠️ **안 돈 것이 있으면 0 을 안 준다** — 이게 안 되면 안 돌린 채로 push 가 나간다" \
   "지금 $(verdict "$TWO" 0)"
ok "$([ "$(verdict "$TWO" 1)" != "0" ] && echo 1 || echo 0)" \
   "실패도 그대로 실패다 (2026-08-17 사고)"
ok "$([ "$(verdict "$TWO" 0 1)" = "0" ] && echo 1 || echo 0)" \
   "정말 넘기려면 **손으로** PGSKIP_OK=1 을 붙여야 한다 (기본은 막는다)"
ok "$(PGSKIP_FILE="$TWO" bash scripts/pg-verdict.sh 0 2>&1 | grep -q "통과가 아닙니다" && echo 1 || echo 0)" \
   "화면에도 **「통과가 아닙니다」**라고 말한다"

echo
echo "■ 발판이 맥에서도 도나 (일곱이 안 돌던 진짜 까닭)"
BOOT=$(sed 's|/\*.*\*/||g' scripts/pg-boot.sh)
ok "$(echo "$BOOT" | grep -q "postgresql@16" && echo 1 || echo 0)" \
   "⚠️ 맥의 postgres 자리(keg-only)를 찾아본다 — 리눅스 자리 하나만 보면 맥에선 늘 건너뛴다"
ok "$(echo "$BOOT" | grep -q 'LC_ALL' && echo 1 || echo 0)" \
   "⚠️ LC_ALL 을 준다 — 없으면 맥에서 「멀티쓰레드 환경」으로 죽는다(실측)"
ok "$(echo "$BOOT" | grep -q 'id -u' && echo 1 || echo 0)" \
   "⚠️ root 가 아닐 때(맥)는 su postgres 를 안 쓴다"
ok "$(echo "$BOOT" | grep -q 'pg_isready' && echo 1 || echo 0)" \
   "⚠️ **진짜 떴는지 물어보고** 답한다 — sleep 뒤 무조건 성공이라 하면 뒤가 줄줄이 터진다"
ok "$(bash scripts/pg-boot.sh --bin >/dev/null 2>&1 && echo 1 || echo 0)" \
   "노드가 물어볼 문(--bin)이 열려 있다"

echo
echo "■ postgres 를 띄우는 법이 **한 벌**인가 (원칙 1)"
MONTH=$(sed 's|/\*[^*]*\*/||g' scripts/live-month.mjs | grep -v '^\s*//')
ok "$(echo "$MONTH" | grep -q 'pg-boot.sh' && echo 1 || echo 0)" \
   "「한 달 살아보기」가 발판에게 물어본다"
ok "$(echo "$MONTH" | grep -qE '"su",\s*\[\s*"postgres"' && echo 0 || echo 1)" \
   "⚠️⚠️ 제 손으로 postgres 를 안 띄운다 — 두 벌이면 한쪽만 고쳐져 혼자 계속 건너뛴다"

echo
echo "■ 안 돈 것 검사 ${n}건 · 실패 ${bad}"
[ "$bad" -eq 0 ]
