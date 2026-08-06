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
-- 아이 본인 계정 — 오답 적기(0098) 규칙을 보려면 아이로도 앉아봐야 한다
insert into auth.users (id) values ('d0000000-0000-0000-0000-000000000004');
insert into public.profiles (id, role, name) values
  ('d0000000-0000-0000-0000-000000000004', 'student', '가학생');
insert into public.students (id, name, parent_phone, status, profile_id) values
  ('11110000-0000-0000-0000-000000000001', '가학생', '010-1111-1111', 'enrolled',
   'd0000000-0000-0000-0000-000000000004'),
  ('22220000-0000-0000-0000-000000000002', '나학생', '010-2222-2222', 'enrolled', null);
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
-- 아이가 스스로 낸 것 하나 (source='form') — 이것만 아이가 고칠 수 있어야 한다
insert into public.scores (id, student_id, kind, taken_on, term, raw_score, full_score, source)
values ('55550000-0000-0000-0000-000000000001',
        '11110000-0000-0000-0000-000000000001', 'mock', current_date, '3월 학평', 75, 100, 'form');
insert into public.score_items (score_id, no, wrong, reason) values
  ('55550000-0000-0000-0000-000000000001', 21, true, '해석을 못했어요');
-- 남의 아이 것 (아이가 여기에 못 써야 한다)
insert into public.scores (id, student_id, kind, taken_on, term, raw_score, full_score, source)
values ('55550000-0000-0000-0000-000000000002',
        '22220000-0000-0000-0000-000000000002', 'mock', current_date, '3월 학평', 60, 100, 'form');
insert into public.stay_tasks (student_id, date, body, status)
  select id, current_date, '남은 과제', 'todo' from public.students;
insert into public.classes (id, name, days) values
  ('cc110000-0000-0000-0000-000000000001', '가반', array['월']),
  ('cc220000-0000-0000-0000-000000000002', '나반', array['화']);

-- 휴강과 보강 요일 — 회차를 세는 데 쓴다 (0096). 못 읽으면 회차가 안 뜬다
insert into public.holidays (date, name, scope) values (current_date, '휴강', 'all');
insert into public.integrations (id, enabled, config)
  values ('schedule', true, '{"makeupDays":["금"]}'::jsonb)
  on conflict (id) do update set config = excluded.config;
insert into public.integrations (id, enabled, config)
  values ('solapi', true, '{"apiKey":"비밀"}'::jsonb)
  on conflict (id) do update set config = excluded.config;

-- 학교 둘 — 우리 학교 것만 보여야 한다 (0091)
insert into public.schools (id, name, schul_code) values
  ('50000000-0000-0000-0000-000000000001', '가중학교', 'C0001'),
  ('50000000-0000-0000-0000-000000000002', '나중학교', 'C0002');
update public.students set school = '가중학교', grade = '중2',
       school_id = '50000000-0000-0000-0000-000000000001'
 where id = '11110000-0000-0000-0000-000000000001';
update public.students set school = '나중학교', grade = '중3',
       school_id = '50000000-0000-0000-0000-000000000002'
 where id = '22220000-0000-0000-0000-000000000002';

-- 일정 — 보여야 할 것과 안 보여야 할 것을 나란히 깔아둔다
insert into public.tasks (id, title, kind, due_on, private,
                          deliver_scope, deliver_student_ids, deliver_school_id, deliver_grade, deliver_class_id)
