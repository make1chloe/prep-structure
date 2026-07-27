-- 0035: 학습 루틴 — 진도를 따라 순서대로
--
-- 문법 교재는 단원마다 하는 일이 정해져 있다.
--
--   1  등원: 단원 설명 정독 · 문답노트     숙제: 구두테스트(녹음) · 본교재 문제풀기
--   2  등원: 숙제채점 · 구두테스트(직접)   숙제: 워크북 풀기
--   3  등원: 숙제채점 · 단원평가           숙제: —
--
-- 한 줄이 **한 수업 회차**다. 매번 손으로 고르지 않고, 이 순서를 따라간다.
-- 학생마다 지금 몇 번째인지만 기억하면 된다.
--
-- 같은 '구두테스트' 라도 등원이면 직접 보고 숙제면 녹음이라, **다른 학습 항목**으로
-- 넣는다. 그래야 학생 화면에 할 일이 정확히 뜨고 시간도 따로 쌓인다.

create table if not exists public.routine_steps (
  id            uuid primary key default gen_random_uuid(),
  textbook_id   uuid not null references public.textbooks(id) on delete cascade,
  sort          int  not null default 0,
  label         text,                                  -- "설명 정독 · 문답노트" (알아보기 쉽게)
  inclass_items uuid[] not null default '{}',          -- 그날 학원에서 할 것
  home_items    uuid[] not null default '{}',          -- 그날 내주는 숙제
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists routine_steps_book_idx on public.routine_steps (textbook_id, sort);

alter table public.routine_steps enable row level security;
drop policy if exists staff_all on public.routine_steps;
create policy staff_all on public.routine_steps
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 이 학생이 이 교재에서 **다음에 할 단계** (0부터. 끝까지 가면 다시 0)
alter table public.student_textbooks
  add column if not exists routine_step int not null default 0;


-- ------------------------------------------------------------
-- 루틴이 없는 학생·과목을 위한 **기본값**
--   매번 같은 것을 고르는 수고를 덜어준다. 루틴이 있으면 루틴이 먼저다.
-- ------------------------------------------------------------
alter table public.students
  add column if not exists default_inclass uuid[] not null default '{}',
  add column if not exists default_home    uuid[] not null default '{}';

comment on column public.students.default_inclass is
  '등원 학습 기본값. 오늘 수업에서 [기본값] 을 누르면 이게 깔린다';
