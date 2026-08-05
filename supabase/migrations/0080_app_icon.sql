-- 0080: 로고를 원장님이 직접 올린다
--
-- 홈 화면 아이콘을 바꾸려면 지금은 **파일을 코드에 넣고 다시 배포**해야 한다.
-- 로고 하나 바꾸겠다고 개발자를 불러야 하는 것은 이상하다.
--
-- 그래서 올린 그림을 DB 에 담고, 앱이 그것을 아이콘으로 내어준다.
-- 크기별로 한 줄씩 (192 · 512 · 잘리는 판 · 아이폰 판 · 탭 아이콘).
--
-- ── 왜 저장소가 아니라 표인가 ──────────────────────────
-- Supabase 저장소(storage)는 아직 실제로 되는 것을 못 봤다 (docs/미확인).
-- 아이콘은 몇십 KB 짜리 그림 대여섯 장이라 표에 담아도 무겁지 않고,
-- **되는 것이 확인된 길**로 가는 편이 낫다. 나중에 저장소가 확인되면 옮긴다.

create table if not exists public.app_assets (
  key        text primary key,          -- icon-192 · icon-512 · apple · favicon …
  mime       text not null default 'image/png',
  data       text not null,             -- base64
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_assets enable row level security;

-- 읽기는 **누구나.** 홈 화면 아이콘은 로그인 전에도 받아가야 한다
-- (브라우저가 manifest 를 읽을 때는 로그인 정보가 없을 수 있다).
-- 담기는 것은 학원 로고뿐이라 감출 것이 없다.
drop policy if exists read_all on public.app_assets;
create policy read_all on public.app_assets
  for select to anon, authenticated
  using (true);

-- 바꾸는 것은 원장님만
drop policy if exists principal_write on public.app_assets;
create policy principal_write on public.app_assets
  for all to authenticated
  using (public.is_principal()) with check (public.is_principal());

comment on table public.app_assets is
  '원장님이 올린 그림 (홈 화면 아이콘). 크기별로 한 줄';
