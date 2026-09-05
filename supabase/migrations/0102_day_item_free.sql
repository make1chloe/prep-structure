-- 0102 · 판 항목의 열쇠 — 교재·단원이 붙은 줄은 (판, 자리, 학습항목, 단원) 하나, 손으로 적은 줄(둘 다 비어 있음)은 (판, 자리, 글) 하나.
-- 목업 01 「항목 더하기」(손으로 적는 줄)가 한 자리에 둘 이상 서야 하는데 nulls not distinct 열쇠가 둘째를 막았다(2026-09-05 눌러보기).
-- 「무엇이 한 줄인가」(0-1)는 그대로다 — 비는 칸을 열쇠에 넣지 않고 글을 열쇠로 쓴다. 한 번 더 돌려도 같다.
alter table v2.day_item drop constraint if exists day_item_one_per_slot;
drop index if exists v2.day_item_one_per_slot;
create unique index if not exists day_item_one_per_slot on v2.day_item (sheet_id, slot, item_id, unit_id) nulls not distinct
  where item_id is not null or unit_id is not null;
create unique index if not exists day_item_one_per_text on v2.day_item (sheet_id, slot, range_note)
  where item_id is null and unit_id is null;
comment on index v2.day_item_one_per_text is '손으로 적은 줄의 열쇠 — 같은 판 같은 자리에 같은 글을 두 번 세우지 않는다(0102)';
