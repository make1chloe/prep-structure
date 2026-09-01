-- ─────────────────────────────────────────────────────────────
-- 0025 · 교재·단원 이관
--
-- ⚠️ 옛 앱은 **나무(parent_id)** 이고 v2 는 **대/중/소 세 칸 고정**이다.
--    실측 깊이 — 1겹 1,452 · 2겹 4,023 · 3겹 1,890 → **3겹을 넘지 않는다** ✅
-- ⚠️ 옛 `activity` 칸은 **0줄**이다. 활동명은 `label` 에 들어 있다
--    (Practice 622 · 워크북 610 · 문제풀이 488 …) — 계획이 짚은 「한 칸에 섞임」.
--    → `label` 을 `activity` 로 옮기고, 「워크북」이면 **갈래**를 세운다.
-- ─────────────────────────────────────────────────────────────
create or replace function v2.import_books() returns table(what text, n int)
language plpgsql security definer set search_path = v2, public as $$
begin
  insert into v2.books(id, name, area, publisher, pub_year, level, price, buy_url, state, import_batch)
  select t.id, t.name, (select m.new_area from v2.area_map m where m.old_area = t.area), null, t.pub_year, t.target_grade, t.price, t.purchase_url,
         case t.status when 'active' then 'active' when 'paused' then 'paused' else 'stopped' end,
         'import'
  from public.textbooks t
  on conflict (id) do update set name=excluded.name, area=excluded.area, state=excluded.state;
  insert into v2.import_map(old_table, old_id, new_table, new_id)
  select 'textbooks', t.id::text, 'books', t.id from public.textbooks t
  on conflict (old_table, old_id) do nothing;
  -- ⚠️ 접을 데가 없는 영역은 **보류**로 남긴다 (계획: 「보류 0 이 아니면 전환하지 않는다」)
  update v2.import_map m set skip_why = '⚠️ 영역이 안 접힌다 — 옛 영역: '||coalesce(t.area,'(빈칸)')
  from public.textbooks t
  where m.old_table='textbooks' and m.old_id=t.id::text
    and (t.area is null or t.area not in (select old_area from v2.area_map where new_area is not null));
  what:='books'; n:=(select count(*)::int from v2.books where import_batch='import'); return next;

  -- 나무를 세 칸으로 편다
  with recursive tree as (
    select u.id, u.textbook_id, u.parent_id, u.label, u.name, u.sort,
           u.page_start, u.page_end, u.question_count, u.question_range,
           1 lvl, coalesce(u.name,u.label) c1, null::text c2, null::text c3,
           lpad(u.sort::text,6,'0') path
    from public.textbook_units u where u.parent_id is null
    union all
    select u.id, u.textbook_id, u.parent_id, u.label, u.name, u.sort,
           u.page_start, u.page_end, u.question_count, u.question_range,
           t.lvl+1, t.c1,
           case when t.lvl=1 then coalesce(u.name,u.label) else t.c2 end,
           case when t.lvl=2 then coalesce(u.name,u.label) else t.c3 end,
           t.path||'.'||lpad(u.sort::text,6,'0')
    from public.textbook_units u join tree t on u.parent_id = t.id),
  leaf as (                                   -- 잎만 배정 단위가 된다
    select * from tree t where not exists (select 1 from public.textbook_units k where k.parent_id=t.id)),
  deep as (select textbook_id, max(lvl) mx from tree group by 1)
  insert into v2.units(id, book_id, chapter, mid, sub, activity, is_workbook, sort,
                       page_start, page_end, q_count, q_range, state, import_batch)
  select l.id, l.textbook_id,
         l.c1,
         case when d.mx >= 3 then l.c2 end,                        -- 3겹이면 중단원
         case when d.mx >= 3 then l.c3 else l.c2 end,              -- 2겹이면 둘째가 소단원
         coalesce(l.label, l.name, '본책'),                         -- ⚠️ label → activity
         coalesce(l.label,'') ~ '워크|workbook',                    -- 갈래
         row_number() over (partition by l.textbook_id order by l.path)::int,
         l.page_start, l.page_end, l.question_count, l.question_range,
         'active', 'import'
  from (select *, row_number() over (
          partition by textbook_id, c1,
                       case when 3 <= (select max(lvl) from tree t2 where t2.textbook_id=leaf.textbook_id) then c2 end,
                       case when 3 <= (select max(lvl) from tree t2 where t2.textbook_id=leaf.textbook_id) then c3 else c2 end,
                       coalesce(label,name,'본책')
          order by path) rn
        from leaf) l
  join deep d on d.textbook_id = l.textbook_id
  where l.textbook_id is not null and l.rn = 1     -- ⚠️ 겹치는 조합은 **첫 줄만**
  on conflict (id) do nothing;
  insert into v2.import_map(old_table, old_id, new_table, new_id)
  select 'textbook_units', u.id::text, 'units', u.id from public.textbook_units u
  where exists (select 1 from v2.units x where x.id=u.id)
  on conflict (old_table, old_id) do nothing;
  -- 잎이 아닌 줄(가지)은 **안 옮긴다** — 사유를 남긴다
  insert into v2.import_map(old_table, old_id, skip_why)
  select 'textbook_units', u.id::text,
    case when exists (select 1 from public.textbook_units k where k.parent_id=u.id)
         then '가지(자식이 있는 줄) — 배정 단위가 아니다'
         else '⚠️ 같은 (교재·대·중·소·활동) 조합이 이미 있다 — 첫 줄만 옮겼다' end
  from public.textbook_units u
  where not exists (select 1 from v2.units x where x.id=u.id)
  on conflict (old_table, old_id) do update set skip_why=excluded.skip_why;
  what:='units'; n:=(select count(*)::int from v2.units where import_batch='import'); return next;

  -- 학생–교재 배정
  -- ⚠️ 소속의 과거는 복원 불가다 — 시작일이 없으면 **이관일**로 박고 사유를 남긴다
  insert into v2.student_book(student_id, book_id, from_date, to_date, round, per_session,
                              stop_mode, import_batch)
  select st.student_id, st.textbook_id,
         coalesce(st.assigned_on, v2.today()),
         st.ended_on,
         coalesce(st.round,1), 2,
         -- ⚠️ 원장님 절 ⑬ 이 실물로 있다 — pause: all 7줄 · home 8줄
         case st.pause when 'all' then 'book_off' when 'home' then 'hw_off' else 'running' end,
         'import'
  from public.student_textbooks st
  where exists (select 1 from v2.students x where x.id=st.student_id)
    and exists (select 1 from v2.books   x where x.id=st.textbook_id)
    and st.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (student_id, book_id, from_date) do nothing;
  insert into v2.import_map(old_table, old_id, skip_why)
  select 'student_textbooks', st.student_id::text||'|'||st.textbook_id::text,
         '⚠️ 시작일이 비어 이관일로 박았다 — 그 이전 달 회차·수강료는 못 맞춘다'
  from public.student_textbooks st where st.assigned_on is null
  on conflict (old_table, old_id) do nothing;
  what:='student_book'; n:=(select count(*)::int from v2.student_book); return next;

  -- ⭐ 진도 — 이관이 반드시 옮겨야 하는 것
  insert into v2.progress(student_id, unit_id, round, status, done_on, last_by, confirmed, note)
  select p.student_id, p.textbook_unit_id, coalesce(p.round,1),
         case p.status when 'done' then 'done' when 'doing' then 'doing' else 'none' end,
         p.done_on, 'import', true, p.note
  from public.student_unit_progress p
  where exists (select 1 from v2.students x where x.id=p.student_id)
    and exists (select 1 from v2.units    x where x.id=p.textbook_unit_id)
    and p.student_id::text not in (select old_id from v2.import_skip where old_table='students')
  on conflict (student_id, unit_id, round) do nothing;
  what:='progress'; n:=(select count(*)::int from v2.progress where last_by='import'); return next;
end $$;
grant execute on function v2.import_books() to service_role;
