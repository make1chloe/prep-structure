-- ─────────────────────────────────────────────────────────────
-- 0036 · 영역 루틴의 열쇠를 고친다
--
-- ⚠️ **엑셀 39줄인데 v2 에 38줄이 들어갔다. 하나가 조용히 사라졌다.**
--    블록구문의 「문장훈련」이 **두 번** 나온다:
--       2. 문장훈련 [학원] 필수      5. 문장훈련 [숙제]
--    **학원에서 한 번, 집에서 또 한 번** 하는 것이다 — 같은 항목이지만 자리가 다르다.
--    그런데 열쇠가 `(area, item_id)` 라 둘째가 첫째를 덮었다.
--    ⚠️ 하필 원장님이 「5번만 선택」이라 하신 그 줄이다.
--
-- 열쇠는 `(area, item_id, place)` 다 — **자리가 다르면 다른 줄**이다.
-- ⚠️ `sort` 를 열쇠로 쓰지 않는다(계획 0단계 1번) — 가운데를 지우면 뒤 번호가 밀려
--    남의 기록에 붙는다.
-- ─────────────────────────────────────────────────────────────
alter table v2.area_routine drop constraint if exists area_routine_area_item_id_key;
alter table v2.area_routine add constraint area_routine_slot_key unique (area, item_id, place);

-- 학생 루틴도 같다 — 한 항목을 학원에서도 집에서도 할 수 있다
alter table v2.student_routine drop constraint if exists student_routine_student_id_area_item_id_key;
alter table v2.student_routine add constraint student_routine_slot_key
  unique (student_id, area, item_id, place);

comment on constraint area_routine_slot_key on v2.area_routine is
  '⚠️ 자리(학원·숙제·둘 다)가 열쇠에 든다. 안 들면 「학원에서 한 번, 집에서 또 한 번」이 조용히 한 줄로 뭉개진다';
