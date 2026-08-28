#!/usr/bin/env bash
# **열람 도장(0180) 과 오늘 배운 것(0181) 을 진짜 세션으로 확인한다.**
#
# 왜 따로 필요한가 —
#
#   이 둘은 **학부모·학생이 쓰는 표**다. 원장님 미리보기(is_staff)로는
#   구멍이 절대 안 잡힌다 — 0090·0158·0166 이 전부 그렇게 몇 주씩 숨었다.
#   그리고 0175 는 update 만 잠그고 insert·delete 를 안 잠가서 뚫렸다.
#   그래서 여기서는 **세 동사를 전부** 눌러본다.
#
#   또 하나. 이 둘은 「보이면 안 되는 것」 과 「보여야 하는 것」 이 서로
#   반대다:
#     · 0180 열람 도장  — 학부모가 **찍을 수 있어야** 한다 (못 찍으면
#       원장 화면이 영원히 「아직」 이다 — 0158 과 똑같은 조용한 실패)
#     · 0181 배운 것    — 학부모가 **못 읽어야** 한다 (원장 확정: 원본은
#       학부모에게 공개하지 않는다)
set -u
. "$(dirname "$0")/pg-boot.sh"
pg_boot pgseen 55437 /var/tmp/pgseen || { pg_skip "열람 도장·오늘 배운 것 (RLS)"; exit 0; }
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

$Q -d chloe >/dev/null 2>&1 <<'SQL'
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
SQL

# ── 어머니 · 아이 '가' · 남의 아이 '나' · 원장 ──
$Q -d chloe >/dev/null 2>&1 <<'SQL'
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-000000000001'),   -- 가 어머니
  ('b0000000-0000-0000-0000-000000000002'),   -- 나 어머니
  ('c0000000-0000-0000-0000-000000000003'),   -- 원장
  ('d0000000-0000-0000-0000-000000000004'),   -- 가 학생 본인
  ('e0000000-0000-0000-0000-000000000005');   -- 나 학생 본인
insert into public.profiles (id, role, name) values
  ('a0000000-0000-0000-0000-000000000001', 'parent',    '가 학부모'),
  ('b0000000-0000-0000-0000-000000000002', 'parent',    '나 학부모'),
  ('c0000000-0000-0000-0000-000000000003', 'principal', '원장'),
  ('d0000000-0000-0000-0000-000000000004', 'student',   '가학생'),
  ('e0000000-0000-0000-0000-000000000005', 'student',   '나학생')
on conflict (id) do update set role = excluded.role, name = excluded.name;
insert into public.students (id, name, status, profile_id) values
  ('11110000-0000-0000-0000-000000000001', '가학생', 'enrolled', 'd0000000-0000-0000-0000-000000000004'),
  ('22220000-0000-0000-0000-000000000002', '나학생', 'enrolled', 'e0000000-0000-0000-0000-000000000005');
insert into public.parent_student (parent_profile_id, student_id) values
  ('a0000000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-000000000002');
insert into public.daily_reports (id, student_id, date, attendance_kind, report_written, closed_at, sent_at)
values
  ('dd110000-0000-0000-0000-000000000001', '11110000-0000-0000-0000-000000000001',
   current_date, 'present', true, now(), now()),
  ('dd220000-0000-0000-0000-000000000002', '22220000-0000-0000-0000-000000000002',
   current_date, 'present', true, now(), now());
SQL

fail=0
sit() { $Q -d chloe -c "delete from public._who; insert into public._who values ('$1');" >/dev/null 2>&1; }
# 한 줄 SQL 을 authenticated 로 돌리고 결과만 (오류면 오류 글이 나온다)
as() { $Q -d chloe -tA -c "set role authenticated; $1" 2>&1 | tr -d ' \n'; }
say_ok()  { echo "  $1"; }
say_bad() { echo "  ❌ $1"; fail=1; }

MINE='dd110000-0000-0000-0000-000000000001'
OTHER='dd220000-0000-0000-0000-000000000002'

echo "  == 리포트 열람 도장 (0180) =="

# 학부모에게는 **읽기 정책이 없다** (도장은 찍기만 하면 된다 — 화면에
# 되읽을 일이 없다). 그래서 확인은 **원장 세션으로** 해야 한다.
# 학부모 세션에서 세면 늘 0 이 나와, 안 찍힌 것과 구별이 안 된다.
MOM='a0000000-0000-0000-0000-000000000001'
DAD='b0000000-0000-0000-0000-000000000002'
staff() { sit c0000000-0000-0000-0000-000000000003; as "$1"; }

