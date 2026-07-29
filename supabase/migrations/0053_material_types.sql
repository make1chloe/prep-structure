-- 0053: 내신 자료 종류를 미리 등록한다
--
-- 자료 종류가 너무 다양하고, 한 종류 안에 또 갈래가 있다.
--   이그잼   → 변형문제 · 분석지 · 워크북
--   백발백중 → …
-- 자료를 만들 때마다 이름을 손으로 치면 같은 것을 다르게 적게 되고,
-- 나중에 묶어 볼 수가 없다. 그래서 **학습 항목처럼 미리 등록**해 둔다.
--
-- 두 겹이면 충분하다. 큰 것(이그잼) 아래 작은 것(변형문제)까지.
--
-- 그리고 구입·주문일·도착 대기는 뺀다. 파는 쪽 일정까지 여기서 좇으면
-- 관리할 것만 늘고 정작 안 보게 된다.

create table if not exists public.prep_material_types (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.prep_material_types(id) on delete cascade,
  name       text not null,
  sort       int  not null default 0,
  active     boolean not null default true,
  -- 이 종류로 자료를 만들면 단계가 이렇게 켜진 채로 시작한다
  need_make  boolean not null default true,
  need_print boolean not null default true,
  need_card  boolean not null default false,
  need_hand  boolean not null default true,
  need_solve boolean not null default true,
  need_grade boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists prep_types_parent_idx on public.prep_material_types (parent_id, sort);

alter table public.prep_material_types enable row level security;
drop policy if exists staff_all on public.prep_material_types;
create policy staff_all on public.prep_material_types
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());


-- 자료에 종류를 단다
alter table public.prep_materials
  add column if not exists type_id uuid references public.prep_material_types(id) on delete set null;

-- 구입·도착 관련은 쓰지 않는다
alter table public.prep_materials drop column if exists source;
alter table public.prep_materials drop column if exists ordered_on;
alter table public.prep_materials drop column if exists arrived_on;

-- 이름은 종류에서 가져오므로 비어 있어도 된다
alter table public.prep_materials alter column name drop not null;
