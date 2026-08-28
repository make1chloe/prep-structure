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
. "$(dirname "$0")/pg-boot.sh"
pg_boot pgparent 55436 /var/tmp/pgparent || { pg_skip "학부모에게 자기 아이 것이 보이나 (RLS)"; exit 0; }
trap pg_stop EXIT
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
-- **덮어써야 한다.** auth.users 에 넣으면 방아쇠(on_auth_user_created)가
-- profiles 를 먼저 만든다 (역할은 기본값 'student'). 그냥 insert 하면 열쇠가
-- 부딪혀 조용히 실패하고, **원장이 학생 역할로 남는다** — 실제로 그랬다.
-- 그 바람에 is_staff() 가 어디서도 참이 아니었고, 검사가 그만큼 헐거웠다.
insert into public.profiles (id, role, name) values
  ('a0000000-0000-0000-0000-000000000001', 'parent',    '가 학부모'),
  ('b0000000-0000-0000-0000-000000000002', 'parent',    '나 학부모'),
  ('c0000000-0000-0000-0000-000000000003', 'principal', '원장')
on conflict (id) do update set role = excluded.role, name = excluded.name;
-- 아이 본인 계정 — 오답 적기(0098) 규칙을 보려면 아이로도 앉아봐야 한다
insert into auth.users (id) values ('d0000000-0000-0000-0000-000000000004');
insert into public.profiles (id, role, name) values
  ('d0000000-0000-0000-0000-000000000004', 'student', '가학생')
on conflict (id) do update set role = excluded.role, name = excluded.name;
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
-- 차례는 **바이트 차례(C)** 로 못 박는다. 안 그러면 어느 Postgres 냐에
-- 따라 한글 정렬이 달라져서, 보이는 것이 똑같아도 이 검사가 틀린다
-- (2026-08-28 도커로 되살렸더니 그것부터 걸렸다 — 자물쇠 이야기가 아니다)
select string_agg(title, ' / ' order by title collate "C") from public.tasks;
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


# ── 6) 성적 공개 대상 (0101) ──────────────────────────────
echo
echo "  == 성적 공개 대상 (0101) =="

# 아직 어머니로 앉아 있는지 확실히 한다
$Q -d chloe -c "delete from public._who; insert into public._who values ('a0000000-0000-0000-0000-000000000001');" >/dev/null 2>&1

seen() {  # $1 = 보는 사람 uuid → 그 아이 성적이 몇 줄 보이나
  $Q -d chloe -c "delete from public._who; insert into public._who values ('$1');" >/dev/null 2>&1
  $Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.scores where student_id = '$MINE';
SQL
}
share() { $Q -d chloe -c "update public.students set score_share='$1' where id='$MINE';" >/dev/null 2>&1; }

PARENT='a0000000-0000-0000-0000-000000000001'
KID='d0000000-0000-0000-0000-000000000004'

# 기본 both — **지금까지의 동작이 그대로여야 한다.** SQL 을 실행하는 순간
# 누군가의 화면에서 자료가 사라지면 안 된다
share both
P=$(seen $PARENT); K=$(seen $KID)
if [ "$P" -gt 0 ] && [ "$K" -gt 0 ]; then
  echo "  둘 다 — 학생·학부모 모두 보입니다 (기본값)"
else
  echo "  ❌ 「둘 다」 인데 안 보입니다 (학부모 $P · 학생 $K)"; fail=1
fi

# 학부모만 — 아이 화면에서는 사라져야 한다.
# 다만 **아이가 스스로 낸 것(source='form')은 늘 보인다**
share parent
P=$(seen $PARENT); K=$(seen $KID)
if [ "$P" -gt 0 ] && [ "$K" = "1" ]; then
  echo "  학부모만 — 어머니께만 보이고, 아이에게는 자기가 낸 것만 남습니다"
else
  echo "  ❌ 「학부모만」 이 안 맞습니다 (학부모 $P · 학생 $K, 학생은 자기가 낸 1건만 보여야 함)"; fail=1
fi

