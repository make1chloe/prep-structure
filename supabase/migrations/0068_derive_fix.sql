-- 0068 · 숙제 차리기 담당이 요청한 DB 셋 (검증자가 확인함)
-- ⚠️ cursor_of 는 **날짜를 받는 것을 새로 더한다** — 옛 두 칸짜리를 안 지운다(부르는 곳이 있다)

-- ══ [숙제 차리기] `v2.today_load` — 저장된 판의 분량을 **단원마다 한 번만** 세고, 어제 낸 숙제(check)를 오늘 분량에 안 넣는다
-- 왜: 지금 정의를 직접 읽어 확인했다. day_item **한 줄마다** 그 단원 쪽을 더하므로 루틴이 6줄이면 같은 단원 쪽이 6번 세어지고, `slot='check'`(어제 낸 숙제) 줄까지 쪽에 더한다. 저장 전 셈(`loadOf`)은 교재마다 amount 를 한 번 센다 — 같은 판인데 저장 전후로 숫자가 달라진다(원칙 1·5 위반). 저장(마감) 길을 짓기 전에 못 박아야 한다. ⚠️ day_item 에는 쪽 칸이 없고 `range_note`(글자)뿐이라, **조각으로 낸 쪽은 DB 가 알 수 없다** — 단원 전체 쪽으로 셀 수밖에 없다는 것을 원장님께 밝혀야 한다.
-- v2.today_load — 단원마다 한 번만, 오늘 낼 것(class·home·next)만
-- 왜: day_item 한 줄마다 더하면 루틴 6줄에 같은 단원이 6번 세어진다(원칙 5).
--     check 줄은 **어제 낸 숙제**라 오늘 분량이 아니다.
-- ⚠️ 조각(부분 쪽)은 day_item 에 안 남아 단원 전체 쪽으로 센다 — loadOf 와 여기까지만 같다.
create or replace function v2.today_load(p_student uuid, p_on date)
returns table(items_class integer, items_home integer, pages integer, questions integer)
language sql stable as $$
  with it as (
    select i.slot, i.unit_id
      from v2.day_item i
      join v2.day_sheet s on s.id = i.sheet_id
     where s.student_id = p_student and s.date = p_on),
  uu as (                      -- 오늘 낼 줄의 단원 — **한 번씩만**
    select distinct unit_id from it
     where slot in ('class','home','next') and unit_id is not null)
  select (select count(*) filter (where slot = 'class') from it)::int,
         (select count(*) filter (where slot in ('home','next')) from it)::int,
         coalesce((select sum(coalesce(u.page_end, u.page_start) - u.page_start + 1)
                     from uu join v2.units u on u.id = uu.unit_id), 0)::int,
         coalesce((select sum(u.q_count)
                     from uu join v2.units u on u.id = uu.unit_id), 0)::int
$$;

