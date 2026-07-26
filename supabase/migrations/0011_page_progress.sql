-- 0011: 단원을 아직 안 만든 교재의 진도 (페이지로 기록)
-- 단원 데이터를 다 만들기 전에도 "지금 몇 페이지까지"로 진도를 볼 수 있게 한다.
alter table public.student_textbooks
  add column if not exists current_page int;
