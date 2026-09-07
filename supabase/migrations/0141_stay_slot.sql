-- 0141 5단계-②(9/7 밤) — 3b 「남」 줄: 판의 줄(day_item)에 **남아서(stay) 자리**를 더한다. 검사에서 △·✕ 의 나머지를 「남아서」로 보내면 조각이 원본을 가리키며 이 자리에 선다(숙제에서 옮겨옴) · 손으로 더할 수도 있다 · 「남아서 다 합니다」(done) · 「⏭ 남은 것 다음 숙제로」(조각을 숙제 자리에 세우고 이 줄은 missing = 남아서 하려다 못 한 것). 지우지 않는다(대전제-6) — 멱등
-- 목업 01 3b: 「남 워크북 복습 · 못 한 만큼 — 숙제에서 옮겨옴」 · 「항목 더하기」 · 「⏭ 남은 것 다음 숙제로 넘기기」 · 「남아서 다 합니다」 · 「✕·△ 준 항목이 후보로 올라옵니다 — 고르는 것은 원장님」
alter table v2.day_item drop constraint if exists day_item_slot_check;
alter table v2.day_item add constraint day_item_slot_check check (slot in ('check', 'class', 'home', 'next', 'stay'));
comment on column v2.day_item.slot is '자리 — check 검사(지난 숙제) · class 학원 · home 숙제 · next 예습 · stay 남아서(3b — 검사 나머지를 옮겨온 조각 또는 손으로 더한 줄 · status done/missing · 0141)';
