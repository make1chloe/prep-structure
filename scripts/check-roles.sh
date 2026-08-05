#!/usr/bin/env bash
# 조교가 수강료를 볼 수 있는지 **진짜 Postgres 에서** 확인한다 (0079).
#
# 메뉴에서 감추는 것과 데이터를 막는 것은 다른 이야기다.
# 화면은 주소만 알면 열리고, 서버 동작은 코드를 고치면 뚫린다.
# 마지막 자물쇠는 RLS 다 — 그게 진짜로 걸려 있는지만 여기서 본다.
set -u
PG=/usr/lib/postgresql/16/bin
export PATH="$PG:$PATH"
D=/var/tmp/pgrole
PORT=55439

command -v initdb >/dev/null || { echo "  postgres 가 없어 건너뜁니다"; exit 0; }

cleanup() { su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D stop" >/dev/null 2>&1; rm -rf "$D"; }
trap cleanup EXIT

rm -rf "$D"; mkdir -p "$D"; chown postgres "$D"; chmod 700 "$D"
su postgres -c "PATH=$PG:\$PATH initdb -D $D -U postgres -A trust" >/dev/null 2>&1
su postgres -c "PATH=$PG:\$PATH pg_ctl -D $D -o '-p $PORT -k /var/tmp' -l $D/log start" >/dev/null 2>&1
sleep 2

Q="psql -h /var/tmp -p $PORT -U postgres -q"
$Q -c "create database chloe;" >/dev/null 2>&1
$Q -c "create role anon; create role authenticated; create role service_role;" >/dev/null 2>&1
# Supabase 흉내 — auth.uid() 는 요청에 실린 사람이다
$Q -d chloe -c "
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as \$\$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid \$\$;" >/dev/null 2>&1
$Q -d chloe -v ON_ERROR_STOP=1 -f supabase/SETUP_ALL.sql >/dev/null 2>&1
$Q -d chloe -c "grant usage on schema public to anon, authenticated;
  grant all on all tables in schema public to anon, authenticated;
  grant all on all sequences in schema public to anon, authenticated;" >/dev/null 2>&1

BOSS=11111111-1111-1111-1111-111111111111
ASSI=22222222-2222-2222-2222-222222222222
STU=33333333-3333-3333-3333-333333333333

$Q -d chloe >/dev/null 2>&1 <<SQL
insert into auth.users (id) values ('$BOSS'), ('$ASSI');
insert into public.profiles (id, role, name) values
  ('$BOSS','principal','원장'), ('$ASSI','assistant','조교')
on conflict (id) do update set role = excluded.role;
insert into public.students (id, name, status) values ('$STU','가영','enrolled')
on conflict (id) do nothing;
insert into public.payments (student_id, ym, amount, paid_on)
  values ('$STU', '2026-08', 250000, current_date)
on conflict do nothing;
SQL

seen() {
  $Q -d chloe -tAc "set local role authenticated;
    set local request.jwt.claim.sub = '$1';
    select count(*) from public.payments;" 2>/dev/null | tail -1
}

fail=0
boss=$(seen "$BOSS")
assi=$(seen "$ASSI")

if [ "$boss" = "1" ]; then
  echo "  원장은 수강료가 보입니다"
else
  echo "  ❌ 원장에게 수강료가 안 보입니다 (본 줄: ${boss:-?})"; fail=1
fi
if [ "$assi" = "0" ]; then
  echo "  조교에게는 수강료가 안 보입니다"
else
  echo "  ❌ 조교에게 수강료가 보입니다 (본 줄: ${assi:-?})"; fail=1
fi

# 역할 함수가 제대로 갈리나
r=$($Q -d chloe -tAc "set local role authenticated;
  set local request.jwt.claim.sub = '$ASSI';
  select public.is_principal()::text || public.is_teacher()::text;" 2>/dev/null | tail -1)
if [ "$r" = "falsefalse" ]; then
  echo "  조교는 원장도 강사도 아닙니다"
else
  echo "  ❌ is_principal/is_teacher 가 조교를 제대로 안 가릅니다 ($r)"; fail=1
fi

exit $fail
