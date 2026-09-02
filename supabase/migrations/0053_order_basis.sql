-- 워크북이 있는 교재 11권을 **대단원 기준**으로 (원장님 확정 ㉙ · 2026-09-02 「지금 바꿔」)
--
--   대단원 기준 = 대단원의 **본책을 다 하고 → 워크북을 다 한다**
--   소단원 기준 = 소단원마다 본책 + 워크북을 **나란히**
--
-- ⚠️ 절 ㊻ 이 짚은 자리다 — 이관이 162권 전부 'sub' 로 넣어서,
--    원장님이 「대단원 기준」이라 정하셨는데 **DB 는 소단원 기준으로 돌고 있었다.**
--    오류가 안 나고 화면도 멀쩡해서 **숙제가 조용히 틀린 차례로 나갔을 것**이다.
--
-- ⚠️ 워크북이 **없는** 교재는 안 건드린다 — 갈래가 하나라 기준이 뜻이 없다.
update v2.books b set order_basis = 'chapter'
where exists (select 1 from v2.units u
              where u.book_id = b.id and u.state = 'active' and u.is_workbook);

comment on column v2.books.order_basis is
  '대단원 기준(chapter) = 본책 전부 → 워크북 전부 · 소단원 기준(sub) = 나란히. '
  '⚠️ 워크북이 있는 교재에서만 뜻이 있다 — cursor_of 의 정렬 ②가 이 값을 본다';
