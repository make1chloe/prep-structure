-- 0037: 등원 절차 · 단어시험 시점
--
-- ── 등원 절차 ───────────────────────────────────────────────
-- 아이가 들어오면 순서가 정해져 있다.
--   ① 핸드폰 제출  ② 출석 체크  ③ 숙제 제출   그다음에 학습 시작
-- 셋 다 그날 한 번이라 daily_reports 에 붙인다.
--
-- ── 단어시험 시점 ───────────────────────────────────────────
-- 수업 시작하자마자 보는 학생이 있고, 다 끝내고 보는 학생이 있다.
-- 학생마다 기본값을 정해두고, 그날 사정이 있으면 그날만 바꾼다.
--   students.word_when       그 학생의 평소 (start | end)
--   daily_reports.word_when  오늘만 다르게 (비면 평소대로)

alter table public.daily_reports
  add column if not exists phone_in    boolean not null default false,
  add column if not exists homework_in boolean not null default false,
  add column if not exists word_when   text;

comment on column public.daily_reports.phone_in is '핸드폰을 냈다';
comment on column public.daily_reports.homework_in is '숙제를 냈다';
comment on column public.daily_reports.word_when is
  '오늘만 다르게 (start=수업 시작 / end=다 끝내고). 비어 있으면 학생 기본값을 따른다';

alter table public.students
  add column if not exists word_when text not null default 'start';

comment on column public.students.word_when is
  '단어시험을 언제 보는가 — start(수업 시작) | end(다 끝내고)';

-- 어떤 학습 항목이 단어시험인지 (이름을 코드에 박지 않으려고 표시해 둔다)
alter table public.homework_items
  add column if not exists word_test boolean not null default false;

update public.homework_items
   set word_test = true
 where word_test = false
   and name like '%단어%'
   and (name like '%시험%' or name like '%테스트%');
