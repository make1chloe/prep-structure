-- ─────────────────────────────────────────────────────────────
-- 0018 · 세어 나오는 값 — **저장하지 않는다** (대전제 5)
-- 회차 · 커서 · 진도율 · 분량. 한 곳에서만 셈하고 화면은 부르기만 한다.
-- ─────────────────────────────────────────────────────────────

/** 그 반이 그 달에 몇 번 있었나 — 요일 이력 + 달력 − 휴강.
    ⚠️ 결석은 안 뺀다(학원은 열었다). 휴강만 뺀다(원장님 정정) */
create or replace function v2.session_count(p_class uuid, p_ym char(7))
returns int language sql stable as $$
  with days as (
    select d::date d from generate_series(
      (p_ym||'-01')::date, ((p_ym||'-01')::date + interval '1 month - 1 day')::date, '1 day') d),
  sched as (select * from v2.class_schedule where class_id = p_class)
  select count(*)::int from days
  join sched on days.d >= sched.from_date and (sched.to_date is null or days.d <= sched.to_date)
   and extract(dow from days.d)::smallint = any(sched.weekdays)
  where not exists (select 1 from v2.holiday h
                    where h.date = days.d and (h.class_id is null or h.class_id = p_class))
$$;

/** 지금 커서 — (회독, 대단원, 갈래). **아무 데도 저장하지 않는다.**
    ⚠️ 진도에서 그때그때 나온다. 그래서 결석하면 저절로 뒤로 밀린다 */
create or replace function v2.cursor_of(p_student uuid, p_book uuid)
returns table (round smallint, chapter text, is_workbook boolean, left_in_chapter int)
language sql stable as $$
  with sb as (select round, coalesce(order_basis,(select order_basis from v2.books where id=p_book)) ob
              from v2.student_book
              where student_id=p_student and book_id=p_book
                and from_date <= v2.today() and (to_date is null or to_date >= v2.today())
              order by from_date desc limit 1),
  u as (select x.*, sb.round r, sb.ob from v2.units x, sb where x.book_id=p_book and x.state='active'),
  done as (select p.unit_id from v2.progress p, sb
           where p.student_id=p_student and p.round=sb.round and p.status in ('done','skip')),
  todo as (select * from u where id not in (select unit_id from done))
  select (select r from u limit 1)::smallint,
         (select chapter from todo order by
            case when ob='chapter' and is_workbook then 1 else 0 end, sort limit 1),
         (select is_workbook from todo order by
            case when ob='chapter' and is_workbook then 1 else 0 end, sort limit 1),
         (select count(*)::int from todo t where t.chapter =
            (select chapter from todo order by case when ob='chapter' and is_workbook then 1 else 0 end, sort limit 1))
$$;
comment on function v2.cursor_of is
  '⚠️ 대단원 기준이면 **본책 갈래 전부 → 워크북 갈래 전부**. 엑셀 줄 차례로는 11권이 전부 소단원 기준이라 이 정렬이 없으면 「대단원 기준」이 영영 안 걸린다';

/** 오늘 이 아이가 낼 분량 — 앱은 **말만** 하고 밀지 않는다(원장님 9/2) */
create or replace function v2.today_load(p_student uuid, p_on date)
returns table (items_class int, items_home int, pages int, questions int)
language sql stable as $$
  with it as (select i.* from v2.day_item i
              join v2.day_sheet s on s.id=i.sheet_id
              where s.student_id=p_student and s.date=p_on)
  select count(*) filter (where slot='class')::int,
         count(*) filter (where slot in ('home','next'))::int,
         coalesce(sum(coalesce(u.page_end,u.page_start) - u.page_start + 1),0)::int,
         coalesce(sum(u.q_count),0)::int
  from it left join v2.units u on u.id = it.unit_id
$$;

/** 진도율 — 「전부 완료」의 분모에서 뺄 것: 건너뛴 단원 · 뺀 항목 */
create or replace function v2.book_progress(p_student uuid, p_book uuid)
returns table (done int, total int)
language sql stable as $$
  with sb as (select round from v2.student_book where student_id=p_student and book_id=p_book
              order by from_date desc limit 1),
  u as (select id from v2.units where book_id=p_book and state='active')
  select (select count(*)::int from v2.progress p, sb
          where p.student_id=p_student and p.round=sb.round and p.status='done'
            and p.unit_id in (select id from u)),
         (select count(*)::int from u)
$$;

/** 진도 체크가 며칠째 열려 있나 — 켠 날에서 센다. 저장하지 않는다 */
create or replace function v2.progress_open_days() returns int
language sql stable as $$
  select case when is_open then (v2.today() - opened_on) else null end
  from v2.progress_edit where scope='academy'
$$;
grant execute on all functions in schema v2 to authenticated;
