-- 0051: 단원 아래 문제번호
--
-- 내신 시험범위는 단원 단위가 아니라 **문제 단위**인 경우가 많다.
--   옥련여고 기말 = 2406H1 모의고사 29·30·33·34·36·37번
-- 모의고사는 단원 자체가 없어서 중단원 아래에 바로 문제가 온다.
--
-- 새 구조를 만들지 않는다. 교재 단원은 부모-자식으로 이어진 나무라 깊이
-- 제한이 없다. **문제도 그냥 한 겹 더 내려간 단원**으로 넣으면 된다.
-- 다만 화면에서 "이건 문제다" 를 알아야 하므로 번호만 따로 담아둔다.

alter table public.textbook_units
  add column if not exists question_no text;

comment on column public.textbook_units.question_no is
  '문제번호 (29, 30-1 …). 비면 보통 단원이다';

create index if not exists textbook_units_question_idx
  on public.textbook_units (textbook_id) where question_no is not null;
