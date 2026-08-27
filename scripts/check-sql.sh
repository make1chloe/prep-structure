#!/usr/bin/env bash
# SETUP_ALL.sql 을 진짜 Postgres 에 세 번 돌려본다.
#
# 왜 세 번인가
#   한 번은 "돌아가나", 두 번째는 "다시 돌려도 안전한가",
#   세 번째는 "seed 가 계속 늘어나지 않나" 를 본다.
#   (실제로 message_templates 와 todo_categories 가 매번 3배로 늘고 있었다)
set -u
. "$(dirname "$0")/pg-boot.sh"

# **SETUP_ALL.sql 이 마이그레이션 폴더보다 오래됐으면 안 된다.**
#
# 손으로 붙이다 0041·0052 뒤죽박죽이 났던 자리라 build-setup-sql.mjs 로
# 다시 찍어내게 했는데(스크립트 안내문에도 적혀 있다), **막상 새 마이그레이션을
# 넣고 그 스크립트를 안 돌리는 일이 실제로 있었다** (2026-08-11, 0115~0117
# 세 개가 몇 시간 동안 SETUP_ALL 에 없이 커밋됐다) — 아래 3번 돌리기가
# "통과" 로 뜨는데 사실은 **새 마이그레이션을 한 번도 안 돌려본 것**이었다.
# 검사가 거짓으로 통과하면 검사가 없는 것보다 나쁘다.
#
# 합본 전체를 다시 찍어 견주지 않는다 — 머리말에 오늘 날짜가 박혀서
# (build-setup-sql.mjs) 어제 찍은 파일은 **내용이 같아도 매일 달라 보인다.**
# 대신 **가장 최근 마이그레이션 번호가 합본 안에 있는지**만 본다 — 놓친
# 것을 잡아내는 데는 이걸로 충분하다.
#
# **이 검사는 DB 가 필요 없다** (순수 grep). 그런데 initdb 관문 뒤에
# 있어서 맥에서는 아래 3번 돌리기와 함께 통째로 안 돌았다 (2026-08-28).
# 그래서 관문 앞으로 올렸다 — DB 가 없어도 이건 매번 돈다.
echo "== SETUP_ALL.sql 이 최신인가 =="
LATEST=$(ls supabase/migrations | sort | tail -1 | cut -c1-4)
if ! grep -q "${LATEST}_" supabase/SETUP_ALL.sql; then
  echo "  ✗ 마이그레이션 ${LATEST} 이 합본에 없습니다."
  echo "    node scripts/build-setup-sql.mjs 를 돌리고 다시 커밋해주세요."
  exit 1
fi
echo "  ${LATEST} 까지 들어 있습니다"


pg_boot pgcheck 55433 /var/tmp/pgcheck || { pg_skip "SETUP_ALL 을 진짜 Postgres 에 세 번 돌리기"; exit 0; }
trap pg_stop EXIT
$Q -c "create database chloe;" >/dev/null 2>&1
# Supabase 흉내 — 로컬에는 없는 역할과 auth 스키마
$Q -c "create role anon; create role authenticated; create role service_role;" >/dev/null 2>&1
$Q -d chloe -c "
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$;" >/dev/null 2>&1

# **「error」 라는 낱말이 들어간 NOTICE 를 오류로 세고 있었다** (2026-08-07).
#   -i 로 찾으니 `NOTICE: column "error" ... already exists` 가 걸렸다.
#   psql 이 진짜 오류를 낼 때는 대문자 `ERROR:` 로 적는다 — 그것만 본다.
fail=0
for i in 1 2 3; do
  out=$($Q -d chloe -v ON_ERROR_STOP=1 -f supabase/SETUP_ALL.sql 2>&1 | grep -E "^psql.*(ERROR|치명적):")
  if [ -n "$out" ]; then echo "  ${i}회차 실패:"; echo "$out" | head -5; fail=1; fi
done
[ $fail -eq 0 ] && echo "  세 번 다 통과"

dup=$($Q -d chloe -tc "
select 'message_templates: '||name from message_templates group by name having count(*)>1
union all select 'todo_categories: '||name from todo_categories group by name having count(*)>1
union all select 'homework_items: '||name from homework_items group by name having count(*)>1
union all select 'exam_periods: '||school||' '||name from exam_periods group by school,name having count(*)>1;" 2>/dev/null | sed '/^\s*$/d')
if [ -n "$dup" ]; then echo "  ⚠ 여러 번 실행해서 늘어난 것:"; echo "$dup" | head -10; fail=1
else echo "  늘어난 seed 없음"; fi

exit $fail
