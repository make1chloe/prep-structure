-- 0108 · 반성문 기준 횟수 — 학원 기본 3회(규칙 warn.report_at), 아이마다 따로 둘 수 있다. 한 번 쓰면 그 뒤로 다시 N회를 센 뒤 또 한 번 (원장님 9/5 「그 횟수를 기본3회로 하고 학생마다 다르게해야겠어. 그리고 1번쓰면 다시 n번센뒤1번」). 한 번 더 돌려도 같다.
alter table v2.students add column if not exists warn_report_at smallint check (warn_report_at is null or warn_report_at > 0);
comment on column v2.students.warn_report_at is '이 아이의 반성문 기준 횟수. 비면 학원 기본(규칙 warn.report_at). 원장님이 오늘 수업 3b 나 학생 14 에서 고친다(확정-63)';

drop function if exists v2.warn_states(uuid[], date);
create or replace function v2.warn_states(p_students uuid[], p_on date)
returns table (student_id uuid, since date, count int, since_written int, today_why text, days text, due boolean, pending uuid, today_disposal text, report_at int, own_limit smallint)
language sql stable as $$
  with r as (select (select value::int from v2.rule where key = 'warn.report_at') report_at),
  s as (select unnest(p_students) sid),
  w as (select s.sid, v2.warn_since(s.sid, p_on) since, coalesce(st.warn_report_at::int, r.report_at) report_at, st.warn_report_at own_limit
          from s join v2.students st on st.id = s.sid, r),
  days as (select w.sid, d.date, d.why from w cross join lateral v2.warn_days(w.sid, w.since, p_on) d),
  -- 마지막으로 「쓴」 반성문(숙제·남아서) — 유예는 쓴 것이 아니다. 그 뒤부터 다시 센다
  last_written as (select w.sid, (select max(f.asked_on) from v2.reflection f where f.student_id = w.sid and f.disposal in ('homework', 'stay') and f.asked_on >= w.since and f.asked_on < p_on) at from w),
  agg as (
    select w.sid, w.since, w.report_at, w.own_limit,
           (select count(*)::int from days d where d.sid = w.sid) count,
           (select count(*)::int from days d, last_written l where d.sid = w.sid and l.sid = w.sid and (l.at is null or d.date > l.at)) since_written,
           (select d.why from days d where d.sid = w.sid and d.date = p_on) today_why,
           (select string_agg(case when d.date = p_on then '오늘 ' || d.why else to_char(d.date, 'FMMM/FMDD') || ' ' || d.why end, ' · ' order by d.date)
              from (select * from days d where d.sid = w.sid order by d.date desc limit 3) d) days,
           (select f.id from v2.reflection f where f.student_id = w.sid and f.disposal = 'defer' and f.asked_on < p_on
               and not exists (select 1 from v2.reflection g where g.student_id = w.sid and g.asked_on > f.asked_on) order by f.asked_on desc limit 1) pending,
           (select f.disposal from v2.reflection f where f.student_id = w.sid and f.asked_on = p_on) today_disposal
      from w)
  select a.sid, a.since, a.count, a.since_written, a.today_why, a.days,
         (a.today_why is not null and ((a.report_at > 0 and a.since_written >= a.report_at) or a.pending is not null)) due,
         a.pending, a.today_disposal, a.report_at, a.own_limit
    from agg a
$$;
comment on function v2.warn_states(uuid[], date) is '오늘 화면의 경고 상태 한 줄씩 — 횟수(count)는 마지막 정리 달부터 · since_written 은 마지막으로 쓴 반성문 뒤부터 · 기준(report_at)은 아이 것 → 학원 기본 · due = 오늘이 경고 하루이고(마지막 반성문 뒤 N회째 이상이거나 유예 중이면) 반성문을 묻는다';
grant execute on function v2.warn_states(uuid[], date) to authenticated, service_role;
