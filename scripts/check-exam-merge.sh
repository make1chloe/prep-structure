#!/usr/bin/env bash
# 0074 가 **진짜로 옮기는지** 본다.
#
# SETUP_ALL 을 통째로 돌리면 prep_exams 는 만들어지자마자 비어 있는 채로
# 없어진다. 그래서는 "옮기는 부분" 이 한 번도 안 돌아본 채 배포된다.
#
# 여기서는 0073 까지 돌려 **prep_exams 에 진짜 줄을 넣어두고**, 그 다음 0074 만
# 돌려서 범위·자료가 새 시험에 그대로 붙었는지 센다.
set -u
. "$(dirname "$0")/pg-boot.sh"
pg_boot pgmerge 55435 /var/tmp/pgmerge || { pg_skip "옛 시험 자료가 새 모양으로 옮겨지나 (0074)"; exit 0; }
trap pg_stop EXIT
$Q -c "create database chloe;" >/dev/null 2>&1
$Q -c "create role anon; create role authenticated; create role service_role;" >/dev/null 2>&1
$Q -d chloe -c "
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create or replace function auth.uid() returns uuid language sql stable as \$\$ select null::uuid \$\$;" >/dev/null 2>&1

# 0074 **전까지만** 돌린다
for f in $(ls supabase/migrations/*.sql | sort); do
  case "$f" in *0074_*) break;; esac
  $Q -d chloe -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1 || { echo "  $f 실패"; exit 1; }
done

# 진짜처럼 넣어둔다
#   1) 학사일정에 이미 있는 시험 (짝이 있는 경우)
#   2) 학사일정에 없는 시험 (짝이 없어 새로 만들어야 하는 경우)
$Q -d chloe -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
insert into exam_periods (school, grade, name, from_date, to_date, english_on)
values ('테스트중', '중2', '1학기 기말', '2026-07-01', '2026-07-03', '2026-07-02');

insert into prep_exams (id, school, term, grade, exam_date, note) values
  ('11111111-1111-1111-1111-111111111111', '테스트중', '1학기기말', '중2', '2026-07-02', '서술형 많음'),
  ('22222222-2222-2222-2222-222222222222', '테스트고', '1학기기말', '고1', '2026-07-08', null);

insert into prep_scopes (exam_id, name, sort) values
  ('11111111-1111-1111-1111-111111111111', '본문 1~3과', 1),
  ('22222222-2222-2222-2222-222222222222', 'Unit 5~8', 1);
SQL

err=$($Q -d chloe -v ON_ERROR_STOP=1 -f supabase/migrations/0074_exams_merged.sql 2>&1 | grep -iE "^psql.*ERROR")
if [ -n "$err" ]; then echo "  0074 실패:"; echo "$err" | head -5; exit 1; fi

fail=0
say() { echo "  $1"; }

# prep_exams 는 없어졌나
gone=$($Q -d chloe -tAc "select count(*) from information_schema.tables where table_name='prep_exams';")
[ "$gone" = "0" ] || { say "✗ prep_exams 가 아직 남아 있습니다"; fail=1; }

# 범위 둘 다 살아 있고, 둘 다 진짜 시험에 붙어 있나
orphan=$($Q -d chloe -tAc "select count(*) from prep_scopes s where not exists (select 1 from exam_periods e where e.id = s.exam_id);")
[ "$orphan" = "0" ] || { say "✗ 시험에 못 붙은 범위 $orphan 건"; fail=1; }
scopes=$($Q -d chloe -tAc "select count(*) from prep_scopes;")
[ "$scopes" = "2" ] || { say "✗ 범위가 2건이어야 하는데 $scopes 건"; fail=1; }

# 짝이 있던 것은 **새로 만들지 않고** 원래 줄에 붙었나
sin=$($Q -d chloe -tAc "select count(*) from exam_periods where school='테스트중';")
[ "$sin" = "1" ] || { say "✗ 테스트중 시험이 1건이어야 하는데 $sin 건 (짝을 못 찾아 새로 만들었습니다)"; fail=1; }

# 짝이 없던 것은 새로 만들어졌나
yeon=$($Q -d chloe -tAc "select count(*) from exam_periods where school='테스트고' and source='manual';")
[ "$yeon" = "1" ] || { say "✗ 테스트고 시험이 안 만들어졌습니다 ($yeon)"; fail=1; }

# 내신 자료 쪽에서만 알던 특이사항이 따라왔나
note=$($Q -d chloe -tAc "select coalesce(note,'') from exam_periods where school='테스트중';")
[ "$note" = "서술형 많음" ] || { say "✗ 특이사항이 안 따라왔습니다 ('$note')"; fail=1; }

# 학사일정에 이미 있던 기간을 덮어쓰지 않았나
from=$($Q -d chloe -tAc "select from_date from exam_periods where school='테스트중';")
[ "$from" = "2026-07-01" ] || { say "✗ 원래 시험 기간을 덮어썼습니다 ($from)"; fail=1; }

# ── 0075: 내 것이 주인인가 ────────────────────────────────
# 나이스가 붙어 있어도 **내 기간·이름·등급컷은 내가 누르기 전엔 안 바뀐다.**
$Q -d chloe -v ON_ERROR_STOP=1 -f supabase/migrations/0075_exam_owns_neis.sql >/dev/null 2>&1
$Q -d chloe -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
update exam_periods
   set name = '1학기 중간', cuts = array[90,84,77]::numeric[], teacher = '김선생',
       neis_source_id = 'C100:20260701:1회고사',
       neis_from = '2026-07-01', neis_to = '2026-07-03', neis_name = '1회고사'
 where school = '테스트중';
SQL
# 학교가 날짜를 옮겼다 (다시 받아온 상황을 흉내낸다)
$Q -d chloe -c "update exam_periods set neis_from='2026-07-02', neis_to='2026-07-04' where school='테스트중';" >/dev/null 2>&1

kept=$($Q -d chloe -tAc "select from_date||'|'||to_date||'|'||name||'|'||array_to_string(cuts,',')||'|'||coalesce(teacher,'') from exam_periods where school='테스트중';")
[ "$kept" = "2026-07-01|2026-07-03|1학기 중간|90,84,77|김선생" ] \
  || { say "✗ 학교 일정이 바뀌자 내 것까지 바뀌었습니다 ($kept)"; fail=1; }

# 「반영」을 누른 것처럼 옮기면 그때 바뀐다
$Q -d chloe -c "update exam_periods set from_date=neis_from, to_date=neis_to where school='테스트중';" >/dev/null 2>&1
moved=$($Q -d chloe -tAc "select from_date||'|'||name||'|'||array_to_string(cuts,',') from exam_periods where school='테스트중';")
[ "$moved" = "2026-07-02|1학기 중간|90,84,77" ] \
  || { say "✗ 반영했더니 내 이름·등급컷까지 없어졌습니다 ($moved)"; fail=1; }

# 같은 나이스 일정이 두 시험에 붙지 못하는가
dupe=$($Q -d chloe -tAc "update exam_periods set neis_source_id='C100:20260701:1회고사' where school='테스트고';" 2>&1 | grep -c "duplicate key")
[ "$dupe" != "0" ] || { say "✗ 같은 학교 일정이 두 시험에 붙습니다"; fail=1; }

# ── 0076: 학교가 한 곳으로 모이나 · 출제샘 여러 명 ──────────
# 「신송중」과 「신송중학교」는 같은 학교여야 한다.
$Q -d chloe -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
insert into students (name, school, status) values
  ('가학생', '테스트중학교', 'enrolled'),
  ('나학생', '테스트중',     'enrolled'),
  ('다학생', '테스트여자고등학교', 'enrolled');
SQL
err=$($Q -d chloe -v ON_ERROR_STOP=1 -f supabase/migrations/0076_schools.sql 2>&1 | grep -iE "^psql.*ERROR")
if [ -n "$err" ]; then say "✗ 0076 실패: $(echo "$err" | head -2)"; fail=1; fi

# 「테스트중학교」와 「테스트중」이 한 줄로
n=$($Q -d chloe -tAc "select count(*) from schools where school_key(name)='테스트중';")
[ "$n" = "1" ] || { say "✗ 테스트중/테스트중학교가 $n 개 학교가 됐습니다"; fail=1; }

# 둘 다 그 한 학교를 가리키나
same=$($Q -d chloe -tAc "select count(distinct school_id) from students where name in ('가학생','나학생');")
[ "$same" = "1" ] || { say "✗ 두 학생이 서로 다른 학교를 가리킵니다"; fail=1; }

# 시험도 같은 학교를 가리키나 (시험은 '테스트중' 으로 적혀 있었다)
tied=$($Q -d chloe -tAc "select count(*) from exam_periods e join students t on t.school_id=e.school_id where t.name='가학생' and e.school='테스트중';")
[ "$tied" = "1" ] || { say "✗ 재원생 학교와 시험 학교가 안 이어집니다 ($tied)"; fail=1; }

# 이름을 긴 쪽으로 남겼나
kept_name=$($Q -d chloe -tAc "select name from schools where school_key(name)='테스트중';")
[ "$kept_name" = "테스트중학교" ] || { say "✗ 학교 이름이 긴 쪽으로 안 남았습니다 ($kept_name)"; fail=1; }

# 학교 이름을 고치면 학생·시험이 따라오나
$Q -d chloe -c "update schools set name='테스트중앙중학교' where school_key(name)='테스트중';" >/dev/null 2>&1
follow=$($Q -d chloe -tAc "select school from students where name='나학생';")
[ "$follow" = "테스트중앙중학교" ] || { say "✗ 학교 이름을 고쳤는데 학생이 안 따라옵니다 ($follow)"; fail=1; }

# 같은 학교를 두 번 못 넣게 막나
dupe2=$($Q -d chloe -tAc "insert into schools (name) values ('테스트여고');" 2>&1 | grep -c "duplicate key")
[ "$dupe2" != "0" ] || { say "✗ 테스트여자고등학교/테스트여고가 두 학교로 들어갑니다"; fail=1; }

# 출제 선생님 여러 명
$Q -d chloe -c "update exam_periods set teachers=array['김선생','박선생'] where school='테스트중앙중학교';" >/dev/null 2>&1
many=$($Q -d chloe -tAc "select array_length(teachers,1) from exam_periods where school='테스트중앙중학교';")
[ "$many" = "2" ] || { say "✗ 출제 선생님을 여러 명 못 넣습니다 ($many)"; fail=1; }

# 두 번 돌려도 같은가
$Q -d chloe -v ON_ERROR_STOP=1 -f supabase/migrations/0074_exams_merged.sql >/dev/null 2>&1
again=$($Q -d chloe -tAc "select count(*) from exam_periods where school like '테스트%';")
[ "$again" = "2" ] || { say "✗ 다시 돌리니 시험이 $again 건으로 늘었습니다"; fail=1; }

[ $fail -eq 0 ] && say "범위·자료가 따라왔고, 학교 일정이 바뀌어도 내 것은 그대로입니다"
exit $fail