# 학생만 — 어머니 화면에서 통째로 사라져야 한다
share student
P=$(seen $PARENT); K=$(seen $KID)
if [ "$P" = "0" ] && [ "$K" -gt 0 ]; then
  echo "  학생만 — 아이에게만 보이고 어머니께는 안 보입니다"
else
  echo "  ❌ 「학생만」 이 안 맞습니다 (학부모 $P · 학생 $K)"; fail=1
fi

# 비공개 — 아무에게도. 아이가 낸 것만 아이에게 남는다
share none
P=$(seen $PARENT); K=$(seen $KID)
if [ "$P" = "0" ] && [ "$K" = "1" ]; then
  echo "  비공개 — 아무에게도 안 보입니다 (아이가 낸 것만 아이에게)"
else
  echo "  ❌ 「비공개」 가 안 맞습니다 (학부모 $P · 학생 $K)"; fail=1
fi

# **문항별 오답도 같이 막혀야 한다.** 성적은 감췄는데 오답이 보이면 감춘 것이 아니다
$Q -d chloe -c "delete from public._who; insert into public._who values ('$PARENT');" >/dev/null 2>&1
IT=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.score_items
 where score_id in (select id from public.scores where student_id = '$MINE');
SQL
)
if [ "$IT" = "0" ]; then
  echo "  감추면 문항별 오답도 같이 막힙니다"
else
  echo "  ❌ 성적은 감췄는데 오답이 보입니다 ($IT 줄)"; fail=1
fi

# 되돌려 둔다 (뒤에 검사가 더 붙어도 기본값에서 시작하게)
share both

# ── 6) 학생이 부르면 선생님 폰에 알림이 갈 수 있나 (0104) ──────
#
# 원장님 (2026-08-06) — 「학생이 도움을 요청해도 알림이 안 와」
#
# 코드는 멀쩡했는데 **읽기 규칙**에 막혀 있었다. `pushToStaff` 가 학생의
# 자격으로 DB 를 읽는데, 알림 열쇠(integrations)는 원장님만, 선생님 기기
# (push_subscriptions)는 선생님만 읽을 수 있다. 둘 다 학생에게는 **빈 값**
# 으로 오고, 그러면 「알림을 안 쓰시는구나」 하고 조용히 넘어간다.
#
# 오류가 안 나는 실패라 눈으로는 못 찾는다. 여기서 못 박아 둔다.
echo
echo "  == 학생이 부르면 선생님께 알림 (0104) =="

# 알림 열쇠와 선생님 기기를 심는다
$Q -d chloe -c "
insert into public.integrations (id, enabled, config) values
  ('push', true, '{\"publicKey\":\"pub\",\"privateKey\":\"priv\",\"contact\":\"mailto:a@b\"}'::jsonb)
on conflict (id) do update set config = excluded.config;
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values ('c0000000-0000-0000-0000-000000000003', 'https://push.example/boss', 'p', 'a')
on conflict (endpoint) do nothing;" >/dev/null 2>&1

# **학생 자격으로** 대상을 찾을 수 있나
$Q -d chloe -c "delete from public._who; insert into public._who values ('$KID');" >/dev/null 2>&1
N=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.staff_push_targets();
SQL
)
if [ "$N" = "1" ]; then
  echo "  학생이 불러도 보낼 곳을 찾습니다"
else
  echo "  ❌ 학생이 부르면 보낼 곳을 못 찾습니다 ($N)"; fail=1
fi

# **예전 길로는 못 찾는다** — 이것이 안 됐던 까닭이다 (고쳤다는 증거)
K=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.integrations where id = 'push';
SQL
)
if [ "$K" = "0" ]; then
  echo "  알림 열쇠 자체는 학생에게 그대로 잠겨 있습니다"
else
  echo "  ❌ 학생이 알림 열쇠를 직접 읽습니다 ($K 줄)"; fail=1
fi

