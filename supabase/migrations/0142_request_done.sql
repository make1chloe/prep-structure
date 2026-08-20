-- 전달사항의 「처리 완료」 (원장님, 2026-08-20 — 「확인했다고 알림도
-- 보냈으면 그다음에는 내가 업무에 반영을 해야 되잖아. 반영이 다 끝나면
-- 더 이상 상시 떠 있을 필요가 없으니까 처리 완료가 되어야 해」).
--
-- 확인/조정(handled_at·알림)과 반영 끝(done_at)은 다른 단계다.
-- done_at 이 찍혀야 대시보드 목록에서 접힌다.

alter table public.requests
  add column if not exists done_at timestamptz;

create or replace function public.request_done_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.request_done_on() to authenticated;
