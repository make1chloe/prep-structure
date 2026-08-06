-- 0095: 화면 **구성 순서**를 원장님이 정한다
--
-- 원장님 (2026-08-06)
--   「화면에서 모든 페이지 — 학생 학부모 포함 — 구성 내용 순서를 수정할 수 있게 해줘」
--
-- 지금까지 화면에 무엇이 어떤 차례로 놓이는지는 전부 내가 정했다. 그런데
-- **무엇을 먼저 보여줄지는 학원마다 다르다.** 어떤 학원은 숙제가 먼저고,
-- 어떤 학원은 이번 달 성취도가 먼저다. 학기 중과 방학 중이 다르기도 하다.
--
-- 그리고 이건 코드를 고칠 일이 아니다. 순서 하나 바꾸자고 나를 부르고,
-- 배포를 기다리고, 앱을 새로 받으셔야 하는 것이 이상하다.
--
-- 한 화면에 한 줄로 담는다.
--   order_keys   놓을 차례 (여기 없는 것은 원래 자리에 그대로 남는다)
--   hidden_keys  아예 안 보일 것
--
-- **여기 없는 덩어리가 사라지면 안 된다.** 새 덩어리를 만들었을 때 순서를
-- 다시 안 정했다고 화면에서 없어지면, 만든 사람도 모르는 채로 지나간다.
-- 그래서 order_keys 에 없는 것은 **원래 차례 그대로 뒤에** 붙는다 (0067 과 같은 규칙).

create table if not exists public.screen_layouts (
  page        text primary key,          -- 'me' | 'parent' | …  (lib/screenLayout.js 의 PAGES)
  order_keys  text[] not null default '{}',
  hidden_keys text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null
);

comment on table public.screen_layouts is
  '화면 덩어리의 차례와 숨김. 덩어리 목록은 lib/screenLayout.js 의 PAGES 에 있다';

alter table public.screen_layouts enable row level security;

-- **학생·학부모도 읽어야 한다.** 그분들 화면의 차례를 담은 것이라,
-- 못 읽으면 정해둔 순서가 그분들에게만 안 먹는다. 비밀이 담길 자리가 아니다.
drop policy if exists layout_read_all on public.screen_layouts;
create policy layout_read_all on public.screen_layouts
  for select to authenticated using (true);

-- 정하는 것은 선생님만
drop policy if exists layout_write_staff on public.screen_layouts;
create policy layout_write_staff on public.screen_layouts
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
