-- 0106 · 경고 · 반성문(확정-㊼, 원장님 9/5 「반성문 만들어」) — 경고는 저장하지 않고 사실에서 센다(대전제-5). 저장하는 것은 원장님이 정한 것 둘: 반성문 처분 · 달 정리. 한 번 더 돌려도 같다.
-- 규칙 줄(뼈대-5): 몇 회째면 반성문인가 · 미흡 몇 건부터 경고인가
insert into v2.rule (key, value, note) values
  ('warn.report_at', '3', '경고가 이 횟수째(그리고 그 배수째)면 반성문을 묻는다 — 「3회면 반성문」(확정-㊼)'),
  ('warn.weak_from', '2', '하루에 숙제 미흡(△)이 이 건수부터면 경고 하루로 센다 — 「미흡 2건부터」(확정-㊼)')
on conflict (key) do nothing;

-- ── 반성문 처분 — 한 줄 = 경고 N회째에 원장님이 정한 것 하나
create table if not exists v2.reflection (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references v2.students(id) on delete restrict,
  sheet_id    uuid references v2.day_sheet(id) on delete set null,
  asked_on    date not null,
  count_at    int  not null,
  disposal    text not null check (disposal in ('homework', 'stay', 'defer')),
  decided_by  uuid references v2.profiles(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, asked_on)
);
comment on table v2.reflection is
  '한 줄 = 반성문 처분 하나 — 경고 N회째(count_at)에 원장님이 정한 것: homework 다음 시간 숙제 · stay 오늘 남아서 쓰기(늦귀가 사유) · defer 유예(미룬 것 — 다음 경고에 다시 묻는다). 열쇠 (학생, 물은 날). 경고 자체는 저장하지 않는다(대전제-5)';
drop trigger if exists reflection_touch on v2.reflection;
create trigger reflection_touch before update on v2.reflection for each row execute function v2.touch_row();
drop trigger if exists reflection_audit on v2.reflection;
create trigger reflection_audit after insert or update or delete on v2.reflection for each row execute function v2.audit_row();
alter table v2.reflection enable row level security; alter table v2.reflection force row level security;
drop policy if exists reflection_staff on v2.reflection;
create policy reflection_staff on v2.reflection for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
drop policy if exists reflection_own on v2.reflection;
create policy reflection_own on v2.reflection for select to authenticated using (student_id in (select v2.my_students()));
grant select, insert, update on v2.reflection to authenticated, service_role;
insert into v2.purge_map(tbl, col, how, note) values ('reflection', 'note', 'null', '원장이 쓴 말') on conflict do nothing;

-- ── 달 정리 — 한 줄 = 달이 바뀌어 원장님이 「정리」(횟수만 0)하거나 「그냥 두기」 한 것. 학생이 비면 전원
create table if not exists v2.warn_reset (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references v2.students(id) on delete restrict,
  month      date not null,
  action     text not null check (action in ('reset', 'keep')),
  by_who     uuid references v2.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (student_id, month),
  constraint warn_reset_month_first check (month = date_trunc('month', month)::date)
);
comment on table v2.warn_reset is
  '한 줄 = 달이 바뀌어 원장님이 경고를 「정리」(reset — 횟수만 0, 기록은 남는다)하거나 「이번 달은 그냥 두기」(keep) 한 것. 열쇠 (학생 또는 전원, 달의 1일). 안 누르면 저절로 0이 되지 않는다(확정-㊼)';
drop trigger if exists warn_reset_audit on v2.warn_reset;
create trigger warn_reset_audit after insert or update or delete on v2.warn_reset for each row execute function v2.audit_row();
alter table v2.warn_reset enable row level security; alter table v2.warn_reset force row level security;
drop policy if exists warn_reset_staff on v2.warn_reset;
create policy warn_reset_staff on v2.warn_reset for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
grant select, insert, update on v2.warn_reset to authenticated, service_role;

-- ── 경고 하루 — 사실에서 센다(하루 1회): 지각 · 숙제 미제출(✕) 1건 · 미흡(△) warn.weak_from 건부터 · 단어 미통과(그날 본 단어 시험이 못 넘음, 재시험은 안 센다)
create or replace function v2.warn_days(p_student uuid, p_from date, p_to date)
returns table (date date, why text)
language sql stable as $$
  with r as (select (select value::int from v2.rule where key = 'warn.weak_from') weak_from),
  d as (
    select s.date,
           bool_or(s.attend = 'late') late,
           count(*) filter (where i.slot = 'check' and i.status = 'missing') missing,
           count(*) filter (where i.slot = 'check' and i.status = 'weak') weak
      from v2.day_sheet s left join v2.day_item i on i.sheet_id = s.id
     where s.student_id = p_student and s.date between p_from and p_to
     group by s.date),
  q as (
    select q.taken_on date, count(*) n from v2.quiz q
     where q.student_id = p_student and q.kind = 'word' and q.retry_of is null
       and q.taken_on between p_from and p_to and v2.quiz_passed(q.id) is false
     group by q.taken_on)
  select x.date,
         concat_ws(' · ', case when x.late then '지각' end,
                          case when x.missing >= 1 then '숙제 미제출' end,
                          case when x.weak >= r.weak_from then '미흡 ' || x.weak || '건' end,
                          case when coalesce(x.fail, 0) >= 1 then '단어 미통과' end) why
    from (select coalesce(d.date, q.date) date, d.late, d.missing, d.weak, q.n fail
            from d full join q on q.date = d.date) x, r
   where x.late or x.missing >= 1 or x.weak >= r.weak_from or coalesce(x.fail, 0) >= 1
   order by 1
