#!/usr/bin/env bash
# 학생 계정으로 **남의 것이 보이는지** 진짜 Postgres 에서 확인한다.
#
# 화면을 막는 것(미들웨어)과 데이터를 막는 것(RLS)은 다른 이야기다.
# 화면만 막으면, 주소를 바꾸는 대신 앱이 쓰는 통로로 직접 물어보는 사람에게는
# 그대로 다 나간다. 그래서 여기서는 **표에 직접 물어본다.**
#
#   · 학생 두 명(가·나)과 선생님 한 명을 만들고
#   · 학생 '가' 로 앉아서 모든 표를 한 번씩 훑는다
#   · 남의 줄이 한 줄이라도 보이면 실패
#
# "될 겁니다" 로는 아무것도 확인되지 않는다.
set -u
PG=/usr/lib/postgresql/16/bin
export PATH="$PG:$PATH"
D=/var/tmp/pgleak
PORT=55434

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

# Supabase 흉내 — auth.uid() 를 바꿔 앉을 수 있게 만든다
$Q -d chloe -c "
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create table if not exists public._who (id uuid);
grant select on public._who to authenticated, anon;
create or replace function auth.uid() returns uuid language sql stable as
  \$\$ select id from public._who limit 1 \$\$;" >/dev/null 2>&1

$Q -d chloe -v ON_ERROR_STOP=1 -f supabase/SETUP_ALL.sql >/dev/null 2>&1

# **이게 이 검사의 핵심이다.**
# Supabase 는 public 스키마의 모든 표를 anon·authenticated 에게 열어준다.
# 즉 로그인한 사람은 누구나 모든 표에 물어볼 수 있고, 그걸 막는 것은 RLS 하나뿐이다.
# 여기서도 똑같이 열어놓고 시작해야 진짜 확인이 된다.
$Q -d chloe >/dev/null 2>&1 <<'SQL'
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
SQL

# ── 사람 세 명 ────────────────────────────────────────
$Q -d chloe >/dev/null 2>&1 <<'SQL'
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),   -- 학생 가
  ('22222222-2222-2222-2222-222222222222'),   -- 학생 나
  ('33333333-3333-3333-3333-333333333333');   -- 원장
insert into public.profiles (id, role, name) values
  ('11111111-1111-1111-1111-111111111111', 'student', '학생가'),
  ('22222222-2222-2222-2222-222222222222', 'student', '학생나'),
  ('33333333-3333-3333-3333-333333333333', 'principal', '원장');
insert into public.students (id, name, profile_id, parent_phone, student_phone, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '가학생', '11111111-1111-1111-1111-111111111111', '010-1111-1111', '010-1111-0000', 'enrolled'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '나학생', '22222222-2222-2222-2222-222222222222', '010-2222-2222', '010-2222-0000', 'enrolled');
SQL

# 두 학생에게 똑같이 하나씩 깔아둔다 — '나' 것이 '가' 에게 보이면 실패다
$Q -d chloe >/dev/null 2>&1 <<'SQL'
insert into public.daily_reports (student_id, date, attendance_kind)
  select id, current_date, 'present' from public.students;
insert into public.attendance (student_id, date, status)
  select id, current_date, 'present' from public.students;
insert into public.student_notes (student_id, raw)
  select id, '상담 내용' from public.students;
insert into public.homework_submissions (student_id, date, kind, path)
  select id, current_date, 'photo', id::text || '/x.jpg' from public.students;
insert into public.study_sessions (student_id, date, seconds)
  select id, current_date, 60 from public.students;
insert into public.stay_tasks (student_id, date, title, status)
  select id, current_date, '남은 과제', 'open' from public.students;
insert into public.warning_actions (student_id, on_date, kind)
  select id, current_date, 'waive' from public.students;
insert into public.monthly_reports (student_id, ym, text)
  select id, to_char(current_date,'YYYY-MM'), '월말' from public.students;
insert into public.payments (student_id, ym, amount)
  select id, to_char(current_date,'YYYY-MM'), 300000 from public.students;
insert into public.integrations (id, enabled, config)
  values ('secret_test', true, '{"key":"sk-비밀"}'::jsonb)
  on conflict (id) do update set config = excluded.config;
