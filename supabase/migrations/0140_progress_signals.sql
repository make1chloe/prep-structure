-- 0140 5단계-①(9/7 ㉜ 「5단계 가기전 db돌리기완성부터」 → 실 DB 들어간 뒤 ①) — 대시보드 17 의 진도 신호 둘: **커서 잠김**(3주째 진도가 안 움직임 — 목업 17 「3주째 CHAPTER 5에 서 있습니다」) · **메모로만 N회 연속**(목업 02b 「⚠️ 이 교재 3회 연속 메모로만 갔습니다 — 교재를 안 폈는데 진도가 올라갑니다」). 「세 번」은 규칙 줄(뼈대-5 · 목업 ⑦) — 멱등
-- ① 규칙 둘
insert into v2.rule (key, value, note) values
  ('dash.cursor_stuck_days', '21', '마지막 진도 표시(없으면 교재 시작)부터 이 날수가 지나도록 진도가 안 움직이면 대시보드 빵꾸 「커서 잠김」 — 목업 17 「3주째」'),
  ('dash.memo_only_streak', '3',  '한 교재의 진도가 이 횟수째 연속으로 메모로만(마감 때 ✍ 자동 ○) 올라가면 02b 에 ⚠️ · 대시보드가 부른다 — 목업 ⑦ 「메모로만 세 번 연속」')
on conflict (key) do nothing;

-- ② 진도 줄의 「누가」에 memo 를 더한다 — 마감 때 메모로 대신한 자동 ○(lib/progress.js autoDoneOnClose)는 staff 가 아니라 memo 로 남긴다. 그래야 「메모로만」을 셀 수 있다. 옛 줄은 다 목록 안이라 그대로 검사한다
alter table v2.progress drop constraint if exists progress_last_by_check;
alter table v2.progress add constraint progress_last_by_check check (last_by in ('staff', 'student', 'check', 'import', 'memo'));
comment on column v2.progress.last_by is '마지막으로 누가 — staff 원장·강사(02b·08) · student 아이(08 · confirmed false) · check 숙제 검사 ○△✕(01) · import 이관 · memo 마감 때 메모로 자동 ○(01 마감 — 0140). 표 4-8 「쌤/내가」는 student 아니면 쌤';

-- ③ 메모로만 몇 회 연속인가 — 그 아이·그 교재의 진도 표시를 날짜별로 묶어, 가장 최근 날부터 「메모 자동 ○ 가 있고 원장님이 02b 에서 손으로 찍은 것은 없는 날」이 이어진 수.
--    손으로 찍은 날(staff — 02b ○◐·건너뛰기·되돌리기)이 나오면 거기서 끊긴다 · 검사(check)·아이(student)·이관(import)만 있는 날은 세지도 끊지도 않는다(교재를 폈는지는 02b 가 말한다)
create or replace function v2.memo_streak(p_student uuid, p_book uuid) returns int
language sql stable as $$
  with d as (
    select p.marked_on, bool_or(p.last_by = 'memo') memo, bool_or(p.last_by = 'staff') staff
      from v2.progress p join v2.units u on u.id = p.unit_id
     where p.student_id = p_student and u.book_id = p_book and p.marked_on is not null
     group by p.marked_on),
  r as (select memo, staff, row_number() over (order by marked_on desc) rn from d where memo or staff)
  select count(*)::int from r
   where rn < coalesce((select min(rn) from r where staff), (select max(rn) from r) + 1)
$$;
comment on function v2.memo_streak(uuid, uuid) is '메모로만 몇 회 연속(0140) — 최근 날부터 「메모 자동 ○ 만 있고 손(staff) 표시는 없는 날」의 수 · 손으로 찍은 날이 끊는다 · 검사·아이·이관만 있는 날은 건너뛴다. 규칙 dash.memo_only_streak 와 견준다';
grant execute on function v2.memo_streak(uuid, uuid) to authenticated, service_role;

