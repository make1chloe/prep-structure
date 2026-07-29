-- 0048: 등원에서 할 것 · 집에서 할 것이 다른 학습
--
-- 구두테스트는 원장님이 앞에 있어야 한다. 집에서는 할 수가 없어서
-- **셀프녹음테스트**로 낸다. 같은 단계인데 이름도 방법도 다르다.
--
-- 그래서 학습 항목에 "이걸 숙제로 낼 때는 대신 이것" 을 달아둔다.
-- 루틴은 등원 기준 하나만 알면 되고, 숙제로 나갈 때 알아서 바뀐다.
--   구두테스트 → (숙제로 낼 때) → 셀프녹음테스트
--
-- 대부분의 항목은 비어 있다 (집에서든 학원에서든 같은 것이므로).

alter table public.homework_items
  add column if not exists home_item_id uuid references public.homework_items(id) on delete set null;

comment on column public.homework_items.home_item_id is
  '이 학습을 숙제로 낼 때 대신 쓰는 항목. 비면 그대로 나간다';