# **학원 밖 사람은 못 부른다**
$Q -d chloe -c "
insert into auth.users (id) values ('99999999-0000-0000-0000-000000000000') on conflict do nothing;
insert into public.profiles (id, role, name) values ('99999999-0000-0000-0000-000000000000','student','남')
on conflict (id) do update set role = 'student';
delete from public._who; insert into public._who values ('99999999-0000-0000-0000-000000000000');" >/dev/null 2>&1
O=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.staff_push_targets();
SQL
)
if [ "$O" = "0" ]; then
  echo "  학원과 상관없는 계정은 보낼 곳을 못 얻습니다"
else
  echo "  ❌ 학원 밖 계정이 알림 열쇠를 얻습니다 ($O)"; fail=1
fi

# ── 선생님이 보내실 때도 같은 병이 있었다 (0104, push_keys) ──
#
# 알림 열쇠는 **원장님만** 읽는다 (0015). 강사·조교가 리포트를 올리거나
# 댓글을 달면 열쇠가 빈 값으로 와서 **조용히 안 보내진다.** 지금은 원장님
# 혼자 쓰셔서 안 드러날 뿐이다 — 선생님이 한 분 늘면 바로 터진다.
# **먼저 _who 를 비운다** — 여기 auth.uid() 는 _who 한 줄이다. 바로 위에서
# 「학원 밖 학생」 을 앉혀둔 채로 강사 행을 심으면 0176 의 역할 자물쇠가
# 그 INSERT 를 막는다(스태프 3종 심기 금지). 그러면 강사 계정이 아예 안
# 생겨서 아래가 「강사가 열쇠를 못 얻는다」 로 뜬다 — 자물쇠는 제 일을 한
# 것이고, 틀린 것은 심는 차례다. 비우면 사람 아닌 자리(비상구)로 들어간다.
$Q -d chloe -c "
delete from public._who;
insert into auth.users (id) values ('e0000000-0000-0000-0000-000000000005') on conflict do nothing;
insert into public.profiles (id, role, name) values
  ('e0000000-0000-0000-0000-000000000005', 'instructor', '강사')
on conflict (id) do update set role = excluded.role, name = excluded.name;
delete from public._who; insert into public._who values ('e0000000-0000-0000-0000-000000000005');" >/dev/null 2>&1
T=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.push_keys();
SQL
)
R=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.integrations where id = 'push';
SQL
)
if [ "$T" = "1" ] && [ "$R" = "0" ]; then
  echo "  강사도 알림을 보낼 수 있습니다 (표는 여전히 원장님만)"
else
  echo "  ❌ 강사가 알림 열쇠를 못 얻습니다 (열쇠 $T · 표 $R)"; fail=1
fi

# 학생은 이 길로는 못 얻는다 (학생은 staff_push_targets 로만 닿는다)
$Q -d chloe -c "delete from public._who; insert into public._who values ('$KID');" >/dev/null 2>&1
S=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.push_keys();
SQL
)
if [ "$S" = "0" ]; then
  echo "  학생은 이 길로 열쇠를 못 얻습니다"
else
  echo "  ❌ 학생이 push_keys 로 열쇠를 얻습니다 ($S)"; fail=1
fi

echo
echo "  == 학생·학부모가 알림을 켤 수 있나 (0110) =="
#
# **알림을 켜려면 공개키가 있어야 한다.** 그 키는 integrations 에 있고
# 그 표는 원장님만 읽는다 (0015) — 그래서 학생·학부모 폰은 「알림 준비가
# 아직 안 됐어요」 만 보고 영영 못 켰다. 원장님 폰은 읽히니까 켜졌고,
# 설정 화면에도 「알림 준비됨」 이라고 떠서 **몇 주 동안 안 보였다.**
#
# 공개키는 감출 것이 아니다 — 이것만으로는 아무에게도 못 보낸다.
$Q -d chloe -c "delete from public._who; insert into public._who values ('$KID');" >/dev/null 2>&1
P=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select coalesce(public.push_public_key(), '(없음)');
SQL
)
if [ "$P" = "pub" ]; then
  echo "  학생이 공개키를 받습니다 (알림을 켤 수 있습니다)"
