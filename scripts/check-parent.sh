#!/usr/bin/env bash
# 학부모 계정으로 **자기 아이 것이 보이는지** 진짜 Postgres 에서 확인한다.
#
# 왜 이 검사가 따로 필요한가 —
#
#   check-leak.sh 는 「남의 것이 보이면 실패」 를 본다. 그것만 보면
#   **아무것도 안 보이는 것이 만점**이다. 실제로 그렇게 됐다.
#
#   daily_reports 의 읽기 규칙(0016)이 「학생 본인만」 이었다. 학부모 계정은
#   students 에 줄이 없어서 이번 달 현황도, 최근 수업도, 숙제도 한 줄도
#   안 나왔다. 오류도 안 났다 — RLS 는 없는 것처럼 보여준다.
#
#   그리고 원장님은 재원생 목록의 「학부모 화면」 으로 확인하신다. 그때는
#   선생님 계정이라 is_staff() 로 전부 통과한다. **미리보기로는 절대 안
#   잡히는 종류의 버그다.** 보이는 사람과 못 보는 사람이 다르기 때문이다.
#
# 그래서 여기서는 **보여야 하는 것이 보이는지**를 본다.
#   · 학부모(어머니)와 아이 '가', 남의 아이 '나' 를 만들고
#   · 어머니로 앉아서 표를 훑는다
#   · 내 아이 것이 안 보이면 실패, 남의 아이 것이 보여도 실패
set -u
PG=/usr/lib/postgresql/16/bin
export PATH="$PG:$PATH"
D=/var/tmp/pgparent
PORT=55436

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

$Q -d chloe -c "
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create table if not exists public._who (id uuid);
grant select on public._who to authenticated, anon;
create or replace function auth.uid() returns uuid language sql stable as
  \$\$ select id from public._who limit 1 \$\$;" >/dev/null 2>&1

$Q -d chloe -v ON_ERROR_STOP=1 -f supabase/SETUP_ALL.sql >/dev/null 2>&1

# Supabase 와 같은 자리에서 시작한다 — 표는 다 열려 있고, 막는 것은 RLS 하나뿐
$Q -d chloe >/dev/null 2>&1 <<'SQL'
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
SQL

# ── 어머니 한 분, 아이 둘 (내 아이 '가' · 남의 아이 '나') ──
$Q -d chloe >/dev/null 2>&1 <<'SQL'
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),   -- 어머니
  ('b0000000-0000-0000-0000-000000000002'),   -- 남의 어머니
  ('c0000000-0000-0000-0000-000000000003');   -- 원장
insert into public.profiles (id, role, name) values
  ('a0000000-0000-0000-0000-000000000001', 'parent',    '가 학부모'),
  ('b0000000-0000-0000-0000-000000000002', 'parent',    '나 학부모'),
  ('c0000000-0000-0000-0000-000000000003', 'principal', '원장');
insert into public.students (id, name, parent_phone, status) values
  ('11110000-0000-0000-0000-000000000001', '가학생', '010-1111-1111', 'enrolled'),
  ('22220000-0000-0000-0000-000000000002', '나학생', '010-2222-2222', 'enrolled');
insert into public.parent_student (parent_profile_id, student_id) values
  ('a0000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-000000000002');
SQL

# 두 아이에게 똑같이 하나씩 깔아둔다
$Q -d chloe >/dev/null 2>&1 <<'SQL'
insert into public.homework_items (id, name, category) values
  ('99990000-0000-0000-0000-000000000001', '단어 외우기', '어휘');
