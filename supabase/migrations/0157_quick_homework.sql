-- 0157: 「직접 적은 숙제」 를 영역마다, 이름 없이
--
-- 원장님 (2026-08-24) — 「학생 어플에서 내가 직접 적은 숙제가 '직접 적은
-- 숙제' 라고 나올 필요 없어」 · 「직접 적은 숙제는 영역이 없는 게 문제야.
-- 영역마다 그냥 텍스트를 추가할 칸을 줘」
--
-- 급하게 한 줄 적어 내는 숙제는 여태 「직접 적은 숙제」 라는 항목 하나로
-- 갔다. 두 가지가 걸린다:
--   · 아이 화면에 「직접 적은 숙제 — 영작 2회분 풀기」 처럼 **이름이 먼저**
--     나온다. 아이에게 필요한 것은 뒤엣것뿐이다. 앞은 우리 사정이다.
--   · 영역이 없어서 아이 화면의 영역별 묶음에서 「기타」 로 떨어진다.
--     영작 숙제인데 영작 묶음에 없다.
--
-- quick 을 켜 둔 항목은 **이름을 감추고 적은 글만** 보여준다. 영역은
-- category 로 가른다 (항목 분류가 곧 영역이다).

alter table public.homework_items
  add column if not exists quick boolean not null default false;

comment on column public.homework_items.quick is
  '급하게 글로 적어 내는 숙제 (0157). 아이 화면에서 이름을 감추고 적은 글만 보인다';

create or replace function public.quick_homework_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.quick_homework_on() to authenticated;