else
  echo "  ❌ 학생이 공개키를 못 받습니다 ($P)"; fail=1
fi

# **비밀키는 여전히 막혀 있어야 한다** — 그것까지 새면 아무나 학생 폰에
# 알림을 보낼 수 있게 된다
V=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.integrations where id = 'push';
SQL
)
if [ "$V" = "0" ]; then
  echo "  비밀키가 든 표는 그대로 잠겨 있습니다"
else
  echo "  ❌ 학생이 알림 열쇠 표를 읽습니다 ($V 줄)"; fail=1
fi

# 학부모도 마찬가지다 — 어머니 폰에도 알림이 가야 한다
$Q -d chloe -c "delete from public._who; insert into public._who values ('a0000000-0000-0000-0000-000000000001');" >/dev/null 2>&1
PM=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select coalesce(public.push_public_key(), '(없음)');
SQL
)
if [ "$PM" = "pub" ]; then
  echo "  학부모도 공개키를 받습니다"
else
  echo "  ❌ 학부모가 공개키를 못 받습니다 ($PM)"; fail=1
fi

echo
echo "  == 내 폰에 테스트 알림을 보낼 수 있나 (0111) =="
#
# 원장님 (2026-08-07) — 「안드로이드폰에서 알림이 안 켜져」
#
# 안 되는 폰에서 **직접 눌러봐야** 어디서 막혔는지 안다. 그런데 테스트
# 단추가 선생님 전용이었다 — 보낼 열쇠를 원장님만 읽기 때문이다. 정작
# 안 되는 사람이 확인할 길이 없었다.
#
# 0111 은 **자기 기기에 한해서만** 문을 연다. 여기서 두 가지를 못 박는다 —
#   · 내 폰은 나온다
#   · 남의 폰은 안 나온다   ← 이게 깨지면 아무나 남에게 알림을 보낸다
$Q -d chloe -c "
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  values ('$KID', 'https://push.example/kid', 'p', 'a')
on conflict (endpoint) do nothing;" >/dev/null 2>&1

$Q -d chloe -c "delete from public._who; insert into public._who values ('$KID');" >/dev/null 2>&1
SELF=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) || '/' || coalesce(max(endpoint), '-') from public.self_push_targets();
SQL
)
if [ "$SELF" = "1/https://push.example/kid" ]; then
  echo "  학생이 자기 폰으로 테스트 알림을 보낼 수 있습니다"
else
  echo "  ❌ 학생이 자기 폰을 못 찾습니다 ($SELF)"; fail=1
fi

# 원장님 폰(boss)까지 딸려 나오면 안 된다 — 위 결과가 1줄이라는 것으로
# 이미 확인되지만, 어느 줄인지까지 봐야 진짜다 (endpoint 를 같이 본다)

# 열쇠가 아예 없을 때는 **없다고 말할 수 있어야** 한다.
# 「기기가 없다」 와 「열쇠가 없다」 를 못 가르면 또 헤맨다
R=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select public.push_keys_ready();
SQL
)
if [ "$R" = "t" ]; then
  echo "  열쇠가 있는지 없는지를 학생도 물어볼 수 있습니다"
else
  echo "  ❌ push_keys_ready 가 t 가 아닙니다 ($R)"; fail=1
fi

# 그래도 **열쇠 표 자체는** 여전히 안 읽혀야 한다
Z=$($Q -d chloe -tA <<SQL 2>&1
set role authenticated;
select count(*) from public.integrations where id = 'push';
SQL
)
if [ "$Z" = "0" ]; then
  echo "  열쇠 표는 그대로 잠겨 있습니다"
else
  echo "  ❌ 학생이 열쇠 표를 읽습니다 ($Z 줄)"; fail=1
fi