insert into public.classes (id, name, days) values
  ('cccccccc-0000-0000-0000-000000000001', '가반', array['월']),
  ('cccccccc-0000-0000-0000-000000000002', '나반', array['화']);
insert into public.class_students (class_id, student_id) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002');

-- 공지 (0064) — '나' 앞으로만 간 것이 '가' 에게 보이면 안 된다
insert into public.notices (id, date, kind, scope, body, title) values
  ('dddddddd-0000-0000-0000-000000000001', current_date, 'deliver', 'student', '가 공지', '가'),
  ('dddddddd-0000-0000-0000-000000000002', current_date, 'deliver', 'student', '나 공지', '나');
insert into public.notice_receipts (notice_id, student_id) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('dddddddd-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002');

-- 영상 (0065) — 배정받지 않은 영상은 아예 안 보여야 한다
insert into public.videos (id, title, url, provider, vid) values
  ('eeeeeeee-0000-0000-0000-000000000001', '가 영상', 'https://youtu.be/aaa', 'youtube', 'aaa'),
  ('eeeeeeee-0000-0000-0000-000000000002', '나 영상', 'https://youtu.be/bbb', 'youtube', 'bbb');
insert into public.video_assignments (video_id, student_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002');
-- 학생·학부모가 보낸 알림 (0068) — '나' 것이 '가' 에게 보이면 안 된다
insert into public.requests (student_id, kind, from_date, body, photos)
  select id, 'absence', current_date, '가족 일정', array[id::text || '/paper.jpg'] from public.students;

-- 성적 (0072) — '나' 성적이 '가' 에게 보이면 안 된다
insert into public.scores (student_id, kind, taken_on, term, raw_score, full_score, grade)
  select id, 'school', current_date, '1학기 중간고사', 88, 100, 2 from public.students;

-- 달력 (0066) — 일정은 보이고, 할일과 '나만 보기' 는 안 보여야 한다
-- 일정은 **고른 대상에게만** 간다 (0092). 「전체」 를 골라야 전체에 보인다 —
-- 대상을 안 적은 것은 선생님만 보는 일정이다
insert into public.tasks (id, title, kind, due_on, private, deliver_scope) values
  ('ffffffff-0000-0000-0000-000000000001', '중간고사',      'schedule', current_date, false, 'all'),
  ('ffffffff-0000-0000-0000-000000000002', '나만 볼 상담',   'schedule', current_date, true,  'all'),
  ('ffffffff-0000-0000-0000-000000000003', '교재 주문',      'todo',     current_date, false, 'all'),
  ('ffffffff-0000-0000-0000-000000000004', '대상 안 적음',   'schedule', current_date, false, null);

insert into public.video_views (video_id, student_id, opens, done_at) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, now()),
  ('eeeeeeee-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 1, now());
SQL

# ── 학생 '가' 로 앉는다 ──────────────────────────────
$Q -d chloe -c "delete from public._who; insert into public._who values ('11111111-1111-1111-1111-111111111111');" >/dev/null 2>&1

# 남의 것이 몇 줄이나 보이나 (학생 '가' 는 자기 것만 보여야 한다)
LEAK=$($Q -d chloe -tA <<'SQL' 2>&1
set role authenticated;
select t || ': ' || n from (
  select 'students(남의 이름·전화)' t, count(*) n from public.students where name <> '가학생'
  union all select 'daily_reports',        count(*) from public.daily_reports        where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'attendance',           count(*) from public.attendance           where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'student_notes(상담)',  count(*) from public.student_notes        where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'homework_submissions', count(*) from public.homework_submissions where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'study_sessions',       count(*) from public.study_sessions       where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'stay_tasks',           count(*) from public.stay_tasks           where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'warning_actions',      count(*) from public.warning_actions      where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'monthly_reports',      count(*) from public.monthly_reports      where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'payments(수강료)',     count(*) from public.payments             where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'profiles(다른 사람)',  count(*) from public.profiles             where id <> '11111111-1111-1111-1111-111111111111'
  union all select 'integrations(열쇠)',   count(*) from public.integrations
  union all select 'class_students(남의 반배정)', count(*) from public.class_students where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'classes(안 듣는 반)',  count(*) from public.classes             where id <> 'cccccccc-0000-0000-0000-000000000001'
  union all select 'notices(남의 공지)',   count(*) from public.notices              where id <> 'dddddddd-0000-0000-0000-000000000001'
  union all select 'notice_receipts(남에게 간 것)', count(*) from public.notice_receipts where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'videos(안 받은 영상)',  count(*) from public.videos               where id <> 'eeeeeeee-0000-0000-0000-000000000001'
  union all select 'video_assignments(남의 배정)', count(*) from public.video_assignments where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'video_views(남이 봤나)', count(*) from public.video_views         where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'tasks(할일·나만보기·대상없음)', count(*) from public.tasks           where id <> 'ffffffff-0000-0000-0000-000000000001'
  union all select 'requests(남의 알림)',   count(*) from public.requests             where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select 'scores(남의 성적)',     count(*) from public.scores               where student_id <> 'aaaaaaaa-0000-0000-0000-000000000001'
) x where n > 0 order by 1;
SQL
)

# 반대로 **자기 것은 보여야 한다.** 다 막아버리면 학생 화면이 안 뜬다.
# 아무것도 안 보이는데 '안전합니다' 라고 하면 그게 제일 나쁘다.
MINE=$($Q -d chloe -tA <<'SQL' 2>&1
set role authenticated;
select t || '=' || n from (
  select '내 정보' t, count(*) n from public.students where name = '가학생'
  union all select '내 리포트',   count(*) from public.daily_reports where student_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select '내 제출물',   count(*) from public.homework_submissions where student_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select '내 반',       count(*) from public.classes where id = 'cccccccc-0000-0000-0000-000000000001'
  union all select '내 공지',     count(*) from public.notices where id = 'dddddddd-0000-0000-0000-000000000001'
  union all select '내 영상',     count(*) from public.videos  where id = 'eeeeeeee-0000-0000-0000-000000000001'
  union all select '내가 본 기록', count(*) from public.video_views where student_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select '나눠준 일정', count(*) from public.tasks where id = 'ffffffff-0000-0000-0000-000000000001'
  union all select '내가 보낸 알림', count(*) from public.requests where student_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  union all select '내 성적', count(*) from public.scores where student_id = 'aaaaaaaa-0000-0000-0000-000000000001'
) x where n = 0 order by 1;
SQL
)

# 남의 것을 **고칠 수 있나** — 읽기만 막고 쓰기를 열어두는 실수가 흔하다
WRITE=$($Q -d chloe -tA <<'SQL' 2>&1
set role authenticated;
do $$
begin
  begin
    update public.daily_reports set attendance_kind = 'absent'
      where student_id = 'bbbbbbbb-0000-0000-0000-000000000002';
    if found then raise notice 'LEAK 남의 데일리리포트를 고칠 수 있음'; end if;
  exception when others then null; end;
  begin
    update public.students set name = '바뀜'
      where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    if found then raise notice 'LEAK 남의 학생 정보를 고칠 수 있음'; end if;
  exception when others then null; end;
  begin
    update public.profiles set role = 'principal'
      where id = '11111111-1111-1111-1111-111111111111';
    if found then raise notice 'LEAK 학생이 스스로 선생님이 될 수 있음'; end if;
  exception when others then null; end;
  begin
    delete from public.students where id = 'bbbbbbbb-0000-0000-0000-000000000002';
    if found then raise notice 'LEAK 남의 학생을 지울 수 있음'; end if;
  exception when others then null; end;
end $$;
SQL
)

bad=0
if [ -n "$LEAK" ]; then
  echo "  ⚠ 학생에게 보이면 안 되는 것이 보입니다:"
  echo "$LEAK" | sed 's/^/      /'
  bad=1
fi
if echo "$WRITE" | grep -q LEAK; then
  echo "  ⚠ 학생이 남의 것을 고칠 수 있습니다:"
  echo "$WRITE" | grep LEAK | sed 's/^.*LEAK/      /'
  bad=1
fi
if [ -n "$MINE" ]; then
  echo "  ⚠ 너무 막혀서 학생 본인 것도 안 보입니다 (학생 화면이 빈 채로 뜹니다):"
  echo "$MINE" | sed 's/^/      /'
  bad=1
fi
[ $bad -eq 0 ] && echo "  남의 것은 안 보이고, 자기 것은 보입니다"
exit $bad
