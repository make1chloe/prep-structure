-- 단원을 화면에 뭐라고 부르나 — **한 곳에서** 정한다
-- ⚠️ 계획 절 ㉘ 3번: 「소단원이 비면 대단원 이름을 쓰게 한다」.
--    실측 31권이 소단원이 통째로 비어 있다(첫구조독해처럼 대단원 하나가 지문 하나인 교재).
--    화면마다 따로 판단하게 두면 어디선가 「Unit 03 › (빈칸)」이 뜬다.
-- ⚠️ 계획 절 ㉘ 2번: 소단원 이름이 여러 대단원에 되풀이되는 교재가 12권이다
--    (올림포스 독해기본2 는 82줄에 이름이 6종 · "Gateway" 가 18번).
--    → **언제나 「대단원 › 소단원」을 붙여 쓴다.** 소단원만 띄우면 어느 줄인지 모른다.
create or replace function v2.unit_label(p_unit uuid, p_full boolean default true)
returns text language sql stable as $$
  select case
    when u.sub is null or u.sub = '' then
      u.chapter || case when u.activity is null or u.activity = '' then ''
                        else ' · ' || u.activity end
    when p_full then u.chapter || ' › ' || u.sub
                     || case when u.is_workbook then ' · 워크북' else '' end
    else u.sub || case when u.is_workbook then ' · 워크북' else '' end
  end
  from v2.units u where u.id = p_unit
$$;
comment on function v2.unit_label is
  '⚠️ 소단원이 비면 대단원 이름을 쓴다. 그리고 **언제나 「대단원 › 소단원」** — '
  '소단원 이름이 여러 대단원에 되풀이되는 교재가 12권이라 소단원만 띄우면 어느 줄인지 모른다';
grant execute on function v2.unit_label(uuid, boolean) to authenticated, service_role;

-- 아직 못 고친 것 — 원장님 확인이 필요하다
insert into v2.hold_decision(why_like, decided) values
 ('%그래머인사이드%',
  '⚠️ 아직 안 정함 — 원장님이 고치신 엑셀과 v2 의 대단원이 26 중 25 가 안 맞아 손대지 않았다. 왜 다른지 확인 안 됨')
on conflict (why_like) do update set decided = excluded.decided;
