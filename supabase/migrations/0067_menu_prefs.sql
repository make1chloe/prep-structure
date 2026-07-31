-- 0067: 메뉴를 내 손에 맞게
--
-- 화면이 스물한 개다. 원장님이 매일 여는 것은 그중 대여섯 개고, 나머지는
-- 한 달에 한 번도 안 여는 것도 있다. 그런데 전부 같은 크기로 위에 늘어서
-- 있으면, 매일 쓰는 것을 찾는 데 매번 눈이 간다.
--
-- 그래서 **무엇을 보일지, 어떤 순서로 놓을지**를 정할 수 있게 한다.
-- 숨긴 화면도 주소로는 그대로 열린다 — 메뉴에서만 빠질 뿐이다.
--
-- 사람마다 다르다. 원장님과 조교 선생님이 매일 여는 화면이 같을 리 없다.
-- 그래서 profiles 에 붙인다.

alter table public.profiles
  add column if not exists menu_hidden text[] not null default '{}',
  add column if not exists menu_order  text[] not null default '{}';

comment on column public.profiles.menu_hidden is
  '메뉴에서 뺀 화면들의 key. 주소로는 그대로 열린다';
comment on column public.profiles.menu_order is
  '메뉴에 놓을 순서(key). 여기 없는 것은 원래 순서대로 뒤에 붙는다';
