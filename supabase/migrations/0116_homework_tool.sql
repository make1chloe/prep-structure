-- 0116: 학습 항목의 툴 — 아이가 「무엇으로」 하는지
--
-- 원장님 (2026-08-11) — 「툴이 교재인지 클래스카드인지, 노트인지 표시해줄 수
-- 있지. 물론 아이에게 말이야」
--
-- 영역(단어·독해·문법)은 분류 칸이 말해주고, 어느 책 몇 쪽인지는 단원이
-- 말해준다. 그런데 **무엇을 펴야 하는지** — 교재인지, 클래스카드 앱인지,
-- 노트인지 — 는 어디에도 없어서 아이가 매번 물어봤다.
--
-- 항목에 한 번만 적어두면 그 숙제가 나갈 때마다 아이 화면에 따라붙는다
-- (같은 값을 두 번 입력하지 않는다 — 원칙 1).

alter table public.homework_items
  add column if not exists tool text;

comment on column public.homework_items.tool is
  '아이가 무엇으로 하는 숙제인가 — 교재 · 클래스카드 · 노트 · 프린트 …';

-- 들어갔는지 화면이 물어보는 표식 (설정 → Supabase 의 「지금 DB 상태」)
create or replace function public.homework_tool_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.homework_tool_on() to authenticated;
