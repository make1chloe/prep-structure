-- 0043 · 보강에 유일키 — 몇 번을 돌려도 같은 결과여야 한다(멱등)
-- ⚠️ 옛 `attendance.makeup_of` 는 **id 가 아니라 날짜**다.
alter table v2.makeup add constraint makeup_key unique nulls not distinct (student_id, on_date, of_date);