-- ④ 대시보드 빵꾸 셈에 진도 신호를 얹는다 — 되돌림 타입이 바뀌어 다시 만든다(안 한 소단원 수는 그대로 · 마지막 진도 표시 날 · 교재 시작 날 · 메모로만 연속 수)
drop function if exists v2.todo_counts(uuid[], date);
create function v2.todo_counts(p_students uuid[], p_on date)
returns table (student_id uuid, book_id uuid, n int, last_mark_on date, since date, memo_streak int)
language sql stable as $$
  with b as (
    select sb.student_id, sb.book_id, min(sb.from_date) since
      from v2.student_book sb
     where sb.student_id = any(p_students)
       and sb.from_date <= p_on and (sb.to_date is null or sb.to_date >= p_on)
     group by sb.student_id, sb.book_id)
  select b.student_id, b.book_id,
         (select count(*)::int from v2.todo_units(b.student_id, b.book_id, p_on)) n,
         (select max(p.marked_on) from v2.progress p join v2.units u on u.id = p.unit_id where p.student_id = b.student_id and u.book_id = b.book_id) last_mark_on,
         b.since,
         v2.memo_streak(b.student_id, b.book_id) memo_streak
    from b
$$;
comment on function v2.todo_counts(uuid[], date) is
  '대시보드 빵꾸 막이 — 오늘 아이들의 살아 있는 교재마다 안 한 소단원 수(todo_units 위에서 · 0 이면 「안 한 소단원이 없다」) · 마지막 진도 표시 날(없으면 교재 시작 날부터 「커서 잠김」을 센다) · 메모로만 연속 수(0140)';
grant execute on function v2.todo_counts(uuid[], date) to authenticated, service_role;

-- ⑤ 대시보드 잡동사니 한 조회에 규칙(dash.*)까지 — 파도 20 상한을 안 넘긴다
drop function if exists v2.dash_ops(date);
create function v2.dash_ops(p_on date)
returns table (queue_ran_on date, queue_failed int, queue_waiting int, cc_last_at timestamptz, closed_today int, progress_open boolean, progress_opened_on date, progress_pending int, progress_flags int, pref jsonb, confirm_next jsonb, rules jsonb)
language sql stable security definer set search_path = v2, public as $$
  with nm as (select to_char((date_trunc('month', p_on::timestamp) + interval '1 month')::date, 'YYYY-MM') ym)
  select (select max(ran_on) from v2.day_ran where kind = 'queue'),
         (select count(*)::int from v2.job_queue where state = 'fail'),
         (select count(*)::int from v2.job_queue where state in ('wait', 'taking')),
         (select max(fetched_at) from v2.cc_planner),
         (select count(*)::int from v2.day_sheet where date = p_on and closed_at is not null),
         (select is_open from v2.progress_edit where scope = 'academy'),
         (select opened_on from v2.progress_edit where scope = 'academy'),
         (select count(*)::int from v2.progress where not confirmed),
         (select count(*)::int from v2.progress_flag where seen_at is null),
         (select layout from v2.screen_pref where profile_id = auth.uid() and screen = 'dash'),
         (select jsonb_build_object('ym', nm.ym,
            'all', (select count(*) from v2.classes c where c.state = 'active'),
            'ok', (select count(*) from v2.month_confirm m join v2.classes c on c.id = m.class_id and c.state = 'active' where m.ym = nm.ym and m.step = 3 and m.undone_at is null),
            'undone', (select count(*) from v2.month_confirm m join v2.classes c on c.id = m.class_id and c.state = 'active' where m.ym = nm.ym and m.step = 3 and m.undone_at is not null),
            'from_day', (select value from v2.rule where key = 'schedule.confirm_from_day')) from nm),
         (select coalesce(jsonb_object_agg(r.key, r.value), '{}'::jsonb) from v2.rule r where r.key like 'dash.%')
   where v2.is_staff()
$$;
comment on function v2.dash_ops(date) is '대시보드 17 잡동사니 한 조회 — 하루 정리 · 클래스카드 · 마감 수 · 진도 체크 열림 · 카드 순서 · 다음 달 확정 상태 · 규칙 dash.*(커서 잠김 날수 · 메모로만 횟수). 학원 사람만';
grant execute on function v2.dash_ops(date) to authenticated, service_role;
