-- 수납
--
-- 앱은 **얼마를 받아야 하는지**를 이미 계산한다 (lib/tuition.js).
-- 여기 저장하는 것은 **받았는가** 하나뿐이다. 금액을 두 곳에 두지 않는다. (원칙1)
--
-- 결제선생 같은 바깥 서비스에서 받은 엑셀을 올리면 이 표가 채워진다.
-- 손으로 체크해도 같은 표에 들어간다 — 들어온 길만 `source` 로 남긴다.

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  ym          text not null,                  -- "2026-09" — 무슨 달 수강료인가
  amount      int,                            -- 실제로 받은 금액 (앱 계산과 다를 수 있다)
  paid_on     date,                           -- 받은 날. 비어 있으면 아직 안 받음
  method      text,                           -- 카드 · 이체 · 현금 …
  source      text not null default 'manual', -- manual | 결제선생
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 한 학생의 한 달은 한 줄이다. 엑셀을 여러 번 올려도 덮어쓴다
create unique index if not exists payments_student_ym_idx
  on public.payments (student_id, ym);
create index if not exists payments_ym_idx on public.payments (ym);

alter table public.payments enable row level security;
drop policy if exists staff_all on public.payments;
create policy staff_all on public.payments
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
