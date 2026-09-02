-- 그래머인사이드 1·3 — 워크북 Review Test 24줄이 **본책으로 잘못 들어가 있었다**
--
-- 원장님 확인 (2026-09-02): 「Review Test 는 본교재·워크북 **둘 다 있다**」.
-- 그런데 v2 에는 본책 쪽만 있고 워크북 쪽이 본책으로 박혀 있었다 —
-- 실측: 소단원이 빈 `activity='Review'` 줄이 책마다 12줄이고, **12줄 전부가
-- 그 대단원의 워크북 줄들보다 뒤**에 있다. 본책 Review 가 워크북 뒤에 올 수 없다.
--
-- ⚠️ 이걸 안 고치면 **대단원 기준에서 차례가 틀린다** — 워크북 Review Test 가
--    본책 무리에 섞여 워크북보다 **먼저** 나간다. 오류는 안 나고 숙제만 조용히 틀린다.
-- ⚠️ 줄을 새로 만들거나 지우지 않는다. 진도가 붙어 있어도 **갈래 칸만** 갈아 끼운다.
update v2.units u set is_workbook = true
where u.book_id in (select id from v2.books where name in ('그래머인사이드1','그래머인사이드3'))
  and u.state = 'active'
  and u.sub is null
  and u.activity = 'Review'
  and not u.is_workbook
  -- 그 대단원의 워크북 줄보다 뒤에 있는 것만 (앞에 있으면 진짜 본책 Review 다)
  and u.sort > (select max(w.sort) from v2.units w
                where w.book_id = u.book_id and w.chapter = u.chapter and w.is_workbook);
