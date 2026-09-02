-- 0052 · 규칙을 전수로 긁다 나온 **진짜 사고 여섯**을 막는다
-- (에이전트 셋이 v2 스키마 · 계획서 · 옛 앱을 나란히 읽고 어긋난 자리 16개를 찾았다)

-- ① ⚠️⚠️ **학부모가 자기 아이 진도를 찍을 수 있었다.**
--    `my_students()` 는 「학생 자신 + 학부모의 아이들」을 돌려준다. 아이 진도 정책이
--    그걸 그대로 써서, 계획이 「아이」라고만 적어 둔 자리에 **학부모가 들어와 있었다.**
--    게다가 last_by 에 'parent' 값이 없어 **화면에는 「내가」로 찍힌다** — 아이가 한 것처럼 보인다.
create or replace function v2.my_own_student() returns setof uuid
language sql stable security definer set search_path = v2, public as $$
  select s.id from v2.students s where s.profile_id = auth.uid()
$$;
comment on function v2.my_own_student is
  '⚠️ **학생 자신만.** 학부모는 안 든다 — my_students() 와 다르다. 진도를 찍는 자리에만 쓴다';
grant execute on function v2.my_own_student() to authenticated;

drop policy child_progress_insert on v2.progress;
drop policy child_progress_update on v2.progress;
create policy child_progress_insert on v2.progress for insert to authenticated
  with check (
    student_id in (select v2.my_own_student())   -- ⚠️ 아이 자신만. 학부모 아님
    and v2.can_edit_progress(student_id)
    and last_by = 'student' and confirmed = false
  );
create policy child_progress_update on v2.progress for update to authenticated
  using (
    student_id in (select v2.my_own_student())
    and v2.can_edit_progress(student_id)
    and (last_by = 'student' or status = 'none')
  )
  with check (
    student_id in (select v2.my_own_student())
    and last_by = 'student' and confirmed = false
  );
-- ❗이의는 학부모도 달 수 있게 그대로 둔다 — 진도를 **안 바꾸고** 원장님께 말만 거는 자리다

-- ② ⚠️ 진도의 감사 기록이 **2,999줄 전부 row_id='?'** 였다.
--    audit_row() 가 'id' 칸으로 열쇠를 잡는데 progress 에는 id 칸이 없다(열쇠가 세 칸).
--    「누가 언제 이 아이 이 단원을 바꿨나」를 되짚을 수가 없었다.
create or replace function v2.audit_row() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare k text; j jsonb;
begin
  j := to_jsonb(coalesce(new, old));
  k := j ->> 'id';
  if k is null then                       -- id 칸이 없는 표는 **기본 열쇠 칸들을 이어 붙인다**
    select string_agg(j ->> a.attname, '|' order by x.ord)
      into k
      from pg_index i
      join lateral unnest(i.indkey) with ordinality as x(att, ord) on true
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = x.att
     where i.indrelid = tg_relid and i.indisprimary;
  end if;
  insert into v2.audit(who, tbl, row_id, op, before, after)
  values (auth.uid(), tg_table_name, coalesce(k, '?'), lower(tg_op),
          case when tg_op in ('update','delete') then to_jsonb(old) end,
          case when tg_op in ('update','insert') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ③ ⚠️ day_item.status 가 **NULL 을 받고 기본값도 없었다.** NULL 과 'none' 이 둘 다
--    「아직」을 뜻해 화면과 집계가 두 갈래로 갈린다 (대조도 status 로 센다).
update v2.day_item set status = 'none' where status is null;
alter table v2.day_item alter column status set default 'none';
alter table v2.day_item alter column status set not null;

-- ④ ⚠️ 같은 판·같은 묶음·같은 항목·같은 단원이 여러 줄 설 수 있었다.
--    서면 숙제가 화면에 두 번 뜨고, 진도에 매달 때 같은 단원을 여러 번 완료 처리한다.
--    (지금은 0줄 — 막아 두는 것이지 고치는 것이 아니다)
alter table v2.day_item add constraint day_item_one_per_slot
  unique nulls not distinct (sheet_id, slot, item_id, unit_id);

-- ⑤ ⚠️ 판을 지우면 그날 검사 기록이 **오류 없이 통째로** 사라졌다 (CASCADE).
--    진도 계열은 전부 RESTRICT 인데 여기만 달랐다. 대전제 6 — 지우지 않는다.
alter table v2.day_item drop constraint day_item_sheet_id_fkey;
alter table v2.day_item add  constraint day_item_sheet_id_fkey
  foreign key (sheet_id) references v2.day_sheet(id) on delete restrict;

-- ⑥ ⚠️ 죽은 칸 — book_id 는 4,131줄 전부 비어 있고, 채우면 unit_id 와 **두 벌**이 된다(원칙 1).
alter table v2.day_item drop column book_id;

-- ⑦ ⚠️ 진도율과 커서가 **서로 다른 답**을 냈다. 둘 다 고친다.
--    ⓐ 커서는 skip 을 「끝난 것」으로 보는데 진도율은 분모에 그대로 뒀다
--       → 다 끝냈는데 「3/4」 로 보이고 교재가 영영 안 끝난다
--    ⓑ 커서는 **오늘 열려 있는 배정**만 보는데 진도율은 날짜를 안 봤다
--       → 끝난 배정의 회독으로 세어 커서와 다른 줄을 골랐다
drop function if exists v2.book_progress(uuid, uuid);
create function v2.book_progress(p_student uuid, p_book uuid)
returns table (done int, skipped int, total int)
language sql stable as $$
  with sb as (select round from v2.student_book
              where student_id=p_student and book_id=p_book
                and from_date <= v2.today() and (to_date is null or to_date >= v2.today())
              order by from_date desc limit 1),
  u as (select id from v2.units where book_id=p_book and state='active'),
  p as (select p.status from v2.progress p, sb
        where p.student_id=p_student and p.round=sb.round and p.unit_id in (select id from u))
  select (select count(*)::int from p where status='done'),
         (select count(*)::int from p where status='skip'),
         -- 건너뛴 단원은 **분모에서 뺀다** — 지운 것이 아니라 「안 한 채로 넘어간 것」이라
         -- 따로 세어 보여준다 (진도율과 월간 리포트에서 구별된다)
         (select count(*)::int from u) - (select count(*)::int from p where status='skip')
$$;
comment on function v2.book_progress is
  '⚠️ 커서와 **같은 배정 줄**(오늘 열린 것)을 봐야 한다. 안 그러면 커서는 끝났다는데 진도율은 3/4 가 된다';