# 1) 어머니가 **자기 아이 리포트에 도장을 찍을 수 있어야** 한다.
#    못 찍으면 오류도 안 나고 0행으로 끝나 원장 화면이 영원히 「아직」 이다
#    (0158 이 딱 그 모양으로 몇 주 숨었다).
sit $MOM
as "insert into public.report_reads (daily_report_id) values ('$MINE');" >/dev/null
R=$(staff "select count(*) from public.report_reads where daily_report_id='$MINE';")
[ "$R" = "1" ] && say_ok "어머니가 자기 아이 리포트에 열람 도장을 찍습니다" \
               || say_bad "어머니가 열람 도장을 못 찍습니다 (원장 화면이 영원히 「아직」 입니다) — $R"

# 2) 시각·주인을 **속일 수 없어야** 한다 (트리거가 서버 값으로 덮어쓴다)
R=$(staff "select case when read_at > now() - interval '1 minute' and reader_id = '$MOM' then 'ok' else 'bad' end from public.report_reads where daily_report_id='$MINE';")
[ "$R" = "ok" ] && say_ok "도장의 시각·주인은 서버가 정합니다" \
                || say_bad "도장의 시각·주인을 화면이 정하고 있습니다 — $R"

# 남의 이름·딴 시각을 실어 보내도 서버 값으로 눌린다
sit $MOM
as "delete from public.report_reads where daily_report_id='$MINE';" >/dev/null
staff "delete from public.report_reads where daily_report_id='$MINE';" >/dev/null
sit $MOM
as "insert into public.report_reads (daily_report_id, reader_id, read_at) values ('$MINE','$DAD','2000-01-01');" >/dev/null
R=$(staff "select reader_id::text || '|' || case when read_at > now() - interval '1 minute' then 'now' else 'past' end from public.report_reads where daily_report_id='$MINE';")
[ "$R" = "$MOM|now" ] && say_ok "남의 이름으로 · 딴 시각으로는 못 찍습니다" \
                      || say_bad "남의 이름으로 찍히거나 시각이 바뀌었습니다 — $R"

# 3) **남의 아이** 리포트에는 못 찍어야 한다
sit $MOM
R=$(as "insert into public.report_reads (daily_report_id) values ('$OTHER');")
case "$R" in *policy*) say_ok "남의 아이 리포트에는 못 찍습니다" ;;
  *) say_bad "남의 아이 리포트에 도장이 찍혔습니다 — $R" ;; esac

# 4) **세 동사** — 찍은 뒤에 update·delete 로 되돌릴 수 없어야 한다.
#    정책이 없는 동사는 오류 없이 **0행**으로 끝난다 — 그래서 결과를
#    원장 세션에서 눈으로 세어 확인한다 (0175 가 여기서 뚫렸다).
sit $MOM
as "update public.report_reads set read_at = '2000-01-01' where daily_report_id='$MINE';" >/dev/null
R=$(staff "select count(*) from public.report_reads where daily_report_id='$MINE' and read_at < '2001-01-01';")
[ "$R" = "0" ] && say_ok "찍은 도장의 시각을 나중에 못 고칩니다 (update 닫힘)" \
               || say_bad "학부모가 열람 시각을 고칠 수 있습니다 — $R"
sit $MOM
as "delete from public.report_reads where daily_report_id='$MINE';" >/dev/null
R=$(staff "select count(*) from public.report_reads where daily_report_id='$MINE';")
[ "$R" = "1" ] && say_ok "찍은 도장을 지워 「안 봤다」 로 못 되돌립니다 (delete 닫힘)" \
               || say_bad "학부모가 열람 도장을 지울 수 있습니다 — $R"

# 5) **학생 본인은 못 찍는다.** my_student_ids() 를 썼으면 여기서 뚫린다 —
#    아이가 찍은 도장이 원장 화면에는 「어머니가 보셨다」 로 뜬다.
staff "delete from public.report_reads;" >/dev/null
sit d0000000-0000-0000-0000-000000000004
R=$(as "insert into public.report_reads (daily_report_id) values ('$MINE');")
case "$R" in *policy*) say_ok "학생 본인은 열람 도장을 못 찍습니다 (열람은 학부모의 것)" ;;
  *) say_bad "학생이 제 리포트를 「어머니가 봤다」 로 만들 수 있습니다 — $R" ;; esac

