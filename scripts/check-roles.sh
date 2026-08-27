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
KID=44444444-4444-4444-4444-444444444444   # 학생 계정 (0043 코드 연결용)
TCHR=55555555-5555-5555-5555-555555555555  # 강사 (자기 강등 회귀용)
GONE=66666666-6666-6666-6666-666666666666  # 강사 (계정 삭제 cascade 회귀용)
FRESH=77777777-7777-7777-7777-777777777777 # 계정 만들기 회귀용 (INSERT)

$Q -d chloe >/dev/null 2>&1 <<SQL
insert into auth.users (id) values
  ('$BOSS'), ('$ASSI'), ('$KID'), ('$TCHR'), ('$GONE'), ('$FRESH');
insert into public.profiles (id, role, name) values
  ('$BOSS','principal','원장'), ('$ASSI','assistant','조교'),
  ('$KID','student','가영계정'), ('$TCHR','instructor','강사'),
  ('$GONE','instructor','그만둔강사'), ('$FRESH','student','새계정')
on conflict (id) do update set role = excluded.role;
insert into public.students (id, name, status) values ('$STU','가영','enrolled')
on conflict (id) do nothing;
insert into public.payments (student_id, ym, amount, paid_on)
  values ('$STU', '2026-08', 250000, current_date)
on conflict do nothing;
insert into public.student_link_codes (code, student_id, expires_at)
  values ('AAA111', '$STU', now() + interval '1 day')
on conflict (code) do nothing;
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


# ── 역할 자물쇠 (0175) ──────────────────────────────────────
#
# 원장이 실 DB 에서 확인한 사실 — profiles 의 정책은 `staff_all`(ALL,
# is_staff) 과 `profiles_self_select`(SELECT, 본인) 둘뿐이고 행·칸 제한이
# 없다. 그래서 **조교가 자기 역할을 원장으로 올리고, 원장을 내릴 수 있다.**
# 메뉴를 감추든 미들웨어를 세우든, 이게 열려 있으면 전부 무의미하다.
# 여기서 진짜 Postgres 로 그 두 시도를 해 본다.
say() { $Q -d chloe -tAc "$1" 2>/dev/null | tail -1; }

# 어떤 사람으로 한 문장 시도한다 (막히면 조용히 실패한다 — 그게 정상이다)
astry() {   # $1 = 부르는 사람, $2 = 문장
  $Q -d chloe -tAc "set local role authenticated;
    set local request.jwt.claim.sub = '$1';
    $2" >/dev/null 2>&1
}
roleof() { say "select role from public.profiles where id = '$1';"; }

astry "$ASSI" "update public.profiles set role='principal' where id='$ASSI';"
r=$(roleof "$ASSI")
if [ "$r" = "assistant" ]; then
  echo "  조교는 자기를 원장으로 올리지 못합니다"
else
  echo "  ❌ 조교가 자기 역할을 바꿨습니다 (지금: ${r:-?})"; fail=1
fi

# 강등 두 갈래를 다 본다 — 스태프로 내리기(assistant)와 스태프 밖으로
# 내보내기(student). 뒤엣것을 빼먹으면 「원장을 학생으로」 가 그대로 통한다.
astry "$ASSI" "update public.profiles set role='assistant' where id='$BOSS';"
astry "$ASSI" "update public.profiles set role='student' where id='$BOSS';"
r=$(roleof "$BOSS")
if [ "$r" = "principal" ]; then
  echo "  조교는 원장을 강등하지 못합니다"
else
  echo "  ❌ 조교가 원장을 강등했습니다 (지금: ${r:-?}) — 원장이 잠깁니다"; fail=1
fi

