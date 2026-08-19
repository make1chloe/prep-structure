-- 학생별 「빼는 활동」 (원장님, 2026-08-19 — 「대부분은 본 교재와 워크북을
-- 둘 다 시도하다가, 도저히 안 되겠다 싶으면 워크북은 빼고 하게 된단
-- 말이야. 그때까지 진도 기록은 유지된 상태에서 앞으로의 숙제 배정에는
-- 워크북이 빠지게 할 수 있어?」).
--
-- 학생×교재 배정 줄에 활동 이름을 쉼표로 적는다 (예: '워크북').
-- 여기 적힌 활동의 단원은 그 학생의 **앞으로**에서만 빠진다 —
-- 숙제 배정(지난번과 같게)·진도율 분모·전체완료/여기까지.
-- 이미 찍힌 진도 기록은 그대로 남고, 판에서 흐리게 보인다.

alter table public.student_textbooks
  add column if not exists skip_acts text;

create or replace function public.skip_acts_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.skip_acts_on() to authenticated;
