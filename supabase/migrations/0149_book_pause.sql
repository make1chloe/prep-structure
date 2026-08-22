-- 교재멈춤 · 숙제멈춤 (원장님, 2026-08-22 — 「숙제검사 후 자동 숙제 배정할
-- 때와 진도 체크에 교재멈춤·숙제멈춤 버튼. 교재멈춤은 내신 대비할 때 아예
-- 진도 스탑, 숙제멈춤은 숙제만 안 나감. 버튼이나 체크박스 해제해야 정상
-- 수업 숙제 나가기」).
--
-- 학생×교재 배정 줄에 멈춤 상태 하나를 적는다.
--   null    정상 — 여느 때처럼 자동 차림·숙제가 나간다
--   'all'   교재멈춤 — 내신 대비 기간처럼 이 교재 진도를 아예 세운다.
--           루틴 자동 차림(등원·숙제·다음 수업 미리 담기) 전부에서 빠진다
--   'home'  숙제멈춤 — 수업(등원 학습)은 그대로 하되 숙제만 안 나간다
--
-- 0133 의 skip_acts(활동 빼기)와는 다르다 — 그건 「이 학생은 워크북을 영영
-- 뺀다」 이고, 이건 「이 교재를 잠시 세운다 (해제하면 그대로 재개)」 다.
-- 판단은 app/today/routineActions.js nextRoutine 한 곳이 읽는다.

alter table public.student_textbooks
  add column if not exists pause text;

create or replace function public.book_pause_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.book_pause_on() to authenticated;