insert into public.daily_reports (id, student_id, date, attendance_kind, word_correct, word_total, own_progress, notice)
values
  ('dd110000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   current_date, 'present', 18, 20, '리딩튜터 Unit 5', '오늘 잘했습니다'),
  ('dd220000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-000000000002',
   current_date, 'present', 15, 20, '남의 진도', '남의 공지');
insert into public.daily_report_items (daily_report_id, homework_item_id, status) values
  ('dd110000-0000-0000-0000-000000000001', '99990000-0000-0000-0000-000000000001', 'assigned'),
  ('dd220000-0000-0000-0000-000000000002', '99990000-0000-0000-0000-000000000001', 'assigned');
insert into public.homework_submissions (student_id, date, kind, path)
  select id, current_date, 'photo', id::text || '/x.jpg' from public.students;
insert into public.attendance (student_id, date, status)
  select id, current_date, 'present' from public.students;
insert into public.monthly_reports (student_id, ym, text)
  select id, to_char(current_date,'YYYY-MM'), '월말' from public.students;
insert into public.scores (student_id, kind, taken_on, term, raw_score, full_score, grade)
  select id, 'school', current_date, '1학기 중간고사', 88, 100, 2 from public.students;
insert into public.stay_tasks (student_id, date, body, status)
  select id, current_date, '남은 과제', 'todo' from public.students;
insert into public.classes (id, name, days) values
  ('cc110000-0000-0000-0000-000000000001', '가반', array['월']),
  ('cc220000-0000-0000-0000-000000000002', '나반', array['화']);
insert into public.class_students (class_id, student_id) values
  ('cc110000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001'),
  ('cc220000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-000000000002');
SQL

# ── 어머니로 앉는다 ────────────────────────────────
$Q -d chloe -c "delete from public._who; insert into public._who values ('a0000000-0000-0000-0000-000000000001');" >/dev/null 2>&1

MINE='11110000-0000-0000-0000-000000000001'

# 1) 내 아이 것이 **보여야** 한다 (0 이면 화면이 비어 있다는 뜻)
SEE=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select t || '=' || n from (
  select 'students'             t, count(*) n from public.students             where id = '$MINE'
  union all select 'daily_reports',           count(*) from public.daily_reports           where student_id = '$MINE'
  union all select 'daily_report_items',      count(*) from public.daily_report_items      where daily_report_id = 'dd110000-0000-0000-0000-000000000001'
  union all select 'homework_submissions',    count(*) from public.homework_submissions    where student_id = '$MINE'
  union all select 'attendance',              count(*) from public.attendance              where student_id = '$MINE'
  union all select 'monthly_reports',         count(*) from public.monthly_reports         where student_id = '$MINE'
  union all select 'scores',                  count(*) from public.scores                  where student_id = '$MINE'
  union all select 'stay_tasks',              count(*) from public.stay_tasks              where student_id = '$MINE'
  union all select 'class_students',          count(*) from public.class_students          where student_id = '$MINE'
  union all select 'homework_items',          count(*) from public.homework_items
) x order by t;
SQL
)

fail=0
BLIND=$(echo "$SEE" | grep '=0$' || true)
if [ -n "$BLIND" ]; then
  echo "  ❌ 학부모에게 **자기 아이 것이 안 보입니다** (화면이 비어 보입니다)"
  echo "$BLIND" | sed 's/^/     /'
  fail=1
else
  echo "  자기 아이 수업 기록·숙제·성적이 보입니다"
fi

# 2) 남의 아이 것은 **안 보여야** 한다
LEAK=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select t || '=' || n from (
  select 'students'             t, count(*) n from public.students             where id <> '$MINE'
  union all select 'daily_reports',           count(*) from public.daily_reports           where student_id <> '$MINE'
  union all select 'daily_report_items',      count(*) from public.daily_report_items      where daily_report_id <> 'dd110000-0000-0000-0000-000000000001'
  union all select 'homework_submissions',    count(*) from public.homework_submissions    where student_id <> '$MINE'
  union all select 'attendance',              count(*) from public.attendance              where student_id <> '$MINE'
  union all select 'monthly_reports',         count(*) from public.monthly_reports         where student_id <> '$MINE'
  union all select 'scores',                  count(*) from public.scores                  where student_id <> '$MINE'
  union all select 'stay_tasks',              count(*) from public.stay_tasks              where student_id <> '$MINE'
  union all select 'class_students',          count(*) from public.class_students          where student_id <> '$MINE'
  union all select 'payments',                count(*) from public.payments
  union all select 'integrations',            count(*) from public.integrations
) x order by t;
SQL
)
OUT=$(echo "$LEAK" | grep -v '=0$' || true)
if [ -n "$OUT" ]; then
  echo "  ❌ 남의 아이 것이 학부모에게 보입니다"
  echo "$OUT" | sed 's/^/     /'
  fail=1
else
  echo "  남의 아이 것은 안 보입니다"
fi

# 3) 대신 써넣지는 못한다 — 기록이 거짓이 되면 안 된다
W=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
insert into public.daily_reports (student_id, date) values ('$MINE', current_date + 1);
SQL
)
if echo "$W" | grep -qi "policy\|permission\|denied"; then
  echo "  학부모가 수업 기록을 써넣지는 못합니다"
else
  echo "  ❌ 학부모가 수업 기록을 써넣을 수 있습니다 — 기록이 거짓이 됩니다"
  fail=1
fi

exit $fail
