-- ⚠️⚠️ 내가 출결을 잘못 옮겼다. 셋을 고친다.
--
-- ① 「왔나」와 「보강이냐」는 **다른 축**이다. attend 한 칸에 섞어 놓아서
--    옛 자료의 「보강으로 왔는데 지각」 145줄을 담을 수가 없었다.
--    → attend 에서 makeup 을 뺀다. 「그날 보강인가」는 v2.makeup 에서 **세어 나온다**(원칙 5).
--
-- ② 옛 `attendance` 표는 출결부가 아니라 **결석·보강 장부**다 (실측:
--    makeup 368 · absent 140 · present 12). 진짜 그날 출결은 **판**에 있다
--    (late 475 · present 403). → **판이 day_sheet 의 주인**이다.
--    ⚠️ 내 대조가 이걸 못 잡은 까닭: 옛 표를 그대로 베꼈는지만 봤다.
--       계획이 경고한 「표 줄 수 대조」의 함정을 내가 그대로 밟았다.
--
-- ③ 열쇠 (student_id, date, class_id) 에서 class_id 가 **515줄 전부 비어 있다**.
--    Postgres 는 NULL 을 서로 다른 값으로 보므로 **열쇠가 한 번도 안 걸렸다**.
--    0단계 1번이 정확히 경고한 자리다. → `nulls not distinct`

-- ⚠️ 제약을 바꾸기 전에 지운다 — attend='makeup' 368줄이 새 제약에 걸린다
delete from v2.day_sheet where import_batch = 'import';

alter table v2.day_sheet drop constraint day_sheet_attend_check;
alter table v2.day_sheet add  constraint day_sheet_attend_check
  check (attend in ('present','late','absent','off'));
comment on column v2.day_sheet.attend is
  '그날 왔나. ⚠️ 보강은 여기 안 적는다 — v2.makeup 이 주인이고 세어 나온다';

alter table v2.day_sheet drop constraint day_sheet_student_id_date_class_id_key;
alter table v2.day_sheet add  constraint day_sheet_student_id_date_class_id_key
  unique nulls not distinct (student_id, date, class_id);

-- 「그날 보강으로 온 날인가」 — 저장하지 않고 센다
create or replace function v2.is_makeup_day(p_student uuid, p_date date)
returns boolean language sql stable as $$
  select exists (select 1 from v2.makeup m
    where m.student_id = p_student and m.on_date = p_date and m.state <> 'waived')
$$;
grant execute on function v2.is_makeup_day(uuid, date) to authenticated, service_role;

-- 다시 옮긴다
create or replace function v2.import_day_sheet()
returns table(what text, n int) language plpgsql security definer
set search_path = v2, public as $$
begin
  -- ⓐ **판이 주인**. attendance_kind 가 비면 present — 판이 있다는 것이 곧 수업했다는 뜻이다
  insert into v2.day_sheet(student_id, date, attend, comment, import_batch)
  select r.student_id, r.date,
         case r.attendance_kind when 'late' then 'late' when 'absent' then 'absent'
                                when 'makeup' then 'present'   -- 보강도 「왔다」. 보강 여부는 makeup 표
                                when 'online' then 'present' else 'present' end,
         nullif(r.notice,''), 'import'
  from public.daily_reports r
  where exists (select 1 from v2.students x where x.id=r.student_id)
    and r.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (student_id, date, class_id) do nothing;
  what:='판에서'; n:=(select count(*)::int from v2.day_sheet where import_batch='import'); return next;

  -- ⓑ 판이 없는 날만 결석 장부에서. **makeup 은 안 쓴다** — 그건 보강 표가 가진다
  insert into v2.day_sheet(student_id, date, attend, import_batch)
  select a.student_id, a.date,
         case a.status when 'absent' then 'absent' else 'present' end, 'import'
  from public.attendance a
  where a.status in ('absent','present')
    and exists (select 1 from v2.students x where x.id=a.student_id)
    and a.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (student_id, date, class_id) do nothing;
  what:='결석 장부에서 더함'; n:=(select count(*)::int from v2.day_sheet where import_batch='import'); return next;

  -- ⓒ 보강 온 날에 판이 없으면 그날도 판을 세운다 (왔으니까)
  insert into v2.day_sheet(student_id, date, attend, import_batch)
  select m.student_id, m.on_date, 'present', 'import'
  from v2.makeup m where m.on_date is not null and m.state <> 'waived'
  on conflict (student_id, date, class_id) do nothing;
  what:='보강 온 날'; n:=(select count(*)::int from v2.day_sheet where import_batch='import'); return next;

  -- ⚠️ closed_at 은 **비운다.** 옛 앱에서 마감한 판이 **0개**다 (report_done 0 · closed_at 0).
  --    사고 #7 로 학생·학부모가 마감 전 판을 보고 있었을 뿐, 정식으로 나간 것은 없다.
  --    → 지난 판은 아이·학부모에게 **안 보인다.** 켜려면 여기 한 줄이다.
end $$;
grant execute on function v2.import_day_sheet() to service_role;
