-- 0084 — 아이 화면의 세 가지를 한꺼번에 바로잡는다
--   ⑱ 학원에서 할 것(slot='class')에 **아이가 「다 했어요」를 못 눌러** 둘째 줄부터 영영 안 열린다
--   ㉑ 「다 했어요」의 DB 문이 **학부모에게도 열려 있다** — 원장님 「절대안돼」
--   ⑮ 아이는 **등원하면 바로** 그날 판을 봐야 하는데 지금은 **마감해야** 보인다
--
-- ─────────────────────────────────────────────────────────────────────
-- ⑱ 왜 — 원장님 답(2026-09-03)이 설계를 정했다
--   내가 「학원 줄의 다음 차례를 원장님 ○ 으로 열까요」라고 여쭈었더니
--   「**o면 숙제인데 한 숙제를 왜 할것으로 열어??**」라고 하셨다.
--   → ○/△/✕ 는 「집에서 해온 숙제를 검사한 결과」이고, 「학원에서 지금 할 것」의
--     차례와 아무 상관이 없다. 두 사실을 섞은 것이 틀린 물음이었다.
--   → 그러므로 **학원 줄의 차례도 아이가 연다.** 아이가 하나 끝내면 다음이 열린다.
--
--   실측(2026-09-03): v2.day_item 의 slot='class' 32줄 · 그중 said_done_at 이 찍힌 줄 **0줄**.
--   0082 의 child_said 정책이 slot in ('home','next') 만 열어 **원리적으로 안 찍힌다.**
--   안 고치면: 원장님이 여덟 줄 다 ○ 을 주셔도 아이 화면은 **0 / 8** 에서 멈추고
--   둘째 줄부터 영영 잠긴다 (마감을 처음 켜는 날 모든 아이 화면에 한꺼번에 뜬다).
--
--   ⚠️ **원장님 ○ 은 그대로 원장님 것이다.** 아이가 늘려 얻는 것은 said_done_at 하나뿐이고,
--      그것은 「검사해 주세요」라는 신호다. 0082 의 문지기가 나머지 칸을 그대로 막는다.
--
-- ─────────────────────────────────────────────────────────────────────
-- ㉑ 왜 — 0082 의 정책이 v2.sheet_visible() 만 보는데, 그 함수는 v2.my_students() 를 쓴다.
--   my_students() 는 「내 아이 union **학부모의 아이**」다 — 즉 **학부모가 든다.**
--   앱 화면 길은 막혀 있지만(app/me/actions.js 가 학생 계정만 통과) **DB 문이 화면보다 헐겁다**(표-9).
--   안 고치면: 학부모가 PostgREST 로 직접 찔러 아이 대신 「다 했어요」를 눌러 줄 수 있다.
--   → my_own_student() 를 쓰는 **쓰기 전용 문**을 따로 둔다.
--
-- ─────────────────────────────────────────────────────────────────────
-- ⑮ 왜 — 원장님께 「아이 화면을 언제부터 켜십니까」라 여쭈었더니 「**출석하면 바로**」라 하셨다.
--   지금 v2.sheet_visible() 은 closed_at is not null 을 요구한다 (마감한 판 **0개**, 실측).
--   ⚠️⚠️ 그런데 **학부모는 마감 뒤여야 한다** — 사고 #7 이 바로 그것이다
--        (「마감 전 내용이 학부모 화면에 그대로」 — 유일하게 밖으로 샌 사고).
--   sheet_visible() 이 아이와 학부모를 **한 함수로 묶고 있었다.** 그것을 가른다.
--
--   ⚠️ **등원 기록(v2.arrival)으로 걸지 않는다.** 실측 v2.arrival **0줄** —
--      걸면 지난 판까지 통째로 안 보여 달력이 비고, 옛 이관 판에는 등원 기록이 원래 없다.
--      대신 「제 판 + 날이 왔다」로 연다. 등원을 찍으면 그 자리에서 판이 서므로
--      (0083 own_arrival_sheet 가 arrival 이 있을 때만 판을 세운다) 결과가 같다.
--      ⚠️ 다만 원장님이 아침에 미리 판을 세우신 날은 아이가 등원 **전에도** 본다 —
--         그것까지 막으려면 등원 기록으로 걸어야 하는데 위 까닭으로 지금은 못 한다. **확인 안 됨.**
--   ⚠️ 앞날 판(실측 2줄)은 안 보인다 — date <= v2.today() (0-6 앞날 상한).
--
--   ⚠️⚠️ **새로 넓어지는 자리 하나** — 아이가 제 day_sheet 줄을 마감 전에도 읽으므로
--        PostgREST 로 직접 찌르면 `staff_note` 도 읽힌다. 이것은 마감한 판에서 **이미 그랬고**
--        (RLS 는 줄 단위라 칸을 못 가린다 · 칸 권한은 원장님도 authenticated 라 못 쓴다 — 0082 머리주석)
--        앱은 lib/close.js 의 STAFF_ONLY 로 칸을 안 싣는다. **이 마이그레이션이 그 구멍을 안 막는다.**
--
-- 되돌리기:
--   drop policy child_said on v2.day_item;
--   create policy child_said on v2.day_item for update to authenticated
--     using (v2.sheet_visible(sheet_id) and slot in ('home','next'))
--     with check (v2.sheet_visible(sheet_id) and slot in ('home','next'));
--   drop policy own_sheet on v2.day_sheet;
--   create policy own_sheet on v2.day_sheet for select to authenticated
--     using (student_id in (select v2.my_students()) and closed_at is not null);
--   create or replace function v2.sheet_visible(p_sheet uuid) ... (0016 의 옛 몸통)
--   drop function v2.sheet_mine(uuid); drop function v2.sheet_visible_to(uuid,timestamptz,date,boolean);
--   (그리고 0082 의 문지기에서 「남의 판」 걸음을 뺀다)

