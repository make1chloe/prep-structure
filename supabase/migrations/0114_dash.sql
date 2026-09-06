-- 0114 — 대시보드(목업 17)가 한 조회로 읽는 것 셋. 화면은 조회 20 · 5단 안(속도-상한) — 첫 판이 21 이라 둘을 접었다(닫힌 판 수는 ②에, 루틴 두 표는 ③ 하나로)
--
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다.

-- ══ ① 오늘 아이들의 교재마다 「안 한 소단원 수」 — v2.todo_units(0103) 위에서 센다(판단 한 벌 · 원칙-1).
--     빵꾸 막이의 「안 한 소단원이 없다」(책 끝)가 이것으로 선다. 아이·교재마다 rpc 를 부르면 조회 상한을 넘는다
create or replace function v2.todo_counts(p_students uuid[], p_on date)
returns table (student_id uuid, book_id uuid, n int)
language sql stable as $$
  with b as (
    select distinct sb.student_id, sb.book_id
      from v2.student_book sb
     where sb.student_id = any(p_students)
       and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on))
  select b.student_id, b.book_id,
         (select count(*)::int from v2.todo_units(b.student_id, b.book_id, p_on)) n
    from b
$$;
comment on function v2.todo_counts(uuid[], date) is
  '대시보드 빵꾸 막이 — 오늘 아이들의 살아 있는 교재마다 안 한 소단원 수(todo_units 위에서). 0 이면 「안 한 소단원이 없다」';

-- ══ ② 안 돌고 있는 것 — 하루 정리(큐)가 마지막으로 돈 날 · 실패로 남은 일 · 기다리는 일 · 클래스카드 마지막 수신.
--     큐는 사람이 못 읽는다(0017) — 그래서 definer 로 세되 학원 사람에게만 답한다(집계 숫자뿐, 열쇠·본문 없음)
create or replace function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int)
language sql stable security definer set search_path = v2, public as $$
  select (select max(ran_on) from v2.day_ran where kind = 'queue'),
         (select count(*)::int from v2.job_queue where state = 'fail'),
         (select count(*)::int from v2.job_queue where state in ('wait', 'taking')),
         (select max(fetched_at) from v2.cc_planner),
         (select count(*)::int from v2.day_sheet where date = p_on and closed_at is not null)   -- 📨 「데일리리포트 마감 n / N」의 n — 조회 하나를 아끼려 여기에
   where v2.is_staff()
$$;
comment on function v2.dash_ops(date) is
  '대시보드 「안 돌고 있는 것」 — 하루 정리가 마지막으로 돈 날(day_ran queue) · 큐 실패·대기 수 · 클래스카드 마지막 수신 · 오늘 마감한 판 수. 학원 사람이 아니면 0줄';

-- ══ ③ 루틴이 있는 영역 — 학생 루틴(student_id 있음)과 영역 루틴(student_id 없음)을 한 조회로. 「이 아이 이 영역에 루틴 줄이 있나」가 빵꾸 막이의 첫 물음이다(확정-㉒: 학생 루틴이 있으면 그것, 없으면 영역 루틴)
create or replace function v2.routine_areas(p_students uuid[])
returns table (student_id uuid, area text)
language sql stable as $$
  select distinct sr.student_id, sr.area::text from v2.student_routine sr join v2.learn_items li on li.id = sr.item_id
   where sr.student_id = any(p_students) and li.state = 'active'
  union
  select distinct null::uuid, ar.area::text from v2.area_routine ar join v2.learn_items li on li.id = ar.item_id
   where li.state = 'active'
$$;
comment on function v2.routine_areas(uuid[]) is '살아 있는 루틴 줄이 있는 영역 — student_id 가 있으면 그 아이의 학생 루틴, 없으면 학원의 영역 루틴';
grant execute on function v2.todo_counts(uuid[], date), v2.dash_ops(date), v2.routine_areas(uuid[]) to authenticated, service_role;