$$;
comment on function v2.warn_days(uuid, date, date) is '경고 하루씩(하루 1회) — 지각 · 미제출 1건 · 미흡 N건부터(규칙 warn.weak_from) · 단어 미통과. 저장하지 않는다(대전제-5)';

-- 세기 시작 — 그 아이(또는 전원)의 마지막 「정리」 달의 1일. 없으면 처음부터
create or replace function v2.warn_since(p_student uuid, p_on date)
returns date language sql stable as $$
  select coalesce((select max(month) from v2.warn_reset w
                    where w.action = 'reset' and (w.student_id = p_student or w.student_id is null) and w.month <= p_on), date '1970-01-01')
$$;

-- 오늘 화면이 읽는 것 — 아이마다 한 줄: 세기 시작 · 횟수 · 오늘 까닭 · 최근 세 날 · 반성문을 물어야 하나(due) · 유예 중인 것 · 오늘 처분
create or replace function v2.warn_states(p_students uuid[], p_on date)
returns table (student_id uuid, since date, count int, today_why text, days text, due boolean, pending uuid, today_disposal text, report_at int)
language sql stable as $$
  with r as (select (select value::int from v2.rule where key = 'warn.report_at') report_at),
  s as (select unnest(p_students) sid),
  w as (select s.sid, v2.warn_since(s.sid, p_on) since from s),
  days as (select w.sid, w.since, d.date, d.why from w cross join lateral v2.warn_days(w.sid, w.since, p_on) d),
  agg as (
    select w.sid, w.since,
           (select count(*)::int from days d where d.sid = w.sid) count,
           (select d.why from days d where d.sid = w.sid and d.date = p_on) today_why,
           (select string_agg(case when d.date = p_on then '오늘 ' || d.why else to_char(d.date, 'FMMM/FMDD') || ' ' || d.why end, ' · ' order by d.date)
              from (select * from days d where d.sid = w.sid order by d.date desc limit 3) d) days,
           (select f.id from v2.reflection f where f.student_id = w.sid and f.disposal = 'defer' and f.asked_on < p_on
               and not exists (select 1 from v2.reflection g where g.student_id = w.sid and g.asked_on > f.asked_on) order by f.asked_on desc limit 1) pending,
           (select f.disposal from v2.reflection f where f.student_id = w.sid and f.asked_on = p_on) today_disposal
      from w)
  select a.sid, a.since, a.count, a.today_why, a.days,
         (a.today_why is not null and ((r.report_at > 0 and a.count > 0 and a.count % r.report_at = 0) or a.pending is not null)) due,
         a.pending, a.today_disposal, r.report_at
    from agg a, r
$$;
comment on function v2.warn_states(uuid[], date) is '오늘 화면의 경고 상태 한 줄씩 — 횟수는 마지막 정리 달부터 센다 · due = 오늘이 경고 하루이고(횟수가 report_at 의 배수이거나 유예 중인 반성문이 있으면) 반성문을 묻는다';

-- 월초 띠 — 이 달 정리(전원)를 아직 안 정했고, 정리 전 달들에 경고가 남아 있나
create or replace function v2.warn_band(p_on date)
returns table (month date, prev_month date, need boolean)
language sql stable as $$
  with m as (select date_trunc('month', p_on)::date as month),
  since as (select coalesce((select max(month) from v2.warn_reset w where w.student_id is null and w.action = 'reset' and w.month <= p_on), date '1970-01-01') since)
  select m.month, (m.month - 1)::date,
         not exists (select 1 from v2.warn_reset w, m where w.student_id is null and w.month = m.month)
         and exists (select 1 from v2.students st, m, since
                      where st.state = 'active'
                        and exists (select 1 from v2.warn_days(st.id, since.since, (m.month - 1)::date)))
    from m
$$;
grant execute on function v2.warn_days(uuid, date, date), v2.warn_since(uuid, date), v2.warn_states(uuid[], date), v2.warn_band(date) to authenticated, service_role;
