-- 0086 — 「할 것」과 「총평」을 가른다 (0084 이 한꺼번에 헐거워진 자리를 되좁힌다)
--
-- ⚠️⚠️ 0084 가 v2.sheet_visible() 의 **몸통**을 갈아 끼웠는데, 그 함수를 쓰는 규칙이
--   **일곱**이었다 (실측 2026-09-03): day_item · day_area_memo · late_stay · quiz ·
--   file · file_link(둘). 그래서 「아이가 오늘 할 것을 등원 뒤 바로 본다」와 함께
--   **영역 메모(그날 총평)까지 마감 전에 열렸다.** check-areamemo 가 그 자리에서 빨개졌다.
--
-- ── 가르는 잣대 (원장님 말씀에서 그대로 나온다)
--   「출석하면 바로」는 **아이가 해야 할 것** 이야기다.
--   영역 메모는 단어·문법·독해·영작 **하루 총평**이고 **아이에게 그대로 나가는 한 줄**이다 —
--   원장님이 수업 중에 고쳐 쓰시는 글이라, 쓰다 만 것이 아이에게 보이면 안 된다.
--   계획 ⑮-3 이 같은 말을 한다: **마감 전에는 「아직 정리 중이에요」.**
--
--   · 아이가 **할 것** (day_item · 낸 파일)      → 등원 뒤 바로 (0084 그대로)
--   · 원장님이 아이·학부모에게 **하는 말** (영역 메모) → **마감 뒤** (여기서 되좁힌다)
--
-- ⚠️ late_stay(늦귀가)와 quiz(단어시험)는 **일부러 안 되좁힌다** — 둘 다 「오늘 네가 할 것」이다.
--    아이가 남아야 하는 것도, 볼 시험도 마감 전에 알아야 한다. 이 판단을 여기 적어 둔다.
-- ⚠️ 몇 번을 돌려도 같은 결과여야 한다.

-- ── 마감한 판만 보는 옛 잣대 — **이름을 따로 준다.** 0084 의 느슨한 것과 헷갈리지 않게
create or replace function v2.sheet_closed_visible(p_sheet uuid) returns boolean
  language sql stable security definer set search_path = v2, public as $fn$
  select exists (select 1 from v2.day_sheet s
                  where s.id = p_sheet
                    and s.student_id in (select v2.my_students())
                    and s.closed_at is not null)          -- ⭐ 마감해야 보인다
$fn$;

comment on function v2.sheet_closed_visible(uuid) is
  '**마감한 판만** 보는 잣대 — 아이·학부모 둘 다 같다. 「원장님이 하는 말」이 붙은 표가 이것을 쓴다. '
  '⚠️ v2.sheet_visible() 은 0084 뒤로 **아이에게는 마감 전에도 열린다** — 「아이가 할 것」이 그것을 쓴다. '
  '둘을 바꿔 쓰면 쓰다 만 총평이 아이에게 나간다(0086)';

-- ── 영역 메모는 **마감 뒤**로 되좁힌다
drop policy if exists own_read_dam on v2.day_area_memo;
create policy own_read_dam on v2.day_area_memo
  for select to authenticated
  using (v2.sheet_closed_visible(sheet_id));

comment on policy own_read_dam on v2.day_area_memo is
  '아이·학부모는 **마감한 판의** 영역 메모만 본다. 영역 메모는 그날 총평이고 '
  '원장님이 수업 중에 고쳐 쓰신다 — 쓰다 만 것이 아이에게 보이면 안 된다(계획 ⑮-3 · 0086)';

-- ── 0079 머리주석이 이제 사실과 다르다는 것을 표 쪽에 적어 둔다 (원칙-1 — 같은 사실이 두 곳에 있으면 안 된다)
comment on table v2.day_area_memo is
  '영역(단어·문법·독해·영작)마다 하루 한 줄 총평. 아이에게 그대로 나간다. '
  '⚠️ **마감해야 아이·학부모에게 보인다**(0086). 「아이는 등원하면 바로 본다」(0084)는 '
  '**할 것**(day_item) 이야기이고 이 표에는 안 걸린다';
