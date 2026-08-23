-- 0152: 예상 일정 안내를 보낸 시각
--
-- 원장님 (2026-08-23) — 「회차 학부모가 확정하기 전에 이번달 예상 수업일정을
-- 먼저 정리하고 알림을 보내는 과정이 필요해. 즉 먼저 일정을 보내고 봐라,
-- 결석 이 중에 있냐 물어보는 거지」.
--
-- 지금(0123)은 **학부모가 먼저** 결석을 보내고 확인을 누르면 원장님이 확정한다.
-- 요구는 그 반대다 — 원장님이 먼저 예상 일정을 보내고, 학부모가 그걸 보고
-- 빠질 날을 알려주면, 반영해서 확정한다.
--
-- 칸 하나면 세 상태가 생긴다:
--   초안  notice_at 없음
--   보냄  notice_at 있고 principal_at 없음   (학부모 회신을 기다리는 중)
--   확정  principal_at 있음
--
-- parent_at 의 뜻은 그대로 둔다 (「학부모가 봤다」) — 순서만 뒤로 밀린다.
-- 아직 학부모에게 배포하지 않아 옛 뜻으로 찍힌 도장이 없다 (원장님 확인).

alter table public.month_confirms
  add column if not exists notice_at timestamptz;

comment on column public.month_confirms.notice_at is
  '그 달 예상 수업일정 안내를 학부모께 보낸 시각 (0152)';

create or replace function public.month_notice_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.month_notice_on() to authenticated;
