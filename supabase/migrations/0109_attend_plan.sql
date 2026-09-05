-- 0109 · 결석·지각 예정(목업 02c, 확정-㉔) — 결석 예정은 보강 줄(v2.makeup, of_date = 빠지는 날) 한 벌로 · 지각 예정은 새 표 · 아이의 수업일은 SQL 한 곳(v2.student_days). 한 번 더 돌려도 같다.
-- 출결 CHECK 의 'makeup'(보강으로 온 날 — 보강 무리의 판은 앱이 이 값으로 세운다)은 0101 에 있다. 처음 0101 이 빠뜨렸던 것을 실제 DB 에 돌기 전에 제자리에서 고쳤다(검사-②) — 여기서 CHECK 를 다시 안 건다(한 벌)

-- 결석 예정 = 보강 줄 — of_date 가 빠지는 날. state: todo 보강 아직 안 잡음 · set 잡음(on_date·at_time) · done 했음 · waived 안 잡음(원장님이 정함). 사유와 학부모 알림 때를 더한다
alter table v2.makeup add column if not exists reason text;
alter table v2.makeup add column if not exists notified_at timestamptz;
alter table v2.makeup add column if not exists created_by uuid references v2.profiles(id) on delete set null;
comment on table v2.makeup is
  '한 줄 = 결석 하나와 그 보강 — of_date 빠지는 날(결석 예정도 여기 한 줄) · on_date·at_time 보강(원장님이 달력에서 직접, 앱은 제안 안 함 — 확정-㉔) · state todo/set/done/waived. ⚠️ 「그날 보강인가」는 여기서 세어 나온다 — day_sheet 에 안 적는다';
insert into v2.purge_map(tbl, col, how, note) values ('makeup', 'reason', 'null', '원장이 쓴 말') on conflict do nothing;
-- 결석 예정을 물리면 지우지 않고 cancelled 로(대전제-6) — 온다는 뜻. 옛 넷(todo·set·done·waived)은 그대로
alter table v2.makeup drop constraint if exists makeup_state_check;
alter table v2.makeup add constraint makeup_state_check check (state in ('todo', 'set', 'done', 'waived', 'cancelled'));
create unique index if not exists makeup_one_per_absence on v2.makeup (student_id, of_date) where of_date is not null and state not in ('done', 'cancelled');
-- 0043 의 유일키 makeup_key(학생·보강 날·빠지는 날, 이관 멱등용)에 물린 줄(cancelled)도 걸려 같은 날을 다시 결석 예정으로 못 잡았다(걷기가 잡음). **물린 줄은 유일성에서 빠진다** — 살아 있는 줄만 세는 부분 유일 색인으로(이름은 그대로). 이관 ⑤ 의 충돌 대상은 0110 이 여기에 맞춘다
alter table v2.makeup drop constraint if exists makeup_key;
create unique index if not exists makeup_key on v2.makeup (student_id, on_date, of_date) nulls not distinct where state <> 'cancelled';

-- 지각 예정 — 한 줄 = 그 아이가 그날 얼마나 늦게 오나
create table if not exists v2.late_plan (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references v2.students(id) on delete restrict,
  date        date not null,
  minutes     smallint check (minutes is null or minutes > 0),
  reason      text,
  notified_at timestamptz,
  cancelled_at timestamptz,
  created_by  uuid references v2.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 같은 규칙 — 물린 줄(cancelled_at)은 유일성에서 빠진다: 살아 있는 지각 예정은 (학생, 날짜)에 하나
alter table v2.late_plan drop constraint if exists late_plan_student_id_date_key;
create unique index if not exists late_plan_one_live on v2.late_plan (student_id, date) where cancelled_at is null;
comment on table v2.late_plan is '한 줄 = 지각 예정 하나 — 그 아이가 그날 몇 분 늦게 오나(사유 · 학부모 알림 때 · 물리면 cancelled_at — 지우지 않는다). 살아 있는 줄은 (학생, 날짜)에 하나(late_plan_one_live). 그날 실제 출결은 day_sheet.attend 가 정한다';
drop trigger if exists late_plan_touch on v2.late_plan;
create trigger late_plan_touch before update on v2.late_plan for each row execute function v2.touch_row();
drop trigger if exists late_plan_audit on v2.late_plan;
create trigger late_plan_audit after insert or update or delete on v2.late_plan for each row execute function v2.audit_row();
alter table v2.late_plan enable row level security; alter table v2.late_plan force row level security;
drop policy if exists late_plan_staff on v2.late_plan;
create policy late_plan_staff on v2.late_plan for all to authenticated using (v2.is_staff()) with check (v2.is_staff());
drop policy if exists late_plan_own on v2.late_plan;
create policy late_plan_own on v2.late_plan for select to authenticated using (student_id in (select v2.my_students()));
grant select, insert, update on v2.late_plan, v2.makeup to authenticated, service_role;
insert into v2.purge_map(tbl, col, how, note) values ('late_plan', 'reason', 'null', '원장이 쓴 말') on conflict do nothing;

-- 아이의 수업일 — 반 시간표 요일(기간 안) − 휴강(전체 또는 그 반) + 보강 날. 달력·회차·명단이 같은 것을 센다
create or replace function v2.student_days(p_student uuid, p_from date, p_to date)
returns table (date date, class_id uuid, start_time time, kind text)
language sql stable as $$
  with days as (select d::date d from generate_series(p_from, p_to, '1 day') d),
  cls as (
    select days.d, s.class_id, s.start_time
      from days
      join v2.class_member m on m.student_id = p_student and m.from_date <= days.d and (m.to_date is null or m.to_date >= days.d)
      join v2.class_schedule s on s.class_id = m.class_id and s.from_date <= days.d and (s.to_date is null or s.to_date >= days.d)
       and extract(dow from days.d)::smallint = any(s.weekdays)
      join v2.classes c on c.id = m.class_id and c.state = 'active')
  select c.d, c.class_id, c.start_time,
         case when exists (select 1 from v2.holiday h where h.date = c.d and (h.class_id is null or h.class_id = c.class_id)) then 'off' else 'class' end
    from cls c
  union all
  select k.on_date, null, k.at_time, 'makeup'
    from v2.makeup k where k.student_id = p_student and k.state = 'set' and k.on_date between p_from and p_to
  order by 1, 3
$$;
comment on function v2.student_days(uuid, date, date) is '그 아이가 오는 날 — class 수업일 · off 휴강 · makeup 보강. 02c 달력·12 일정·회차가 이것 하나를 센다(대전제-5)';
grant execute on function v2.student_days(uuid, date, date) to authenticated, service_role;
