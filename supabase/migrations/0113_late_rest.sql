-- 0113 — 늦귀가 나머지(확정-⑭ · 목업 01 3b · 규칙 페이지 「늦귀가 과제 · 알림」)
--   ① 되풀이 규칙 줄(뼈대-5) — 「같은 아이가 3주 안에 세 번 남으면 앱이 「숙제량을 볼까요」를 먼저 묻는다 — 원장님이 세지 않는다」
--   ② 실제 하원 한 벌 — v2.arrival 걸음 4(0083) 를 서울 시각으로 읽는 함수 하나. 오늘 카드(01)·학부모(09)가 같은 것을 읽는다(원칙-1)
--   ③ 오늘 화면의 늦귀가 상태 한 줄씩(late_states) — 셈은 여기, 문구·판단은 lib/late-plan.js(순수)
--   ④ ⚠️ 학부모 쪽 함수 late_for_family(0071)가 0083 이 걷어낸 칸(late_stay.left_at)을 아직 읽고 있었다 — 부르면
--      「column l.left_at does not exist」. SQL 함수는 몸을 만들 때만 보고 칸이 사라져도 안 알려 준다(0071 이 0083 보다 먼저 돌아 check-sql 이 못 잡음).
--      같은 이름·같은 모양으로 다시 짓되 실제 하원은 ② 에서 읽는다. 이런 것을 잡는 검사가 check-sql-funcs(검사-㊸)다.
--
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다 — check-sql 이 SETUP_ALL 을 3번 돌린다.

-- ══ ① 규칙 줄
insert into v2.rule (key, value, note) values
  ('late.repeat_count', '3',  '오늘까지 late.repeat_days 안에 이 횟수째 남으면(예상 귀가를 적은 날을 센다) 「숙제량을 볼까요」를 앱이 먼저 묻는다 — 「3주에 세 번」(확정-⑭)'),
  ('late.repeat_days',  '21', '되풀이를 세는 날수 — 오늘을 넣어 거슬러 21일(3주)')
on conflict (key) do nothing;

-- ══ ② 실제 하원 — 등원 표의 걸음 4 하나뿐(0083, 원칙-1). 서울 시각(time)으로 돌려 예상 귀가(until_at, time)와 바로 견준다
create or replace function v2.left_at(p_student uuid, p_date date) returns time
language sql stable as $$
  select (a.at at time zone 'Asia/Seoul')::time
    from v2.arrival a
   where a.student_id = p_student and a.date = p_date and a.step = 4
$$;
comment on function v2.left_at(uuid, date) is
  '실제 하원(서울 시각) — v2.arrival 걸음 4 한 줄. 늦귀가 카드(01)·학부모(09)·리포트가 전부 이것을 읽는다. 「예상과 실제의 차이」는 저장하지 않고 세어 나온다(원칙-5)';

-- ══ ③ 오늘 화면의 늦귀가 상태 — 실제 하원 · 되풀이(오늘을 넣어 window_days 안에 약속(until_at)이 있던 날 수 · 최근 3일 글자) · 기준 · 묻나
--     ⚠️ 규칙 줄이 없으면 repeat_at·window_days 가 null 로 나온다 — lib/late.js 가 그것을 보고 던진다(뼈대-5: 조용히 기본값으로 안 돈다)
create or replace function v2.late_states(p_students uuid[], p_on date)
returns table (student_id uuid, left_at time, stayed int, stayed_days text, repeat_at int, window_days int, ask boolean)
language sql stable as $$
  with r as (select (select value::int from v2.rule where key = 'late.repeat_count') repeat_at,
                    (select value::int from v2.rule where key = 'late.repeat_days')  window_days),
  s as (select unnest(p_students) sid),
  d as (select distinct sh.student_id sid, sh.date
          from v2.day_sheet sh join v2.late_stay l on l.sheet_id = sh.id, r
         where sh.student_id = any(p_students) and l.until_at is not null
           and sh.date <= p_on and sh.date > p_on - r.window_days),
  agg as (select s.sid,
                 (select count(*)::int from d where d.sid = s.sid) stayed,
                 (select string_agg(case when x.date = p_on then '오늘' else to_char(x.date, 'FMMM/FMDD') end, ' · ' order by x.date)
                    from (select d.date from d where d.sid = s.sid order by d.date desc limit 3) x) stayed_days
            from s)
  select a.sid, v2.left_at(a.sid, p_on), a.stayed, a.stayed_days, r.repeat_at, r.window_days,
         (r.repeat_at > 0 and a.stayed >= r.repeat_at) ask
    from agg a, r
$$;
comment on function v2.late_states(uuid[], date) is
  '오늘 화면의 늦귀가 상태 한 줄씩 — left_at 실제 하원(걸음 4) · stayed 는 오늘을 넣어 late.repeat_days 안에 예상 귀가를 적은 날 수 · ask = stayed ≥ late.repeat_count(「숙제량을 볼까요」를 앱이 먼저 묻는다, 확정-⑭)';
grant execute on function v2.left_at(uuid, date), v2.late_states(uuid[], date) to authenticated, service_role;

-- ══ ④ 학부모 쪽 — 같은 모양으로 다시(반환 모양이 같아 create or replace 가 된다). 실제 하원은 ② 한 벌
create or replace function v2.late_for_family()
returns table (id uuid, student_id uuid, student_name text, on_date date,
               reason text, until_at time, left_at time, sent_at timestamptz)
language sql stable security definer set search_path = v2, public as $$
  select l.id, s.student_id, st.name, s.date, l.reason, l.until_at, v2.left_at(s.student_id, s.date), l.sent_at
    from v2.late_stay l
    join v2.day_sheet s on s.id = l.sheet_id
    join v2.students st on st.id = s.student_id
   where l.sent_at is not null
     and s.student_id in (select v2.my_students())
$$;
comment on function v2.late_for_family() is
  '보낸 늦귀가만 가족에게(sent_at = 01 에서 보내기를 누른 때). 마감을 기다리지 않는다 — 안 그러면 알림을 눌러도 아무것도 안 보인다. '
  '실제 하원(left_at)은 v2.left_at(등원 걸음 4)에서 — 09 「실제 하원을 찍으면 여기가 바뀝니다」(0113)';
