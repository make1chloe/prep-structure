-- 예약 발송 (원장님, 2026-08-16 — 「체크박스로 선택해서 보내는 기능,
-- 예약기능 만들어줘」).
--
-- 발송 「보낼 것」 화면에서 고른 것을 지금 보내거나, 시각을 정해 예약한다.
-- 서버에 시계가 따로 없으므로, 예약된 것은 **시각이 지난 뒤 원장님(직원)이
-- 앱을 열 때** 나간다 — 대시보드·발송 화면이 열릴 때마다 밀린 예약을
-- 확인해서 보낸다. 몇 분 늦을 수는 있어도 잊히지는 않는다.

create table if not exists public.scheduled_sends (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,                -- report | book
  due_at     timestamptz not null,         -- 이 시각 이후에 나간다
  payload    jsonb not null,               -- 보낼 것 (kind 마다 모양이 다르다)
  note       text,                         -- 화면에 보여줄 한 줄 (누구 · 무엇)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,                  -- 나간 시각 (실패해도 적는다 — 되풀이 방지)
  result     jsonb                         -- 결과 (실패 사유 포함)
);
create index if not exists scheduled_sends_due_idx on public.scheduled_sends (sent_at, due_at);

alter table public.scheduled_sends enable row level security;
drop policy if exists staff_all on public.scheduled_sends;
create policy staff_all on public.scheduled_sends
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.scheduled_sends_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.scheduled_sends_on() to authenticated;
