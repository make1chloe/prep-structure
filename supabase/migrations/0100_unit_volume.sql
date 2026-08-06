-- 0100: 단원의 **실제 내용과 분량**
--
-- 원장님 (2026-08-06)
--   「주로 쓰는 교재들을 올려볼게. 단원 엑셀을 어떻게 구성하는 게 좋을지
--    개선해줘. 나는 단원의 실제 내용과 분량을 오늘 수업에서 확인하고
--    숙제를 주고 싶은 거야」
--
-- ── 교재 세 권을 열어보고 알게 된 것 ─────────────────────
--
-- 「분량」 을 말하는 방식이 교재마다 다르다.
--
--   중2 문법 워크북 (Unit 01~67)   Unit 02 = **딱 한 쪽**인데 문제가 25개다
--   수능 어법 교재                  Testing Point 01 = pp.014~017 (네 쪽)
--   교과서 워크북 (동아 이병민)      Lesson 5 가주어 it = Practice 4문항
--
-- 지금 표에는 **페이지**와 **단어 수**만 있다 (page_start/end, word_count).
-- 그래서 중2 워크북은 어느 단원이든 「1쪽」 이라 분량을 알 수가 없다 —
-- 25문항짜리와 8문항짜리가 화면에 똑같이 보인다.
--
-- **문항 수가 빠져 있었다.** 문법 교재에서 숙제 분량을 정하는 것은 쪽수가
-- 아니라 문항 수다.
--
-- ── 그리고 「무엇을 하는 단원인지」 ───────────────────────
--
-- 단원명이 「Unit 02」 이면 화면에서 아무것도 알 수 없다. 「1형식 문장과
-- 2형식 문장」 까지는 이름에 들어가지만, 실제로 시키는 것은
-- **「보어 자리에 형용사가 오는지 부사가 오는지 고르기」** 다.
-- 오늘 수업에서 숙제를 정하실 때 보셔야 하는 것이 그것이다.
--
-- 교재를 펴보지 않고도 정하실 수 있어야 한다. 펴봐야 하면 결국 안 쓴다.

alter table public.textbook_units
  add column if not exists question_count int,     -- 이 단원의 문항 수 (25)
  add column if not exists question_range text,    -- 문항 범위 (01-06 · 16-25)
  add column if not exists summary        text,    -- 무엇을 하는 단원인가 (한 줄)
  add column if not exists minutes        int;     -- 예상 소요 시간 (분)

comment on column public.textbook_units.question_count is
  '문항 수 — 문법 교재는 쪽수가 아니라 이것이 분량이다 (중2 워크북은 어느 단원이든 한 쪽이다)';
comment on column public.textbook_units.question_range is
  '문항 범위 — 01-06 처럼. 한 단원을 나눠서 낼 때 쓴다';
comment on column public.textbook_units.summary is
  '무엇을 하는 단원인가 한 줄 — 「보어 자리 형용사/부사 고르기」. 교재를 펴보지 않고 정하시라고';
comment on column public.textbook_units.minutes is
  '예상 소요 시간(분). 비어 있으면 문항 수·쪽수·단어 수로 짐작한다';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.unit_volume_on()
returns boolean language sql immutable as $$ select true $$;