-- ─────────────────────────────────────────────────────────────────────
-- ① 가르는 판단 — **이 함수 한 곳뿐이다** (대전제-4 · 원칙-1)
--    아이와 학부모의 잣대가 다르다는 사실을 여기 말고 어디에도 적지 않는다.
--    부르는 자리 셋(day_sheet 읽기 · sheet_visible · sheet_mine)이 전부 이것을 지난다.
-- ─────────────────────────────────────────────────────────────────────
create or replace function v2.sheet_visible_to(
  p_student uuid, p_closed timestamptz, p_date date, p_only_mine boolean
) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select case
    -- 아이 본인 — **마감 전에도 제 판을 본다** (원장님 「출석하면 바로」)
    when p_student in (select v2.my_own_student())
      then (p_closed is not null or p_date <= v2.today())
    -- 「본인만」을 물었으면 학부모는 여기서 끝이다 (「다 했어요」를 쓰는 문)
    when p_only_mine then false
    -- 학부모 — **마감한 판만** (사고 #7 · 지금 그대로다)
    else p_student in (select v2.my_students()) and p_closed is not null
  end
$$;

comment on function v2.sheet_visible_to(uuid, timestamptz, date, boolean) is
  '⚠️ **아이와 학부모를 가르는 판단 한 벌.** 아이 본인은 마감 전에도 제 판을 본다(원장님 2026-09-03 「출석하면 바로」) · 학부모는 **마감한 판만** 본다(사고 #7 — 유일하게 밖으로 샌 사고). p_only_mine 이 참이면 학부모는 무조건 거짓 — 「다 했어요」처럼 **아이만 쓰는 문**이 그것을 쓴다. 이 잣대를 다른 데 다시 적지 마라(원칙-1)';

grant execute on function v2.sheet_visible_to(uuid, timestamptz, date, boolean) to authenticated;

-- ── 읽는 문 — 아이와 학부모 둘 다 (지금 부르는 자리 8곳이 그대로 이것을 쓴다)
create or replace function v2.sheet_visible(p_sheet uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.day_sheet s
                 where s.id = p_sheet
                   and v2.sheet_visible_to(s.student_id, s.closed_at, s.date, false))
$$;

comment on function v2.sheet_visible(uuid) is
  '이 판을 **읽을** 수 있나 — 아이(마감 전에도)·학부모(마감 뒤만). 가르는 잣대는 v2.sheet_visible_to 한 벌이 갖는다';

-- ── 쓰는 문 — **아이 본인만.** 학부모는 여기로 못 들어온다 (원장님 「절대안돼」)
create or replace function v2.sheet_mine(p_sheet uuid) returns boolean
language sql stable security definer set search_path = v2, public as $$
  select exists (select 1 from v2.day_sheet s
                 where s.id = p_sheet
                   and v2.sheet_visible_to(s.student_id, s.closed_at, s.date, true))
$$;

comment on function v2.sheet_mine(uuid) is
  '⚠️ 이 판이 **로그인한 나 자신의 것**인가 — 학부모는 거짓이다(my_own_student). 「다 했어요」처럼 아이만 쓰는 자리에만 쓴다. 읽기에는 v2.sheet_visible 을 쓴다';

grant execute on function v2.sheet_mine(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- ② 판을 읽는 규칙도 **같은 함수**를 지난다 (전에는 술어가 두 벌이었다 — 원칙-1)
--    ⚠️ 여기서 v2.sheet_visible(id) 를 부르면 그 함수가 다시 day_sheet 를 읽어 되돈다.
--       그래서 **줄의 칸을 그대로 넘기는** sheet_visible_to 를 부른다.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists own_sheet on v2.day_sheet;
create policy own_sheet on v2.day_sheet for select to authenticated
  using (v2.sheet_visible_to(student_id, closed_at, date, false));

-- ─────────────────────────────────────────────────────────────────────
-- ③ 「다 했어요」 — 학원 줄을 열고, 학부모를 막는다
--    ⚠️ 두 번을 돌려도 같아야 한다(규칙 8) — 옛 이름 둘을 먼저 지운다
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists child_done on v2.day_item;
drop policy if exists child_said on v2.day_item;
create policy child_said on v2.day_item for update to authenticated
  -- ⚠️ sheet_visible 이 아니라 **sheet_mine** 이다 — 학부모가 여기 들면 안 된다(㉑)
  using (v2.sheet_mine(sheet_id) and slot in ('home','next','class'))
  with check (v2.sheet_mine(sheet_id) and slot in ('home','next','class'));

-- ─────────────────────────────────────────────────────────────────────
-- ④ 문지기에도 같은 걸음을 더한다 — **정책과 문지기 둘 다**가 막아야 한다
--    까닭: 정책은 언제든 다른 마이그레이션이 다시 쓸 수 있다(0016→0082 가 그랬다).
--    문지기는 表-9 의 「그 한 칸만 빼고 비교」를 이미 들고 있으니 여기 같이 둔다.
--    ⚠️ 0082 의 몸통을 그대로 옮겨 적고 **한 걸음만 더한다** — 두 벌이 되지 않게 통째로 갈아 끼운다.
-- ─────────────────────────────────────────────────────────────────────
create or replace function v2.day_item_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare 누구 uuid := auth.uid();
begin
  -- ⚠️⚠️ **로그인한 사람이 없으면 지나간다.** 검사·마이그레이션·크론은 jwt 없이 `postgres` 로 돈다.
  --    `postgres` 는 접근 규칙(RLS)을 지나치지만 **트리거는 탄다** — 여기서 안 열어 주면
  --    day_item 을 고치는 **검사와 마이그레이션이 통째로 죽는다**(실제로 죽는 것을 보고 고쳤다).
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;

  -- ⚠️ 0084 — **남의 판은 못 건드린다.** 학부모도 여기서 걸린다(㉑ · 원장님 「절대안돼」).
  --    정책이 이미 막지만, 정책 한 줄이 다시 쓰이는 날 이 자리가 마지막 방벽이다.
  if not v2.sheet_mine(new.sheet_id) then
    raise exception '내 판이 아니면 못 건드린다 (day_item) — 학부모는 「다 했어요」를 못 누른다'
      using errcode = '42501';
  end if;

  -- ⚠️ 아이는 **said_done_at 하나만** 바꿀 수 있다. 나머지가 한 칸이라도 다르면 거절한다.
  --    `updated_at` 은 touch 트리거가 미는 값이라 뺀다.
  if (to_jsonb(new) - 'said_done_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'said_done_at' - 'updated_at') then
    raise exception '아이는 「다 했어요」 말고는 못 바꾼다 (day_item)' using errcode = '42501';
  end if;

  -- ⚠️ **한 번 누르면 못 내린다** — 되돌리는 것은 원장님이 한다.
  if old.said_done_at is not null and new.said_done_at is null then
    raise exception '「다 했어요」는 아이 손으로 못 내린다 — 원장님께 말씀드려야 한다' using errcode = '42501';
  end if;

  -- ⚠️ **시각은 서버가 정한다**(표-10). 아이가 보낸 값을 그대로 안 쓴다
  if new.said_done_at is not null and old.said_done_at is null then
    new.said_done_at := now();
  elsif old.said_done_at is not null then
    new.said_done_at := old.said_done_at;      -- 이미 누른 것은 시각이 안 바뀐다
  end if;
  return new;
end $$;

drop trigger if exists day_item_child_guard on v2.day_item;
create trigger day_item_child_guard before update on v2.day_item
  for each row execute function v2.day_item_child_guard();

comment on column v2.day_item.said_done_at is
  '**아이가 「다 했어요」를 누른 때.** ⚠️ 원장님의 검사 결과(status)와 **다른 사실**이다 — 이 칸이 차 있어도 검사는 아직 안 한 것이다. 서버가 시각을 정한다(아이가 보낸 값을 안 믿는다). ⚠️ 한 번 누르면 아이 손으로는 못 내린다. ⚠️ 0084 — **학원 줄(slot=class)에도 찍힌다**: 학원에서 할 것의 차례를 여는 것이 이 칸이다(원장님 「o면 숙제인데 한 숙제를 왜 할것으로 열어??」 — ○ 과는 상관없다). ⚠️ 학부모는 못 찍는다(v2.sheet_mine)';