values
  -- 보여야 한다
  ('70000000-0000-0000-0000-000000000001', '전체 공지 휴강', 'schedule', current_date, false,
   'all', '{}', null, null, null),
  ('70000000-0000-0000-0000-000000000002', '우리 학교 시험', 'schedule', current_date, false,
   'grade', '{}', '50000000-0000-0000-0000-000000000001', null, null),
  ('70000000-0000-0000-0000-000000000003', '우리 아이 보강', 'schedule', current_date, false,
   'student', array['11110000-0000-0000-0000-000000000001']::uuid[], null, null, null),
  ('70000000-0000-0000-0000-000000000004', '우리 반 특강', 'schedule', current_date, false,
   'class', '{}', null, null, 'cc110000-0000-0000-0000-000000000001'),
  -- 안 보여야 한다
  -- **대상을 안 적은 것** — 「전체」 를 골라야 전체에 간다 (원장님, 2026-08-06).
  --   안 정한 것을 「모두」 로 읽으면 안 된다
  ('70000000-0000-0000-0000-000000000010', '대상 안 적은 일정', 'schedule', current_date, false,
   null, '{}', null, null, null),
  ('70000000-0000-0000-0000-000000000011', '남의 학교 시험', 'schedule', current_date, false,
   'grade', '{}', '50000000-0000-0000-0000-000000000002', null, null),
  ('70000000-0000-0000-0000-000000000012', '남의 아이 보강', 'schedule', current_date, false,
   'student', array['22220000-0000-0000-0000-000000000002']::uuid[], null, null, null),
  ('70000000-0000-0000-0000-000000000013', '남의 반 특강', 'schedule', current_date, false,
   'class', '{}', null, null, 'cc220000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000014', '나만 볼 상담', 'schedule', current_date, true,
   null, '{}', null, null, null),
  ('70000000-0000-0000-0000-000000000015', '교재 주문', 'todo', current_date, false,
   null, '{}', null, null, null),
  ('70000000-0000-0000-0000-000000000016', '우리 학교 중3만', 'schedule', current_date, false,
   'grade', '{}', '50000000-0000-0000-0000-000000000001', '중3', null);

-- 나이스 **전국 공통** — 비공개로 들어온다 (원장님: 「전국공통은 오히려 나만보기야.
-- 안 그러면 학생 학부모가 중요한 일정을 인식을 못 해」).
-- 수십 줄이 달력을 채우면 정작 봐야 할 우리 학교 시험이 그 사이에 묻힌다
insert into public.tasks (id, title, kind, due_on, private, deliver_scope, source, source_id)
values
  ('80000000-0000-0000-0000-000000000001', '[전국] 수능', 'schedule', current_date, true,
   null, 'neis', 'common:20261119:수능'),
  -- 원장님이 일부러 연 것은 보여야 한다
  ('80000000-0000-0000-0000-000000000002', '[전국] 열어둔 모의고사', 'schedule', current_date, false,
   'all', 'neis', 'common:20260901:모의고사');
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
  -- 'schedule'(보강만 하는 요일) 한 줄은 **일부러 열어둔 것**이다 (0096).
  --   회차를 세는 데 필요하고 비밀이 없다. 나머지(발송 열쇠)는 잠겨 있어야 한다
  union all select 'integrations',            count(*) from public.integrations where id <> 'schedule'
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

# 3) 일정은 **자기 것만** 보인다 (0091)
#    「일정은 해당 학교 학생이거나 일정에 학생이 연결된 경우에 노출」 (원장님)
SEEN=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select string_agg(title, ' / ' order by title) from public.tasks;
SQL
)
WANT='[전국] 열어둔 모의고사 / 우리 반 특강 / 우리 아이 보강 / 우리 학교 시험 / 전체 공지 휴강'
if [ "$SEEN" = "$WANT" ]; then
  echo "  일정은 우리 아이 것만 보입니다 (전국공통·대상 안 적은 것·남의 학교·남의 아이·할일 안 보임)"
else
  echo "  ❌ 일정 노출이 규칙과 다릅니다"
  echo "     보여야 할 것: $WANT"
  echo "     실제로 보임 : $SEEN"
  fail=1
fi

# 3-2) 휴강과 「보강만 하는 요일」 이 읽혀야 회차를 셀 수 있다 (0096)
#      못 읽으면 화면은 회차를 아예 안 적는다 — **틀린 회차는 없는 것보다 나쁘다**
CNT=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select (select count(*) from public.holidays)::text
       || '/' ||
       (select count(*) from public.integrations where id = 'schedule')::text;
SQL
)
if [ "$CNT" = "1/1" ]; then
  echo "  휴강과 보강요일 설정이 읽힙니다 (회차를 셀 수 있습니다)"
else
  echo "  ❌ 휴강·보강요일을 못 읽습니다 — 달력에 회차가 안 뜹니다 ($CNT)"
  fail=1
fi

# 3-3) 그렇다고 **발송 열쇠까지** 열리면 안 된다
KEY=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.integrations where id <> 'schedule';
SQL
)
if [ "$KEY" = "0" ]; then
  echo "  발송 열쇠(integrations)는 그대로 잠겨 있습니다"