# 6) 원장은 다 읽는다 (아이콘을 그리려면 읽어야 한다)
sit $MOM
as "insert into public.report_reads (daily_report_id) values ('$MINE');" >/dev/null
R=$(staff "select count(*) from public.report_reads;")
[ "$R" = "1" ] && say_ok "원장님은 누가 열어봤는지 읽습니다" \
               || say_bad "원장님이 열람 기록을 못 읽습니다 (아이콘이 안 그려집니다) — $R"

echo
echo "  == 오늘 배운 것 (0181) =="

# 7) 아이가 제 것을 적고 고칠 수 있어야 한다 (0158 형 조용한 실패 방지)
sit d0000000-0000-0000-0000-000000000004
R=$(as "insert into public.learned_notes (student_id, date, body) values ('11110000-0000-0000-0000-000000000001', current_date, '관계대명사 which'); select body from public.learned_notes where student_id='11110000-0000-0000-0000-000000000001';")
[ "$R" = "관계대명사which" ] && say_ok "아이가 오늘 배운 것을 적습니다" \
                            || say_bad "아이가 못 적습니다 (하원 길목에 갇힙니다) — $R"
R=$(as "update public.learned_notes set body='to부정사' where student_id='11110000-0000-0000-0000-000000000001'; select body from public.learned_notes where student_id='11110000-0000-0000-0000-000000000001';")
[ "$R" = "to부정사" ] && say_ok "하원 누르기 전에 고쳐 쓸 수 있습니다" \
                      || say_bad "아이가 제 글을 못 고칩니다 — $R"

# 8) 원본은 **지워지지 않는다** (delete 정책을 일부러 안 만들었다)
R=$(as "delete from public.learned_notes where student_id='11110000-0000-0000-0000-000000000001'; select count(*) from public.learned_notes where student_id='11110000-0000-0000-0000-000000000001';")
[ "$R" = "1" ] && say_ok "적은 원본을 아이가 지우지는 못합니다 (delete 닫힘)" \
               || say_bad "아이가 원본을 지울 수 있습니다 — $R"

# 9) **남의 아이 것에는 못 쓰고, 보이지도 않는다**
R=$(as "insert into public.learned_notes (student_id, date, body) values ('22220000-0000-0000-0000-000000000002', current_date, '남의 글');")
case "$R" in *policy*|*권한*|*permission*|*violates*) say_ok "남의 아이 자리에는 못 씁니다" ;;
  *) say_bad "남의 아이 자리에 글이 들어갔습니다 — $R" ;; esac

# 10) **학부모는 못 읽는다** — 원장 확정: 원본은 학부모에게 공개하지 않는다.
#     my_student_ids()(0057) 를 썼으면 여기서 뚫린다.
sit a0000000-0000-0000-0000-000000000001
R=$(as "select count(*) from public.learned_notes;")
[ "$R" = "0" ] && say_ok "학부모에게는 안 보입니다 (원본은 원장·학생만)" \
               || say_bad "학부모가 아이의 원본을 읽고 있습니다 — $R"
R=$(as "insert into public.learned_notes (student_id, date, body) values ('11110000-0000-0000-0000-000000000001', current_date - 1, '엄마가 씀');")
case "$R" in *policy*|*권한*|*permission*|*violates*) say_ok "학부모가 대신 적어넣지도 못합니다" ;;
  *) say_bad "학부모가 아이 이름으로 글을 남겼습니다 — $R" ;; esac

# 11) 원장은 읽고, **대신 적어줄 수 있다** (폰 안 가져온 아이 — setLearnedFor)
sit c0000000-0000-0000-0000-000000000003
R=$(as "select count(*) from public.learned_notes;")
[ "$R" = "1" ] && say_ok "원장님은 아이가 적은 원본을 읽습니다" \
               || say_bad "원장님이 원본을 못 읽습니다 — $R"
R=$(as "insert into public.learned_notes (student_id, date, body) values ('22220000-0000-0000-0000-000000000002', current_date, '선생님이 대신 적음'); select count(*) from public.learned_notes;")
[ "$R" = "2" ] && say_ok "원장님이 대신 적어줄 수 있습니다 (폰 없는 아이도 하원합니다)" \
               || say_bad "원장님이 대신 못 적습니다 — $R"

# 12) 탐침 두 개가 실제로 표·트리거·정책을 보고 있나
R=$(as "select public.report_read_on()::text || '/' || public.learned_today_on()::text;")
[ "$R" = "true/true" ] && say_ok "표식(report_read_on · learned_today_on) 이 실물을 보고 있습니다" \
                 || say_bad "표식이 실물을 못 보고 있습니다 — $R"

exit $fail