-- ══ [숙제 차리기] `v2.unit_label` — 한 대단원 안에서 소단원 이름이 되풀이될 때만 **중단원을 같이 띄운다**
-- 왜: 어법끝스타트 PART 2 는 「Points to Remember」가 중단원 8곳에 그대로 되풀이돼 UNIT 01 과 UNIT 02 가 **글자까지 같은 이름**을 받는다. 원장님이 카드만 보면 어느 UNIT 이 나가는지 알 수 없다. 이름은 원칙 1 로 DB 한 곳에서만 짓기로 했으니 여기서 고쳐야 한다. ⚠️ **원장님 확인 필요** — 이름이 길어진다(「PART 2 밑줄 어법 › UNIT 01 동사 밑줄 › Points to Remember」). 되풀이되는 자리에만 붙으므로 대부분의 교재는 지금과 똑같다(실측: 되풀이되는 자리는 어법끝스타트·어법 서술형 제패 1/2권·어법끝이센셜뿐).
-- v2.unit_label — 같은 대단원·같은 갈래 안에서 소단원 이름이 **둘 이상**일 때만 중단원을 끼운다
-- 왜: 그때만 이름이 겹친다. 안 겹치는 교재는 글자가 그대로다.
create or replace function v2.unit_label(p_unit uuid, p_full boolean default true)
returns text language sql stable as $$
  with u as (select * from v2.units where id = p_unit),
       dup as (
         select count(*) > 1 as many
           from v2.units x, u
          where x.book_id = u.book_id and x.state = 'active'
            and x.chapter is not distinct from u.chapter
            and x.sub is not distinct from u.sub
            and x.is_workbook is not distinct from u.is_workbook),
       mid as (select case when dup.many and coalesce(u.mid, '') <> ''
                           then u.mid || ' › ' else '' end as t
                 from u, dup)
  select case
    when u.sub is null or u.sub = '' then
      u.chapter || case when u.activity is null or u.activity = '' then ''
                        else ' · ' || u.activity end
    when p_full then u.chapter || ' › ' || mid.t || u.sub
                     || case when u.is_workbook then ' · 워크북' else '' end
    else mid.t || u.sub || case when u.is_workbook then ' · 워크북' else '' end
  end
  from u, mid
$$;

-- ══ [숙제 차리기] `v2.cursor_of(학생, 교재, 날짜)` — 커서에 **날짜 칸**을 더한다 (S2 의 뿌리)
-- 왜: 지금 `cursor_of` 는 `v2.today()` 로만 읽어서, 지난 날짜 판을 열면 **교재 목록은 그날 것 · 커서는 오늘 것**이라 한 카드 안에 날짜가 둘이 된다. 이번에 「참고용」 알림이 카드마다 붙게는 했지만(S2), 그건 **밝히는 것**이지 고치는 것이 아니다. 날짜를 받으면 앱이 지난 날 판을 제대로 그릴 수 있다. ⚠️ **확인 안 됨** — 날짜가 없는 progress 줄(지금 0줄, 앞으로 생길 skip 줄)은 `coalesce(…, p_on)` 으로 「이미 한 것」으로 친다. 되돌리는 쪽보다 안전한 방향으로 골랐으나 원장님 확인이 필요하다. 실측: done 2879줄이 done_on·marked_on 을 **전부** 갖고 있고 skip 은 0줄이다.
-- v2.cursor_of 에 날짜 칸을 더한다. **옛 두 칸짜리는 그대로 둔다**(부르는 곳이 아직 있다)
create or replace function v2.cursor_of(p_student uuid, p_book uuid, p_on date)
returns table(round smallint, chapter text, is_workbook boolean, left_in_chapter integer)
language sql stable as $$
  with sb as (
    select round, coalesce(order_basis, (select order_basis from v2.books where id = p_book)) ob
      from v2.student_book
     where student_id = p_student and book_id = p_book
       and from_date <= p_on and (to_date is null or to_date >= p_on)
     order by from_date desc limit 1),
  u as (
    select x.*, sb.round r, sb.ob,
           min(x.sort) over (partition by x.chapter) ch_sort
      from v2.units x, sb where x.book_id = p_book and x.state = 'active'),
  todo as (
    select * from u
     where id not in (select p.unit_id from v2.progress p, sb
                       where p.student_id = p_student and p.round = sb.round
                         and p.status in ('done','skip')
                         -- ⚠️ 그날까지 한 것만 막는다. 날짜가 없는 줄은 이미 한 것으로 친다
                         and coalesce(p.done_on, p.marked_on, p_on) <= p_on)),
  nxt as (
    select * from todo
     order by ch_sort,
              case when ob = 'chapter' and is_workbook then 1 else 0 end,
              sort
     limit 1)
  select (select r from u limit 1)::smallint,
         (select chapter from nxt),
         (select is_workbook from nxt),
         (select count(*)::int from todo t where t.chapter = (select chapter from nxt))
$$;