else
  echo "  ❌ 발송 열쇠가 학부모에게 보입니다 ($KEY 줄)"
  fail=1
fi

# 4) 대신 써넣지는 못한다 — 기록이 거짓이 되면 안 된다
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


# ── 5) 오답 적기 — **아이만 적는다** (0097 · 0098) ──────────
echo
echo "  == 시험 결과 적기 (0098) =="

# 5-1) 어머니가 대신 적으면 안 된다. 기록이 아이 것이 아니게 된다
PW=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
insert into public.score_items (score_id, no, wrong, reason)
values ('55550000-0000-0000-0000-000000000001', 33, true, '실수했어요');
SQL
)
if echo "$PW" | grep -qi "policy\|permission\|denied"; then
  echo "  학부모는 아이 대신 오답을 못 적습니다"
else
  echo "  ❌ 학부모가 아이 대신 오답을 적을 수 있습니다 — 기록이 거짓이 됩니다"
  fail=1
fi

# 5-2) 어머니는 **읽을 수는** 있어야 한다 (상담 때 같이 보신다)
PR=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.score_items
 where score_id = '55550000-0000-0000-0000-000000000001';
SQL
)
if [ "$PR" = "1" ]; then
  echo "  학부모에게 우리 아이 오답은 보입니다"
else
  echo "  ❌ 학부모에게 우리 아이 오답이 안 보입니다 ($PR)"
  fail=1
fi

# ── 아이로 앉는다 ──────────────────────────────────
$Q -d chloe -c "delete from public._who; insert into public._who values ('d0000000-0000-0000-0000-000000000004');" >/dev/null 2>&1

# 5-3) 아이는 자기 오답을 적을 수 있어야 한다 (못 적으면 화면이 아무 소용 없다)
SW=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
insert into public.score_items (score_id, no, wrong, reason)
values ('55550000-0000-0000-0000-000000000001', 34, true, '단어를 몰랐어요');
select 'ok';
SQL
)
if echo "$SW" | grep -q "^ok$"; then
  echo "  아이는 자기 오답을 적을 수 있습니다"
else
  echo "  ❌ 아이가 자기 오답을 못 적습니다 — 오답 화면이 안 돕니다"
  echo "$SW" | sed 's/^/     /'
  fail=1
fi

# 5-4) 아이가 **자기가 낸 성적**은 고칠 수 있다
SU=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
update public.scores set raw_score = 80
 where id = '55550000-0000-0000-0000-000000000001';
select count(*) from public.scores
 where id = '55550000-0000-0000-0000-000000000001' and raw_score = 80;
SQL
)
if [ "$(echo "$SU" | tail -1)" = "1" ]; then
  echo "  아이는 자기가 낸 것을 고칠 수 있습니다"
else
  echo "  ❌ 아이가 자기가 낸 것을 못 고칩니다 — 잘못 적으면 두 줄이 됩니다"
  fail=1
fi

# 5-5) **선생님이 매긴 성적은 못 건드린다.** 아이가 자기 점수를 고칠 수
#      있으면 그 기록은 더 이상 성적이 아니다
ST=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
update public.scores set raw_score = 100
 where student_id = '11110000-0000-0000-0000-000000000001' and kind = 'school';
select count(*) from public.scores
 where student_id = '11110000-0000-0000-0000-000000000001' and kind = 'school' and raw_score = 88;
SQL
)
if [ "$(echo "$ST" | tail -1)" = "1" ]; then
  echo "  선생님이 매긴 성적은 아이가 못 고칩니다"
else
  echo "  ❌ 아이가 선생님이 매긴 성적을 고칠 수 있습니다"
  fail=1
fi

# 5-6) 남의 아이 성적에는 못 쓴다
# **id 를 콕 집어서 넣어본다.** select 로 고르면 RLS 가 그 줄을 안 보여줘서
# 0줄이 들어가고, 「막혔다」 와 「넣을 것이 없었다」 를 구분 못 한다
SO=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
insert into public.score_items (score_id, no, wrong)
values ('55550000-0000-0000-0000-000000000002', 1, true);
SQL
)
if echo "$SO" | grep -qi "policy\|permission\|denied"; then
  echo "  남의 아이 오답에는 못 씁니다"
else
  echo "  ❌ 아이가 남의 아이 오답을 적을 수 있습니다"
  fail=1
fi

exit $fail
