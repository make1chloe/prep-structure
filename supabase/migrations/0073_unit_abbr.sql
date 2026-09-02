-- 단원 이름을 **약자**로 (원장님 2026-09-02: 「P2-U1 약자를 쓰는 게 어때」 · 「정확한 게 낫고」)
--
-- ⚠️ 앞(0068)에서는 **이름이 겹칠 때만** 중단원을 끼웠다. 그런데 이름이 길어졌다 —
--    「PART 2 밑줄 어법 › UNIT 01 동사 밑줄 › Points to Remember」
--    원장님: **약자면 늘 붙여도 된다.** 짧으면서 어느 UNIT 인지 늘 보인다.
--
--   전:  PART 2 밑줄 어법 › UNIT 01 동사 밑줄 › Points to Remember
--   후:  P2-U1 Points to Remember
--
-- ⚠️ 약자를 못 만드는 이름(숫자가 없는 것 — 「GRAMMAR BASICS」·「단원 마무리 …」)은
--    **지어내지 않고 원래 글자를 쓴다**(대전제 0).
create or replace function v2.abbr(p text)
returns text language sql immutable as $$
  -- 「PART 1 …」→P1 · 「CHAPTER 12 …」→C12 · 「Unit 01 …」→U1 · 「Ch1-…」→C1
  select case
    when p is null or btrim(p) = '' then null
    when p ~ '^[A-Za-z]+\s*0*[0-9]+' then
      upper(substring(p from '^([A-Za-z])')) || (regexp_match(p, '^[A-Za-z]+\s*0*([0-9]+)'))[1]
    else btrim(p)          -- ⚠️ 숫자가 없으면 줄이지 않는다 — 지어내면 어느 단원인지 더 모른다
  end
$$;
comment on function v2.abbr is
  '대단원·중단원을 약자로 (PART 2 → P2 · UNIT 01 → U1). '
  '⚠️ 숫자가 없는 이름은 안 줄인다 — 줄이면 어느 단원인지 더 모른다';

create or replace function v2.unit_label(p_unit uuid, p_full boolean default true)
returns text language sql stable as $$
  with u as (select * from v2.units where id = p_unit),
       a as (select nullif(concat_ws('-', v2.abbr(u.chapter), v2.abbr(u.mid)), '') tag from u)
  select case
    -- 소단원이 없는 교재(첫구조독해처럼 대단원 하나가 지문 하나) — 대단원 이름을 쓴다
    when u.sub is null or u.sub = '' then
      coalesce(a.tag, u.chapter) || case when coalesce(u.activity,'') = '' then ''
                                         else ' · ' || u.activity end
    when p_full then coalesce(a.tag || ' ', '') || u.sub
                     || case when u.is_workbook then ' · 워크북' else '' end
    else u.sub || case when u.is_workbook then ' · 워크북' else '' end
  end
  from u, a
$$;
comment on function v2.unit_label is
  '화면에 뭐라고 부르나 — 「P2-C6 소단원」. 약자라 짧아서 **늘 붙인다**(원장님 2026-09-02). '
  '⚠️ 소단원이 비면 대단원 이름을 쓴다';