# ── 8) 내신 자료 수령 체크 (0178) ────────────────────────────
#
# 원장님 (8/28) — 「자료 준비가 끝난 것만 아이 화면에 뜬다」
#
# **왜 열 줄이나 되나.** 이 기능의 첫 판(v1)은 정책 안에서 같은 표를 조인해
# 무한 재귀를 냈다. 그런데 「정책이 서 있나」만 보는 확인은 **전부 초록**이었다 —
# 재귀는 **조회하는 순간에만** 터지기 때문이다. 그래서 여기서는 반드시
# **아이로 앉아서 세 표를 실제로 읽어본다** (#2·#3 이 그 구멍이었다).
# psql 은 재귀 정책에서 ERROR 로 죽으므로, 결과가 숫자가 아니게 되어 잡힌다.
echo
echo "  == 내신 자료 수령 체크 (0178) =="

RPARENT='a0000000-0000-0000-0000-000000000001'
RKID='d0000000-0000-0000-0000-000000000004'
RMINE='11110000-0000-0000-0000-000000000001'
ROTHER='22220000-0000-0000-0000-000000000002'

# 시험 하나 · 범위 하나 · 자료 넷 (준비끝 종이 / 준비끝 파일 / 준비중 / 남의 것)
$Q -d chloe -c "delete from public._who; insert into public._who values ('c0000000-0000-0000-0000-000000000003');" >/dev/null 2>&1
$Q -d chloe >/dev/null 2>&1 <<'SQL'
insert into public.exam_periods (id, school, name, from_date, to_date) values
  ('e1110000-0000-0000-0000-0000000000e1', '옥련여고', '1학기기말', current_date, current_date)
on conflict (id) do nothing;
insert into public.prep_scopes (id, exam_id, name) values
  ('50000000-0000-0000-0000-000000000001', 'e1110000-0000-0000-0000-0000000000e1', '1과')
on conflict (id) do nothing;
-- 갈래는 두 겹이다 (0053) — 부모까지 펴지는지 봐야 한다
insert into public.prep_material_types (id, name) values
  ('70000000-0000-0000-0000-000000000000', '이그잼') on conflict (id) do nothing;
insert into public.prep_material_types (id, parent_id, name) values
  ('70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000000', '변형문제')
  on conflict (id) do nothing;
insert into public.prep_materials
  (id, scope_id, type_id, name, need_make, need_print, need_card, made_at, printed_at, give_kind) values
  ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','준비끝종이',true, true, false, now(), now(), 'paper'),
  ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',null,'준비끝파일',false,false,false, null,  null,  'file'),
  ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000001',null,'준비중',    true, true, false, now(), null,  'paper'),
  ('60000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000001',null,'남의자료',  false,false,false, null,  null,  'paper')
on conflict (id) do nothing;
insert into public.prep_assignments (material_id, student_id) values
  ('60000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000002','11110000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000003','11110000-0000-0000-0000-000000000001'),
  ('60000000-0000-0000-0000-000000000004','22220000-0000-0000-0000-000000000002')
on conflict (material_id, student_id) do nothing;
insert into public.prep_receipts (material_id, student_id, received_at) values
  ('60000000-0000-0000-0000-000000000004','22220000-0000-0000-0000-000000000002', now())
on conflict (material_id, student_id) do nothing;
SQL

# 아이로 앉는다
$Q -d chloe -c "delete from public._who; insert into public._who values ('$RKID');" >/dev/null 2>&1
rq() { $Q -d chloe -tA <<SQL 2>&1
set role authenticated;
$1
SQL
}

# #1 자료 이름 — 준비 끝난 둘만 (준비중·남의 것은 안 보인다)
N=$(rq "select count(*) from public.prep_materials;")
if [ "$N" = "2" ]; then
  echo "  아이에게 준비 끝난 자료 둘만 보입니다"
else
  echo "  ❌ 아이가 보는 자료 수가 2 가 아닙니다 ($N)"; fail=1
fi

# #2·#3 종류·범위 — **여기가 v1 이 죽던 자리다.** 재귀면 숫자가 아니라 ERROR 가 온다
T=$(rq "select count(*) from public.prep_material_types;")
if [ "$T" = "2" ]; then
  echo "  자료 종류가 부모 갈래까지 읽힙니다 (재귀 없음)"
