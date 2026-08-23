-- 0150: 하원 — 아이가 「하원할게요」 를 누른 시각
--
-- 원장님 (2026-08-23) — 「학생이 핸드폰 냈어요 누르면 바로 출석 처리하게
-- 해줘. 그러면 엄마한테도 등원했다고 알림 가게 해줘. 그리고 하원 누르면
-- 자동 로그아웃되고, 엄마에게 하원했다고 알림 가게 해줘」.
--
-- 하원은 지금까지 **시각으로 짐작**했다 (반 끝나는 시간이 지나면 하원으로 봄).
-- 짐작은 보강·조퇴·늦게 남은 날에 어긋난다. 아이가 직접 누르면 그 시각이
-- 사실이 된다 — 등원(phone_at)과 같은 자리에 같은 방식으로 적는다.
--
-- 학생 앱은 **등원하면 학원 공용 기기**로 보고, 집에서는 제 폰으로 본다.
-- 그래서 하원 단추는 학원 안에서만 뜨고, 공용 기기로 표시해 둔 기기에서만
-- 로그아웃까지 한다 (제 폰이면 로그아웃하면 집에서 숙제를 못 본다).

alter table public.arrival_checks
  add column if not exists leave_at timestamptz;

comment on column public.arrival_checks.leave_at is
  '아이가 「하원할게요」 를 누른 시각 (학부모 알림도 이때 나간다)';

create or replace function public.arrival_leave_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.arrival_leave_on() to authenticated;
