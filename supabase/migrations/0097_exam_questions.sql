-- 0097: 시험을 **문항까지** 남긴다
--
-- 원장님 (2026-08-06)
--   「내신성적은 아예 여태 정리를 못했어. 통합설계해줘」
--   「학생별 오답 기록해서 이렇게 리포트 만들고 싶어」
--   (앞서) 「내신은 아예 기록을 안 했네. 학생별 틀린 문제를 기록해서 써야 해」
--
-- 지금은 시험 한 번에 **총점 한 줄**만 남는다. 92점이라는 것은 알아도
-- **무엇을 틀렸는지는 안 남는다.** 그래서 「관계사가 약하다」 를 원장님
-- 기억으로만 아시고, 아이가 바뀌면 처음부터 다시 보셔야 한다.
--
-- 노션 자료를 보니 모의고사 오답분석DB 에는 이미 **문항별로** 적고 계셨다
-- (틀린 번호 + 왜 틀렸는지). 그것이 제일 쓸모 있는 자료인데 성적표와 따로
-- 놀고 있었다. 합친다.
--
-- ── 붙이는 곳 ────────────────────────────────────────────
--
-- 새 표를 다섯 개 만들지 않는다. **이미 있는 둘에 하나씩 붙인다.**
--
--   exam_periods (시험 회차)  →  exam_questions  그 시험지의 문항 구성
--   scores       (학생 응시)  →  score_items     그 학생의 문항별 결과
--
-- 시험지 문항표는 **반 전체가 같이 쓴다** — 한 번 적으면 그 시험을 본
-- 아이 전부에게 쓰인다. 학생마다 다시 적으면 열 번을 적게 되고, 하나만
-- 잘못 쳐도 그 아이만 분석이 다르게 나온다 (등급컷에서 이미 겪은 일이다).
--
-- ── 문항표가 없어도 된다 ─────────────────────────────────
--
-- 모의고사 45문항 구성은 **학년·회차와 상관없이 똑같다** (고1·고2·고3 5회분
-- 675문항을 비교했다). 그래서 앱이 표준 문항표를 갖고 있고 (lib/examSpec.js),
-- 모의고사는 문항표를 안 적어도 영역별 정답률이 나온다.
--
-- 반드시 적게 하면 노션에서 옮겨올 11줄이 못 들어온다. **있으면 쓰고
-- 없으면 번호만** 쓴다.
--
-- ── 다만 「거의」 안 바뀐다 ───────────────────────────────
--
-- 원장님 (2026-08-06)
--   「거의 안 바뀌긴 하는데, 18번은 목적 이런 식으로 유형이 정해져 있긴
--    한데 상황에 따라 모의고사 유형은 바뀔 수 있어.
--    기본값을 세팅하되, 수정 가능하게 해줘」
--
-- 그래서 **세 겹**으로 둔다.
--   1. 코드에 박힌 표준표      lib/examSpec.js  — 아무것도 안 하셔도 도는 값
--   2. 학원 기본 문항표        exam_spec_rows   — 한 번 고치면 앞으로 다 바뀜
--   3. 그 회차만의 문항표      exam_questions   — 이번 시험만 다를 때
--
-- 위엣것이 없으면 아래로 내려간다. 3월 학평에서 18번이 「심경」으로 나왔다면
-- 그 회차만 고치고, 아예 출제 체제가 바뀌었으면 기본 문항표를 고친다.
-- 코드를 고치러 오셔야 하는 구조는 결국 안 고쳐진다.

-- ------------------------------------------------------------
-- 1) 시험지의 문항 하나
-- ------------------------------------------------------------
create table if not exists public.exam_questions (
  id       uuid primary key default gen_random_uuid(),
  exam_id  uuid not null references public.exam_periods(id) on delete cascade,
  no       int not null,                    -- 문항 번호

  area     text,                            -- 듣기 · 독해 · 문법 · 어휘 · 서술형
  topic    text,                            -- 분석 영역 (대의파악 · 빈칸추론 …)
  detail   text,                            -- 세부 유형 (글의 제목 · 문장 삽입 …)

  answer   text,                            -- 정답 (①~⑤ 또는 글자)
  points   numeric,                         -- 배점

  -- **여기 둘이 곧 출제분석이다.** 내신은 「어디서 나왔나」 가 다음 시험
  -- 대비를 정한다 — 교과서에서 60% 나오는 학교와 외부지문이 반인 학교는
  -- 시켜야 할 공부가 다르다.
  unit     text,                            -- 교과서 5과 · Lesson 3 · 부교재 p.40
  source   text,                            -- 교과서 | 부교재 | 모의고사 변형 | 외부지문 | 기타

  note     text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  unique (exam_id, no)                      -- 한 시험지에 같은 번호는 하나
);
create index if not exists exam_questions_exam_idx on public.exam_questions (exam_id, no);

comment on table  public.exam_questions is '시험지의 문항 구성 — 반 전체가 같이 쓴다';
comment on column public.exam_questions.unit   is '내신 출제분석 — 교과서 몇 과에서 나왔나';
comment on column public.exam_questions.source is '내신 출제분석 — 교과서/부교재/모의고사 변형/외부지문';