# 회귀 ① 학생 코드 연결(0043)은 그대로 되어야 한다 (새 역할이 'student')
ok=$(say "set local role authenticated;
  set local request.jwt.claim.sub = '$KID';
  select ok from public.link_student_by_code('AAA111');")
if [ "$ok" = "t" ]; then
  echo "  학생 코드 연결은 그대로 됩니다 (0043)"
else
  echo "  ❌ 역할 자물쇠가 학생 코드 연결을 막았습니다 (0043 회귀, 답: ${ok:-?})"; fail=1
fi

# 회귀 ② 자기 자신을 스태프 밖으로 내리는 것은 막지 않는다 (위협이 아니다 —
# 스스로 권한을 버리는 것뿐. 0043 이 스태프 계정에 걸리는 것도 이 예외로 푼다)
astry "$TCHR" "update public.profiles set role='student' where id='$TCHR';"
r=$(roleof "$TCHR")
if [ "$r" = "student" ]; then
  echo "  자기 역할을 스스로 내리는 것은 됩니다"
else
  echo "  ❌ 자기 강등까지 막혔습니다 (지금: ${r:-?}) — 0043 이 스태프 계정에서 깨집니다"; fail=1
fi

# ── 자물쇠가 UPDATE 만 잠그면 소용없다 (0176) ────────────────
#
# 0175 는 `before update` 뿐이었다. UPDATE 만 피하면 그만이라, 길이 둘 있다 —
#   · 원장 행을 **지운다** → 원장이 잠긴다
#   · 행을 지우고 `insert (id, role='principal')` 로 **다시 심는다**
#     (staff_all 의 with_check 는 「고치는 사람」만 보고 「심는 역할」은 안 본다)
astry "$ASSI" "delete from public.profiles where id='$BOSS';"
r=$(roleof "$BOSS")
if [ "$r" = "principal" ]; then
  echo "  조교는 원장 행을 지우지 못합니다"
else
  echo "  ❌ 조교가 원장 행을 지웠습니다 (남은 것: ${r:-없음}) — 원장이 잠깁니다"; fail=1
fi

astry "$ASSI" "delete from public.profiles where id='$KID';"
astry "$ASSI" "insert into public.profiles (id, role, name) values ('$KID','principal','가영계정');"
r=$(roleof "$KID")
if [ "$r" != "principal" ]; then
  echo "  조교는 행을 갈아끼워 원장을 심지 못합니다"
else
  echo "  ❌ 조교가 원장 역할을 심었습니다 (지금: $r) — UPDATE 만 잠근 자물쇠입니다"; fail=1
fi

# 회귀 ③ 계정 만들기(accountActions·parentActions)는 student·parent 를 심는다.
# 방아쇠가 놓친 자리에서 upsert 가 INSERT 로 떨어지는 길 — 막히면 안 된다.
$Q -d chloe -c "delete from public.profiles where id='$FRESH';" >/dev/null 2>&1
astry "$ASSI" "insert into public.profiles (id, role, name) values ('$FRESH','student','새계정');"
r=$(roleof "$FRESH")
if [ "$r" = "student" ]; then
  echo "  학생 계정 만들기는 그대로 됩니다"
else
  echo "  ❌ 자물쇠가 학생 계정 만들기를 막았습니다 (지금: ${r:-없음})"; fail=1
fi

# 회귀 ④ 계정 삭제(Admin API → auth.users 삭제 → profiles 로 cascade)는
# auth.uid() 가 없는 자리라 비상구로 통과해야 한다. 여기가 막히면 그만둔
# 선생님 계정을 **아무도 못 지운다**.
$Q -d chloe -c "delete from auth.users where id = '$GONE';" >/dev/null 2>&1
r=$(roleof "$GONE")
if [ -z "$r" ]; then
  echo "  계정 삭제(cascade)는 그대로 됩니다"
else
  echo "  ❌ 자물쇠가 계정 삭제를 막았습니다 (남은 것: $r)"; fail=1
fi

# 표식이 진실을 말하나 — 상수 true 면 자물쇠를 지워도 초록이 된다 (0176 ①)
r=$($Q -d chloe -tAc "select public.role_locked_on()::text;" 2>/dev/null | tail -1)
if [ "$r" = "true" ]; then
  echo "  role_locked_on() 이 자물쇠를 실제로 보고 있습니다"
else
  echo "  ❌ role_locked_on() 이 거짓입니다 ($r) — 표식과 트리거가 어긋났습니다"; fail=1
fi

exit $fail
