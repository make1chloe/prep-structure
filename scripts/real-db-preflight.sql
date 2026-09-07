-- 클로이영어 새 앱(v2) — 실 DB 미리보기(읽기만 · 아무것도 안 바꾼다)
-- 0100~0139 를 붙여넣기 **전에** 한 번 돌린다. 리허설 DB 엔 없고 실 DB 에만 있는 「데이터 지뢰」를 센다.
-- 2026-09-07 실측: 형제 아이디 chloe8729-2 가 0034 의 꼴 검사(chloe+숫자 넷)에 걸려 0100 이 통째로 되돌아갔다 — 그런 것을 미리 보려는 것.
-- 결과 한 줄의 숫자를 그대로 보내 주시면 된다. 0 이 아니면 그 자리를 붙여넣기 전에 손본다.
select
  (select count(*) from v2.profiles p where p.role = 'student' and p.login_id is not null and p.login_id !~ '^chloe[0-9]{4}(-[0-9]{1,2})?$') as 학생아이디_꼴밖,
  (select count(*) from v2.profiles p where p.role = 'parent'  and p.login_id is not null and p.login_id !~ '^01[0-9]{8,9}$')                 as 학부모아이디_꼴밖,
  (select count(*) from v2.makeup m where m.state not in ('todo','set','done','waived','cancelled'))                                         as 보강_상태밖_0109,
  (select count(*) from (select student_id, of_date from v2.makeup where of_date is not null and state not in ('done','cancelled') group by 1,2 having count(*) > 1) d) as 보강_같은결석에둘_0109,
  (select count(*) from (select student_id, on_date, of_date from v2.makeup where state <> 'cancelled' group by 1,2,3 having count(*) > 1) d) as 보강_같은줄둘_0109,
  (select count(*) from (select student_id, area, item_id, place, book_id from v2.student_routine group by 1,2,3,4,5 having count(*) > 1) d) as 루틴_겹침_0137,
  (select count(*) from v2.migration where file like '01%') as 새앱_들어간것,
  (select count(*) from v2.profiles where role in ('student','parent')) as 아이학부모_계정;
-- 꼴 밖 아이디가 있으면(이름은 안 나온다 — 아이디만):
select role, login_id from v2.profiles
 where login_id is not null and ((role = 'student' and login_id !~ '^chloe[0-9]{4}(-[0-9]{1,2})?$') or (role = 'parent' and login_id !~ '^01[0-9]{8,9}$'))
 order by role, login_id;
