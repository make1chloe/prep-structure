-- 클카 자동 판정 **그림자 기록** (원장님, 2026-08-17 — 「오류 가능성이
-- 높아. 다시 검토하고 시뮬레이션 한 달간 돌려봐」).
--
-- 자동 판정은 화면에 보여주기만 하고 검사를 채우지 않는다. 대신 원장님이
-- 실제로 찍은 것과 나란히 적어둔다 — 한 달 뒤 일치율을 보고 자동 채움을
-- 켤지 결정한다. 판정을 믿을 수 없으면 없는 것보다 나쁘다.

create table if not exists public.classcard_shadow (
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null,
  item_id    uuid not null references public.homework_items(id) on delete cascade,
  auto_status   text,          -- 자동 판정 (done/weak/missing)
  actual_status text,          -- 원장님이 실제로 찍은 것
  note       text,             -- 자동이 본 「미달」 상세 (그때의 근거)
  created_at timestamptz not null default now(),
  primary key (student_id, date, item_id)
);

alter table public.classcard_shadow enable row level security;
drop policy if exists staff_all on public.classcard_shadow;
create policy staff_all on public.classcard_shadow
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create or replace function public.classcard_shadow_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.classcard_shadow_on() to authenticated;
