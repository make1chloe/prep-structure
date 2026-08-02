-- 0070: 단어가 몇 개인가
--
-- 단어시험을 내려면 **몇 개 중에 몇 개인지**를 알아야 한다. 지금은 그걸
-- 원장님 머릿속과 교재를 번갈아 보며 세고 있다.
--
--   교재  소단원 하나에 단어가 몇 개인가 (day 하나에 30개 …)
--   학생  한 번에 몇 개씩 보는가, 몇 개까지 틀려도 통과인가, 언제 보는가
--
-- 교재마다 규칙이 다르다. 대부분은 소단원마다 같은 개수지만, 어떤 교재는
-- 단원마다 다르다. **다르면 다르다고 적어두고** 단원마다 따로 센다.

-- ---------- 교재 ----------
alter table public.textbooks
  add column if not exists words_irregular boolean not null default false;

comment on column public.textbooks.word_range is
  '소단원 하나당 단어 개수 (규칙적일 때). 불규칙이면 단원마다 따로 적는다';
comment on column public.textbooks.words_irregular is
  '소단원마다 단어 개수가 다르다. 켜면 단원별 개수를 쓰고, 교재 기본값은 참고만 한다';

-- ---------- 단원 ----------
alter table public.textbook_units
  add column if not exists word_count int;

comment on column public.textbook_units.word_count is
  '이 소단원의 단어 개수. 비어 있으면 교재 기본값(word_range)을 쓴다';


-- ---------- 학생 ----------
-- 단어시험은 학생마다 다르게 본다. 지금은 방식(0025)만 있고 **개수와 통과선**이 없다.
--
--   word_test_count  한 번에 몇 개를 보는가 (비면 그날 진도 단원의 단어 수)
--   word_cut_pct     몇 % 맞으면 통과인가 (비면 학원 기본값 — 10% 틀림까지 허용)
--
-- 통과선은 **맞은 비율**로 적는다. 어떤 줄은 높아야 좋고 어떤 줄은 낮아야 좋으면
-- 읽을 때마다 뒤집어 생각해야 한다 (0032 와 같은 이유).
alter table public.students
  add column if not exists word_test_count int,
  add column if not exists word_cut_pct    int;

comment on column public.students.word_test_count is
  '단어시험 한 번에 보는 개수. 비면 그날 범위대로';
comment on column public.students.word_cut_pct is
  '통과선 (맞은 %). 비면 학원 기본값 90 — 10개 중 1개까지 틀려도 통과';
