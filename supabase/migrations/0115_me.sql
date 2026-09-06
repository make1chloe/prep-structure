-- 0115 — 아이 화면 07(「나」)이 읽고 쓰는 것 셋
--   ① 아이·학부모가 제 결석·보강(v2.makeup)을 읽는다 — 07 「앞으로」 · 09 학부모. 지금은 학원 사람 규칙뿐이라 아이 자격으로 0줄(실측: 0109 는 late_plan 에만 own 을 뒀다)
--   ② 마지막으로 마감한 판의 영역 메모 — 07 「선생님 한 마디」. own_read_dam(0086, 마감한 판만) 위에서 선다 — 규칙은 그대로, 조회 하나로 줄인다
--   ③ 「다 했어요」를 아이가 **무를 수 있다** — 원장님 답 ⑧(2026-09-03 「가능」). 0082·0084 의 문지기가 「한 번 누르면 못 내린다」로 막고 있어 답과 어긋났다 → 그 걸음만 뺀다.
--      나머지(내 판만 · 다른 칸은 못 바꿈 · 시각은 서버가, 표-9·표-10)는 0084 그대로 옮겨 적는다(두 벌이 되지 않게 통째로)
--
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다.

-- ══ ①
drop policy if exists makeup_own on v2.makeup;
create policy makeup_own on v2.makeup for select to authenticated
  using (student_id in (select v2.my_students()));
comment on policy makeup_own on v2.makeup is '아이·학부모가 제 결석 예정·보강을 읽는다(07 「앞으로」 · 09). 쓰는 것은 학원 사람뿐(02c)';

-- ══ ②
create or replace function v2.last_area_memos(p_student uuid)
returns table (sheet_date date, area text, memo text)
language sql stable as $$
  with last as (
    select s.id, s.date from v2.day_sheet s
     where s.student_id = p_student and s.closed_at is not null
       and exists (select 1 from v2.day_area_memo m where m.sheet_id = s.id and coalesce(m.memo, '') <> '')
     order by s.date desc limit 1)
  select last.date, m.area::text, m.memo
    from last join v2.day_area_memo m on m.sheet_id = last.id
   where coalesce(m.memo, '') <> ''
   order by m.area
$$;
comment on function v2.last_area_memos(uuid) is '아이·학부모 화면의 「선생님 한 마디」 — 메모가 있는 마지막 마감 판의 영역 메모. 접근 규칙(own_read_dam · own_sheet)을 그대로 지난다';
grant execute on function v2.last_area_memos(uuid) to authenticated, service_role;

-- ══ ③ 문지기 — 0084 의 몸통 그대로, 「못 내린다」 걸음만 뺀다
create or replace function v2.day_item_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare 누구 uuid := auth.uid();
begin
  -- 로그인한 사람이 없으면 지나간다 — 검사·마이그레이션·크론은 jwt 없이 postgres 로 돈다(0084)
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;

  -- 남의 판은 못 건드린다 — 학부모도 여기서 걸린다(0084 ㉑ · 원장님 「절대안돼」)
  if not v2.sheet_mine(new.sheet_id) then
    raise exception '내 판이 아니면 못 건드린다 (day_item) — 학부모는 「다 했어요」를 못 누른다' using errcode = '42501';
  end if;

  -- 아이는 said_done_at 하나만 바꿀 수 있다(표-9). updated_at 은 touch 트리거가 미는 값이라 뺀다
  if (to_jsonb(new) - 'said_done_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'said_done_at' - 'updated_at') then
    raise exception '아이는 「다 했어요」 말고는 못 바꾼다 (day_item)' using errcode = '42501';
  end if;

  -- 무르기(said_done_at → null)는 **된다** — 원장님 답 ⑧. 시각은 서버가 정한다(표-10)
  if new.said_done_at is not null and old.said_done_at is null then
    new.said_done_at := now();
  elsif new.said_done_at is not null and old.said_done_at is not null then
    new.said_done_at := old.said_done_at;      -- 이미 누른 것은 시각이 안 바뀐다
  end if;
  return new;
end $$;
comment on function v2.day_item_child_guard() is
  '아이의 「다 했어요」 문지기(표-9·표-10) — 내 판만 · said_done_at 말고는 못 바꿈 · 시각은 서버가 · **무르기는 된다**(원장님 답 ⑧, 0115). 학원 사람·검사는 지나간다';
