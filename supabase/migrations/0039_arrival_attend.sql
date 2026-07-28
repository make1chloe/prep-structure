-- 0039: 등원 체크에 '출석 체크' 를 더한다
--
-- 출석은 외부 앱에서 한다. 그런데 **아이들이 잊어버린다.**
-- 그래서 우리 화면이 물어봐 준다 — 대신 해주는 게 아니라 짚어주는 것이다.
--
-- 순서: ① 핸드폰 제출  ② 출석 체크  ③ 숙제 제출
--
-- 셋을 한 번에 늘어놓으면 습관적으로 세 번 연달아 눌러버린다.
-- 그래서 화면에서는 **한 번에 하나씩만** 보여준다.

alter table public.arrival_checks
  add column if not exists attend_at timestamptz;

comment on column public.arrival_checks.attend_at is
  '외부 앱에서 출석 체크를 했다고 학생이 확인한 시각';
