-- 0082 — 아이의 「다 했어요」와 원장님의 ○ 을 **다른 칸으로 가른다** (원칙-1 · 표-9)
--
-- 왜: `v2.day_item.status` 한 칸이 **두 사실**을 겸하고 있었다 —
--     원장님의 검사 결과(○△✕)와 아이의 「다 했어요」가 **같은 값 'done'** 이다.
--     `child_done` 정책(0016)이 아이에게 그 칸을 열어 두어서,
--     **마감을 처음 켜는 날** 아이가 누르면 그 줄이 원장님 검사 목록에서 조용히 사라진다.
--     정책이 'done' 만 허용해 **아이 손으로 되돌릴 수도 없다.**
--     실제로 재현했다: 마감한 판에서 아이 계정으로 자기 숙제에 ○ 이 그대로 들어갔다.
--     (진도까지는 안 간다 — 그것도 확인했다. 사라지는 것은 **검사 목록**이다)
--
-- ⚠️⚠️ **칸 권한(grant update (칸))으로는 못 가른다.** 원장님도 화면에서 `authenticated` 로 돈다
--     (`app/*/db.js` 가 `set role authenticated` 를 건다). 칸을 쪼개 주면 **원장님이 못 쓴다.**
-- ⚠️ RLS 의 `with check` 는 **옛 값을 못 본다** — 「그 칸만 바뀌었나」를 물을 수가 없다.
-- → 규칙 표-9 그대로 **「그 한 칸만 빼고 비교해 다르면 거절」**을 트리거로 짠다.
--   허용 목록이 아니라 **비교**다 — 칸이 늘어도 안 빠뜨린다.
--
-- ⚠️ 표-10 — 「했다」를 남기는 자리는 **서버가 시각을 정한다.** 아이가 보낸 값을 안 믿는다.
--
-- 되돌리기:
--   drop trigger day_item_child_guard on v2.day_item;
--   drop function v2.day_item_child_guard();
--   alter table v2.day_item drop column said_done_at;
--   (그리고 child_done 정책을 0016 의 옛 모양으로 되돌린다)

alter table v2.day_item add column if not exists said_done_at timestamptz;

comment on column v2.day_item.said_done_at is
  '**아이가 「다 했어요」를 누른 때.** ⚠️ 원장님의 검사 결과(status)와 **다른 사실**이다 — 이 칸이 차 있어도 검사는 아직 안 한 것이다. 서버가 시각을 정한다(아이가 보낸 값을 안 믿는다). ⚠️ 한 번 누르면 아이 손으로는 못 내린다(옛 정책 그대로)';

create index if not exists day_item_said_idx on v2.day_item (sheet_id) where said_done_at is not null;

-- ── 「그 한 칸만 빼고 비교해 다르면 거절」 (표-9)
create or replace function v2.day_item_child_guard() returns trigger
language plpgsql security definer set search_path = v2, public as $$
declare 누구 uuid := auth.uid();
begin
  -- ⚠️⚠️ **로그인한 사람이 없으면 지나간다.** 검사·마이그레이션·크론은 jwt 없이 `postgres` 로 돈다.
  --    `postgres` 는 접근 규칙(RLS)을 지나치지만 **트리거는 탄다** — 여기서 안 열어 주면
  --    day_item 을 고치는 **검사와 마이그레이션이 통째로 죽는다**(실제로 죽는 것을 보고 고쳤다).
  --    아이를 막는 것은 「로그인한 아이」이지 서버 자신이 아니다.
  if 누구 is null then return new; end if;
  if v2.is_staff() then return new; end if;

  -- ⚠️ 아이는 **said_done_at 하나만** 바꿀 수 있다. 나머지가 한 칸이라도 다르면 거절한다.
  --    `updated_at` 은 touch 트리거가 미는 값이라 뺀다.
  if (to_jsonb(new) - 'said_done_at' - 'updated_at')
     is distinct from (to_jsonb(old) - 'said_done_at' - 'updated_at') then
    raise exception '아이는 「다 했어요」 말고는 못 바꾼다 (day_item)' using errcode = '42501';
  end if;

  -- ⚠️ **한 번 누르면 못 내린다** — 옛 정책(`status='done'` 만 허용)과 같은 결이다.
  --    되돌리는 것은 원장님이 한다. (되돌릴 수 있게 할지는 원장님께 여쭀다)
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
-- ⚠️ 이름을 `a_` 로 시작하지 않는다 — `day_item_touch` 보다 **뒤에** 돌아야
--    touch 가 민 `updated_at` 이 이미 반영된 상태로 비교한다(그 칸은 어차피 뺀다)
create trigger day_item_child_guard before update on v2.day_item
  for each row execute function v2.day_item_child_guard();

-- ── 정책: 줄 범위만 지키고, **무엇을 바꿨나는 트리거가 본다**
drop policy if exists child_done on v2.day_item;
-- ⚠️ **두 번 돌려도 같아야 한다** — 새 이름도 먼저 지운다(전환 전날 재적재가 이것을 다시 돈다)
drop policy if exists child_said on v2.day_item;
create policy child_said on v2.day_item for update to authenticated
  using (v2.sheet_visible(sheet_id) and slot in ('home','next'))
  with check (v2.sheet_visible(sheet_id) and slot in ('home','next'));