-- ------------------------------------------------------------
-- 1-2) **학원 기본 문항표** — 회차마다 안 적으셔도 되게
--
--      모의고사는 45문항 구성이 거의 안 바뀐다. 그래서 한 벌만 두고
--      전 회차가 같이 쓴다. 여기가 비어 있으면 코드에 박힌 표준표를 쓴다
--      (lib/examSpec.js) — **아무것도 안 하셔도 리포트가 나온다.**
--
--      kind 를 둔 것은 내신에도 학교마다 늘 같은 틀이 있기 때문이다
--      (신송중은 늘 서술형 5문항). 지금은 mock 만 쓴다.
-- ------------------------------------------------------------
create table if not exists public.exam_spec_rows (
  id     uuid primary key default gen_random_uuid(),
  kind   text not null default 'mock',      -- mock | school | unit
  no     int  not null,
  area   text,
  topic  text,
  detail text,
  points numeric,
  updated_at timestamptz not null default now(),
  unique (kind, no)
);
create index if not exists exam_spec_rows_kind_idx on public.exam_spec_rows (kind, no);

comment on table public.exam_spec_rows is
  '학원 기본 문항표 — 비어 있으면 코드의 표준표를 쓴다. 회차별로 다르면 exam_questions 가 이긴다';

alter table public.exam_spec_rows enable row level security;

drop policy if exists staff_all on public.exam_spec_rows;
create policy staff_all on public.exam_spec_rows
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생도 읽는다 — 자기 오답이 무슨 유형이었는지 못 보면 번호만 남는다
drop policy if exists read_spec on public.exam_spec_rows;
create policy read_spec on public.exam_spec_rows
  for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2) 그 학생의 그 문항
--
--    **틀린 것만 넣어도 된다.** 45줄을 다 넣게 하면 아무도 안 쓴다.
--    「14,21,24,32」 만 적으면 나머지는 맞은 것으로 본다 —
--    노션에서도 그렇게 적고 계셨다 (「틀린 문제 번호」 칸).
-- ------------------------------------------------------------
create table if not exists public.score_items (
  id       uuid primary key default gen_random_uuid(),
  score_id uuid not null references public.scores(id) on delete cascade,
  no       int not null,

  wrong    boolean not null default true,   -- 기본이 「틀림」 이다 (틀린 것만 넣으므로)
  picked   text,                            -- 아이가 고른 답
  reason   text,                            -- 왜 틀렸나 (아래 목록)
  note     text,

  created_at timestamptz not null default now(),
  unique (score_id, no)
);
create index if not exists score_items_score_idx on public.score_items (score_id, no);

comment on table  public.score_items is '학생의 문항별 결과 — 틀린 것만 넣어도 된다';
comment on column public.score_items.reason is
  '단어를 몰랐어요 | 해석을 못했어요 | 어법을 몰랐어요 | 실수했어요 | 발음이 들리지 않았어요 | 다른 문제를 푸느라 놓쳤어요 | 기타';

-- ------------------------------------------------------------
-- 3) 성적이 **어느 회차인지 확실히 안다**
--
--    지금은 날짜와 학교로 **추측**하고 있다 (lib/scores.js findExam).
--    등급컷은 추측해도 크게 안 틀리지만, 문항별 분석을 엉뚱한 시험지로
--    하면 「3번은 어법」 이 통째로 어긋난다. 그래서 못 박을 자리를 만든다.
--    비어 있으면 지금처럼 날짜로 찾는다.
-- ------------------------------------------------------------
alter table public.scores add column if not exists exam_id uuid
  references public.exam_periods(id) on delete set null;
create index if not exists scores_exam_idx on public.scores (exam_id);

-- 아이가 스스로 적은 것 (오답 적기 화면). 노션 폼이 하던 일이다.
alter table public.scores add column if not exists self_note text;   -- 잘한 점 · 부족한 점 · 하고 싶은 말
alter table public.scores add column if not exists filled_at timestamptz;

comment on column public.scores.exam_id   is '어느 회차인가 — 비어 있으면 날짜로 찾는다';
comment on column public.scores.self_note is '아이가 적은 것 — 잘한 점 · 부족했던 점 · 하고 싶은 말';

-- ------------------------------------------------------------
-- 4) 누가 보고 누가 쓰나
--
--    성적(scores)의 규칙을 그대로 따른다 — 선생님은 다, 학생·학부모는
--    **자기 것만.** 문항 결과는 성적보다 더 개인적인 자료다
--    (무엇을 몰랐는지가 그대로 적혀 있다).
--
--    문항표(exam_questions)는 시험지 정보라 학생도 읽는다 — 자기 오답이
--    무슨 유형이었는지 못 보면 오답 화면이 번호만 남는다. 쓰기는 선생님만.
-- ------------------------------------------------------------
alter table public.exam_questions enable row level security;
alter table public.score_items    enable row level security;

drop policy if exists staff_all on public.exam_questions;
create policy staff_all on public.exam_questions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists read_questions on public.exam_questions;
create policy read_questions on public.exam_questions
  for select to authenticated
  using (true);

drop policy if exists staff_all on public.score_items;
create policy staff_all on public.score_items
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 내 것(또는 우리 아이 것)만 읽는다 — my_student_ids() 가 학생 본인과
-- 학부모를 함께 처리한다 (0079)
drop policy if exists mine_read on public.score_items;
create policy mine_read on public.score_items
  for select to authenticated
  using (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  );

-- 아이가 **자기 오답만** 적는다. 남의 것에는 못 쓴다.
drop policy if exists mine_write on public.score_items;
create policy mine_write on public.score_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  );

drop policy if exists mine_update on public.score_items;
create policy mine_update on public.score_items
  for update to authenticated
  using (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  )
  with check (
    exists (
      select 1 from public.scores s
       where s.id = score_items.score_id
         and s.student_id in (select public.my_student_ids())
    )
  );

-- ------------------------------------------------------------
-- 5) 이 파일이 실행됐는지 화면이 알 수 있게 (설정 → DB 상태)
-- ------------------------------------------------------------
create or replace function public.exam_questions_on()
returns boolean language sql immutable as $$ select true $$;
