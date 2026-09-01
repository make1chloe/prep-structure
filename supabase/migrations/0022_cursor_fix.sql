-- ─────────────────────────────────────────────────────────────
-- 0022 · 커서 정렬을 고친다
--
-- ⚠️ **검사가 잡았다.** 0018 의 정렬이 이랬다:
--       order by (workbook 이면 1 else 0), sort
--    이건 **책 전체에서** 본책을 먼저 놓는다. 그래서 CH1 본책이 끝나면
--    **CH1 워크북이 아니라 CH2 본책**으로 간다.
--
--    맞는 차례 — **대단원 안에서** 본책 전부 → 워크북 전부:
--       order by (그 대단원의 첫 sort), (workbook 이면 1), sort
--
-- ⚠️ 절 ㊻ 에서 시뮬이 잡은 것과 **같은 자리**다. 옮겨 쓰면서 또 틀렸다.
--    이 검사가 없었으면 **오류 없이 조용히 틀린 차례로** 나갔다.
-- ─────────────────────────────────────────────────────────────
create or replace function v2.cursor_of(p_student uuid, p_book uuid)
returns table (round smallint, chapter text, is_workbook boolean, left_in_chapter int)
language sql stable as $$
  with sb as (
    select round, coalesce(order_basis,(select order_basis from v2.books where id=p_book)) ob
    from v2.student_book
    where student_id=p_student and book_id=p_book
      and from_date <= v2.today() and (to_date is null or to_date >= v2.today())
    order by from_date desc limit 1),
  u as (
    select x.*, sb.round r, sb.ob,
           min(x.sort) over (partition by x.chapter) ch_sort   -- 대단원 차례
    from v2.units x, sb where x.book_id=p_book and x.state='active'),
  todo as (
    select * from u
    where id not in (select p.unit_id from v2.progress p, sb
                     where p.student_id=p_student and p.round=sb.round
                       and p.status in ('done','skip'))),
  nxt as (
    select * from todo
    order by ch_sort,                                          -- ① 대단원 차례
             case when ob='chapter' and is_workbook then 1 else 0 end,  -- ② 그 안에서 본책 → 워크북
             sort                                              -- ③ 줄 차례
    limit 1)
  select (select r from u limit 1)::smallint,
         (select chapter from nxt),
         (select is_workbook from nxt),
         (select count(*)::int from todo t where t.chapter = (select chapter from nxt))
$$;
comment on function v2.cursor_of is
  '⚠️ 정렬 셋이 다 필요하다 — 대단원 차례 → 갈래 → 줄 차례. 하나만 빠져도 조용히 틀린 차례로 나간다';
grant execute on function v2.cursor_of(uuid,uuid) to authenticated;
