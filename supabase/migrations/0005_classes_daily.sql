-- ============================================================
-- 0005_classes_daily
-- 노션(3수업DB / 3수업일정DB / 3데일리리포트DB / 공통진도DB) 이관을 위한 보강
-- ============================================================

-- ---------- 이전 단계에서 밀린 컬럼 (안전하게 재실행 가능) ----------
alter table public.students   add column if not exists gender      text;
alter table public.students   add column if not exists enrolled_on date;
alter table public.students   add column if not exists electives   text;
alter table public.students   add column if not exists login_id    text;
alter table public.students   add column if not exists left_on     date;      -- 퇴원일
alter table public.students   add column if not exists leave_reason text;     -- 퇴원사유
alter table public.students   add column if not exists tuition     text;      -- 수강료 메모

create unique index if not exists students_login_id_key
  on public.students (login_id) where login_id is not null;

alter table public.textbooks      add column if not exists word_range int;
alter table public.textbook_units add column if not exists activity   text;

-- ---------- 반 ----------
alter table public.classes add column if not exists school_level text;  -- 초/중/고

-- 반이 쓰는 교재
create table if not exists public.class_textbooks (
  class_id    uuid not null references public.classes(id) on delete cascade,
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  primary key (class_id, textbook_id)
);

-- 날짜별 수업 회차 (3수업일정DB)
create table if not exists public.class_sessions (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  session_on  date not null,
  start_time  time,
  end_time    time,
  note        text,
  created_at  timestamptz not null default now(),
  unique (class_id, session_on)
);

-- 반 공통 진도 (공통진도DB)
create table if not exists public.class_progress (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes(id) on delete cascade,
  session_on       date,
  textbook_id      uuid references public.textbooks(id) on delete set null,
  textbook_unit_id uuid references public.textbook_units(id) on delete set null,
  page_start       int,
  page_end         int,
  note             text,
  created_at       timestamptz not null default now()
);

-- ---------- 데일리리포트 ----------
-- 숙제/학습 항목 마스터 (완료O·미흡△·미제출X 에 쓰이는 항목들)
--   예: 단어(교재), 단어(온라인), 독해, 워크북, 문법, 영작, 듣기, 오답노트 …
create table if not exists public.homework_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  category   text,                  -- 단어/독해/문법/노트/내신/기타
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

-- 리포트에 붙는 항목별 상태
--   status: done(완료O) / weak(미흡△) / missing(미제출X) / verified(인증숙제)
create table if not exists public.daily_report_items (
  id               uuid primary key default gen_random_uuid(),
  daily_report_id  uuid not null references public.daily_reports(id) on delete cascade,
  homework_item_id uuid not null references public.homework_items(id) on delete cascade,
  status           text not null,
  unique (daily_report_id, homework_item_id, status)
);

-- 데일리리포트 본체 보강
alter table public.daily_reports add column if not exists attendance_kind text; -- 정시출석/지각/조퇴/결석/보강/숙제검사/온라인/지각(학교일정)
alter table public.daily_reports add column if not exists attitude        text; -- Excellent~Area of Concern
alter table public.daily_reports add column if not exists test_result     text; -- 통과/미통과/미등원
alter table public.daily_reports add column if not exists result_detail   text; -- 결과 10종
alter table public.daily_reports add column if not exists word_correct    int;  -- 단어 맞은 개수
alter table public.daily_reports add column if not exists word_total      int;  -- 단어 전체 개수
alter table public.daily_reports add column if not exists word_retry_correct int;
alter table public.daily_reports add column if not exists word_retry_total   int;
alter table public.daily_reports add column if not exists sent_correct    int;  -- 문장 맞은 개수
alter table public.daily_reports add column if not exists sent_total      int;
alter table public.daily_reports add column if not exists sent_retry_correct int;
alter table public.daily_reports add column if not exists sent_retry_total   int;
alter table public.daily_reports add column if not exists own_progress    text; -- 개별진도
alter table public.daily_reports add column if not exists special_progress text; -- 특강진도
alter table public.daily_reports add column if not exists notice          text; -- 공지
alter table public.daily_reports add column if not exists report_written  boolean not null default false;
alter table public.daily_reports add column if not exists report_done     boolean not null default false;
alter table public.daily_reports add column if not exists actual_class    text; -- 실제 수업 수강반

-- ---------- RLS (스태프 전체 접근) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'class_textbooks','class_sessions','class_progress',
    'homework_items','daily_report_items'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- ---------- 숙제 항목 기본값 (노션에서 실제로 쓰던 항목) ----------
insert into public.homework_items (name, category, sort) values
  ('단어(교재)','단어',10), ('단어(온라인)','단어',20), ('단어(누적테스트)','단어',30),
  ('내신단어(온라인)','단어',40),
  ('독해','독해',110), ('워크북','독해',120), ('구문독해','독해',130),
  ('문장분석','독해',140), ('문장녹음','독해',150), ('해석쓰기','독해',160),
  ('독해워크북','독해',170),
  ('문법','문법',210), ('문법(온라인)','문법',220), ('문법워크북','문법',230),
  ('문법쓰기','문법',240),
  ('영작','기타',310), ('듣기','기타',320),
  ('문답노트','노트',410), ('오답노트','노트',420), ('단어노트','노트',430),
  ('개념노트','노트',440),
  ('문장암기(온라인)','노트',450), ('셀프테스트(종이)','노트',460),
  ('셀프테스트(녹음)','노트',470),
  ('백발백중','내신',510), ('내신콘서트','내신',520), ('변형문제','내신',530),
  ('내신워크북','내신',540), ('내신대비','내신',550), ('교과서워크북','내신',560),
  ('틀린 문장 쓰기','내신',570), ('내신숙제채점','내신',580),
  ('연휴과제','기타',610), ('프린트','기타',620), ('특강숙제','기타',630),
  ('오답풀이','기타',640), ('오답쓰기','기타',650), ('숙제채점','기타',660),
  ('모의고사 오답풀이','기타',670), ('모의고사 연습문제','기타',680),
  ('논리구조워크북','기타',690), ('문장구조워크북','기타',700),
  ('수행평가','기타',710), ('수행평가대비 워크북','기타',720),
  ('지난 시간 밀린 숙제','기타',730), ('재시험페널티','기타',740),
  ('쓰기숙제','기타',750), ('반성문','기타',760)
on conflict (name) do nothing;
