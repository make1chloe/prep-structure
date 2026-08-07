#!/usr/bin/env bash
# SETUP_ALL.sql 을 진짜 Postgres 에 세 번 돌려본다.
#
# 왜 세 번인가
#   한 번은 "돌아가나", 두 번째는 "다시 돌려도 안전한가",
#   세 번째는 "seed 가 계속 늘어나지 않나" 를 본다.
#   (실제로 message_templates 와 todo_categories 가 매번 3배로 늘고 있었다)
set -u
PG=/usr/lib/postgresql/16/bin
export PATH="$PG:$PATH"
D=/var/tmp/pgcheck
PORT=55433

command -v initdb >/dev/null || { echo "postgres 가 없어 건너뜁니다"; exit 0; }

cleanup() { su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D stop" >/dev/null 2>&1; rm -rf "$D"; }
trap cleanup EXIT

rm -rf "$D"; mkdir -p "$D"; chown postgres "$D"; chmod 700 "$D"
su postgres -c "PATH=$PG:\$PATH initdb -D $D -U postgres -A trust" >/dev/null 2>&1
su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D -o '-p $PORT -k /var/tmp' -l $D/log start" >/dev/null 2>&1
sleep 2

Q="psql -h /var/tmp -p $PORT -U postgres -q"
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
