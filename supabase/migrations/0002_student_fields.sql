-- ============================================================
-- 0002_student_fields
-- 학생 폼 확장에 필요한 컬럼 추가
--  - electives : 선택과목(자유 텍스트, 활용도 낮아 일단 텍스트로 기록)
--  - login_id  : 학생 로그인 아이디(chloe+전화뒷자리4). 조회/수정용으로 저장.
-- ============================================================

alter table public.students
  add column if not exists electives text;

alter table public.students
  add column if not exists login_id text;

-- 로그인 아이디 중복 방지(비어있는 값은 제외)
create unique index if not exists students_login_id_key
  on public.students (login_id)
  where login_id is not null;