else
  echo "  ❌ 자료 종류가 2 가 아닙니다 ($T) — 무한 재귀거나 정책 누락"; fail=1
fi
S=$(rq "select count(*) from public.prep_scopes;")
if [ "$S" = "1" ]; then
  echo "  자료 범위가 읽힙니다"
else
  echo "  ❌ 자료 범위가 1 이 아닙니다 ($S)"; fail=1
fi

# #4 남의 수령 기록
O=$(rq "select count(*) from public.prep_receipts where student_id <> '$RMINE';")
if [ "$O" = "0" ]; then
  echo "  남의 수령 기록은 안 보입니다"
else
  echo "  ❌ 남의 수령 기록이 보입니다 ($O 줄)"; fail=1
fi

# #5 준비 안 끝난 자료
W=$(rq "select count(*) from public.prep_materials where id = '60000000-0000-0000-0000-000000000003';")
if [ "$W" = "0" ]; then
  echo "  준비 중인 자료는 아이에게 안 뜹니다 (원장 확정 8/28)"
else
  echo "  ❌ 준비도 안 끝난 자료가 아이에게 보입니다"; fail=1
fi

# #6~#9 네 동사 — 되는 것은 되고, 안 되는 것은 막혀야 한다
V=$(rq "
do \$\$
declare n int;
begin
  begin
    insert into public.prep_receipts (material_id, student_id, received_at)
      values ('60000000-0000-0000-0000-000000000001','$RMINE', now());
  exception when others then raise notice 'LEAK 내 것도 못 누른다'; end;
  begin
    insert into public.prep_receipts (material_id, student_id, received_at)
      values ('60000000-0000-0000-0000-000000000001','$ROTHER', now());
    raise notice 'LEAK 남의 학생 이름으로 누를 수 있다';
  exception when others then null; end;
  begin
    insert into public.prep_receipts (material_id, student_id, received_at)
      values ('60000000-0000-0000-0000-000000000003','$RMINE', now());
    raise notice 'LEAK 준비도 안 끝난 자료를 미리 누를 수 있다';
  exception when others then null; end;
  begin
    insert into public.prep_receipts (material_id, student_id, received_at)
      values ('60000000-0000-0000-0000-000000000004','$RMINE', now());
    raise notice 'LEAK 배정도 안 된 자료를 누를 수 있다';
  exception when others then null; end;
  delete from public.prep_receipts where student_id = '$RMINE';
  get diagnostics n = row_count;
  if n > 0 then raise notice 'LEAK 학생이 자기 수령 기록을 지울 수 있다'; end if;
  update public.prep_receipts set received_at = null where student_id = '$RMINE';
  get diagnostics n = row_count;
  if n = 0 then raise notice 'LEAK 되돌리기가 안 된다'; end if;
  begin
    update public.prep_receipts set material_id = '60000000-0000-0000-0000-000000000003'
      where student_id = '$RMINE';
    raise notice 'LEAK 준비 안 끝난 자료로 갈아끼울 수 있다';
  exception when others then null; end;
end \$\$;")
if echo "$V" | grep -q LEAK; then
  echo "  ❌ 수령 체크의 쓰기 규칙이 헐겁습니다:"
  echo "$V" | grep LEAK | sed 's/^.*LEAK/      /'; fail=1
else
  echo "  내 것만 누를 수 있고, 되돌릴 수 있고, 지울 수는 없습니다"
fi

# #10 어머니 — 원장 결정 4 「학부모에게 안 보인다」
$Q -d chloe -c "delete from public._who; insert into public._who values ('$RPARENT');" >/dev/null 2>&1
PM=$(rq "select (select count(*) from public.prep_receipts)
            + (select count(*) from public.prep_materials)
            + (select count(*) from public.prep_scopes)
            + (select count(*) from public.prep_material_types);")
if [ "$PM" = "0" ]; then
  echo "  어머니께는 내신 자료가 한 줄도 안 보입니다"
else
  echo "  ❌ 어머니께 내신 자료가 보입니다 (합 $PM 줄)"; fail=1
fi

exit $fail
