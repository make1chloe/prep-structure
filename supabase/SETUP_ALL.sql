-- ============================================================
-- 클로이영어 학습관리 — 전체 스키마 (한 번에 실행)
-- Supabase > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- ============================================================

-- ─────────── 0001_core_schema.sql ───────────
-- ============================================================
-- 클로이영어 학습관리 웹앱 — 코어 스키마 (MVP 1단계: 정규수업 트랙)
-- 대상: Supabase (PostgreSQL)
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 Run
--   (내신대비 트랙은 0002_naesin_schema.sql 에서 추가 예정)
-- ============================================================

-- ---------- 확장 ----------
create extension if not exists "pgcrypto";      -- gen_random_uuid()

-- ---------- ENUM (상태값 목록) ----------
do $$ begin
  create type user_role as enum ('principal','instructor','assistant','student','parent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type learning_kind as enum ('once','repeat');       -- 1회성 / 회독형
exception when duplicate_object then null; end $$;

do $$ begin
  create type learning_phase as enum ('arrival','home');     -- 등원과제 / 하원숙제
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_source as enum ('regular','naesin'); -- 정규 / 내신
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum ('none','done','weak','miss'); -- 미체크/완료/미흡/미이행
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present','late','early_leave','absent','makeup','online');
exception when duplicate_object then null; end $$;

do $$ begin
  create type test_type as enum ('word','sentence');         -- 단어시험 / 문장시험
exception when duplicate_object then null; end $$;

do $$ begin
  create type student_status as enum ('prospect','enrolled','paused','withdrawn'); -- 예비/재원/휴원/퇴원
exception when duplicate_object then null; end $$;

-- ---------- 공용: updated_at 자동 갱신 트리거 ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ============================================================
-- 1) 사람 · 계정
-- ============================================================

-- 로그인 계정 프로필 (auth.users 와 1:1) — 역할 보유
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'student',
  name        text not null default '',
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 재원생 (노션 3재원생DB 기반). 학생 로그인 계정이 있으면 profile_id 연결.
create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references public.profiles(id) on delete set null,
  name          text not null,
  school        text,
  grade         text,               -- 예: 중2, 고1
  birth_year    date,
  student_phone text,
  parent_phone  text,
  note          text,               -- 특이사항(자유 메모)
  status        student_status not null default 'enrolled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 학부모(계정) - 학생 연결 (부모 1계정 = 자녀 N명)
create table if not exists public.parent_student (
  parent_profile_id uuid not null references public.profiles(id) on delete cascade,
  student_id        uuid not null references public.students(id) on delete cascade,
  primary key (parent_profile_id, student_id)
);

-- 학년·학기별 선택과목 이력
create table if not exists public.student_electives (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  grade      text not null,         -- 예: 고2
  term       text not null,         -- 예: 1학기
  subjects   text not null,         -- 예: 화작/기하
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2) 반 · 수업
-- ============================================================

create table if not exists public.classes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,               -- 예: 월수1
  days               text[] not null default '{}',-- 예: {월,수}
  start_time         time,
  end_time           time,
  level              text,                        -- 기본반/심화반
  category           text default '정규반',        -- 정규반/특강
  room               text,
  capacity           int not null default 5,
  homeroom_teacher_id uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.class_students (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (class_id, student_id)
);

-- ============================================================
-- 3) 교재 · 커리큘럼 (정규)
-- ============================================================

create table if not exists public.textbooks (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  area         text,                 -- 독해/문법/단어/듣기/영작/내신
  target_grade text,                 -- 적정학년 (범위)
  total_pages  int,
  purchase_url text,                 -- 구입처 URL (학부모 알림톡)
  price        int,                  -- 교재비(원)
  feature      text,                 -- 교재특징(자유서술)
  cover_url    text,                 -- 표지/파일
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 단원 트리 (대/중/소단원 무한 계층) — parent_id 자기참조
create table if not exists public.textbook_units (
  id          uuid primary key default gen_random_uuid(),
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  parent_id   uuid references public.textbook_units(id) on delete cascade,
  label       text,                  -- Part / Chapter / Lesson / Unit (자유)
  name        text not null,         -- 단원명 (예: 관계사)
  page_start  int,
  page_end    int,
  sort        int not null default 0
);

-- 단원 내 구성 (개념확인문제/단원종합문제 등 페이지별)
create table if not exists public.unit_sections (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references public.textbook_units(id) on delete cascade,
  name       text not null,          -- 개념설명/개념확인문제/단원종합문제/워크북 등
  page_start int,
  page_end   int,
  sort       int not null default 0
);

-- 학습방식 (숙제채점, 낭독녹음, 구두테스트, 스크램블 …)
create table if not exists public.learning_items (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       learning_kind not null default 'once',   -- 1회성 / 회독형
  phase      learning_phase not null default 'arrival',-- 등원 / 하원
  sort       int not null default 0,
  active      boolean not null default true,
  created_at timestamptz not null default now()
);

-- 학생별 통합진도관리 = 학습방식 + 교재/단원 (+ 단어시험 개수)
create table if not exists public.student_curriculum (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  learning_item_id uuid references public.learning_items(id) on delete set null,
  textbook_unit_id uuid references public.textbook_units(id) on delete set null,
  word_test_count  int,                -- 학생별 단어시험 기본 개수 (수정 가능)
  sort             int not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- 4) 오늘의 운영 (허브) — 정규+내신이 합쳐지는 중심
-- ============================================================

-- 오늘의 과제 (등원/하원). 정규는 커리큘럼에서 자동, 내신은 수동 지정.
create table if not exists public.daily_assignments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  date             date not null default (now() at time zone 'Asia/Seoul')::date,
  phase            learning_phase not null,            -- 등원 / 하원
  source           assignment_source not null default 'regular',
  learning_item_id uuid references public.learning_items(id) on delete set null,
  textbook_unit_id uuid references public.textbook_units(id) on delete set null,
  label            text,                               -- 화면 표시용 (예: 관계사-워크북)
  status           assignment_status not null default 'none',
  repeat_current   int,                                -- 회독형 현재 횟수
  repeat_target    int,                                -- 회독형 목표 횟수
  overdue_days     int not null default 0,             -- 밀림 누적 (리포트엔 미표시)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_daily_assign_student_date
  on public.daily_assignments(student_id, date);

-- 시험 결과 (단어/문장)
create table if not exists public.tests (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students(id) on delete cascade,
  date              date not null default (now() at time zone 'Asia/Seoul')::date,
  type              test_type not null,
  wrong             int not null default 0,
  total             int not null default 0,
  pass_threshold_pct int not null default 10,          -- 오답 10% 이내 통과(기본)
  passed            boolean,
  show_in_report    boolean not null default true,     -- 리포트에 통과여부 포함 여부
  created_at        timestamptz not null default now()
);

-- 출결
create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null default (now() at time zone 'Asia/Seoul')::date,
  status     attendance_status not null,
  makeup_of  date,                     -- 보강인 경우 원 결석일
  note       text,
  created_at timestamptz not null default now(),
  unique (student_id, date)
);

-- 데일리리포트 (내용은 위 테이블들을 조합해 생성. 여기엔 발송 메타/코멘트만)
create table if not exists public.daily_reports (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  date        date not null default (now() at time zone 'Asia/Seoul')::date,
  comment     text,                    -- 선생님 코멘트
  sent_at     timestamptz,             -- 카카오 알림톡 발송 시각
  kakao_status text,                   -- 발송 상태
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, date)
);

-- ============================================================
-- 5) updated_at 트리거 부착
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','students','classes','textbooks','student_curriculum',
    'daily_assignments','daily_reports'
  ] loop
    execute format(
      'drop trigger if exists trg_updated_at on public.%I;
       create trigger trg_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- ============================================================
-- 6) 신규 auth.users → profiles 자동 생성
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 7) RLS (행 수준 보안)
--   MVP: 스태프(원장/강사/조교)는 전체 접근.
--   학생/학부모 열람 정책은 다음 단계에서 세분화 (TODO).
-- ============================================================
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('principal','instructor','assistant')
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','students','parent_student','student_electives',
    'classes','class_students','textbooks','textbook_units','unit_sections',
    'learning_items','student_curriculum','daily_assignments','tests',
    'attendance','daily_reports'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    -- 스태프 전체 접근
    execute format($p$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $p$, t, t);
  end loop;
end $$;

-- 본인 프로필은 스스로 조회 가능
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select to authenticated using (id = auth.uid());

-- ============================================================
-- 끝. (내신대비 트랙 · 신규생 유입 · 일정/할일은 후속 마이그레이션)
-- ============================================================

-- ─────────── 0002_student_fields.sql ───────────
-- ============================================================
-- 0002_student_fields
-- 학생 폼 확장에 필요한 컬럼 추가
--  - electives : 선택과목(자유 텍스트, 활용도 낮아 일단 텍스트로 기록)
--  - login_id  : 학생 로그인 아이디(chloe+전화뒷자리4). 조회/수정용으로 저장.
-- ============================================================

alter table public.students
  add column if not exists electives text;

alter table public.students
  add column if not exists login_id text;

-- 로그인 아이디 중복 방지(비어있는 값은 제외)
create unique index if not exists students_login_id_key
  on public.students (login_id)
  where login_id is not null;

-- ─────────── 0003_student_more_fields.sql ───────────
-- ============================================================
-- 0003_student_more_fields
-- 노션 재원생DB 이관을 위해 추가
--   gender      : 성별 (남/여, 텍스트로 저장)
--   enrolled_on : 등원시작일(입회일)
-- ============================================================

alter table public.students add column if not exists gender text;
alter table public.students add column if not exists enrolled_on date;

-- ─────────── 0004_textbook_fields.sql ───────────
-- ============================================================
-- 0004_textbook_fields
--   textbooks.word_range     : 단어 교재의 단어범위(개수)
--   textbook_units.activity  : 단원 활동 유형(설명/실전모의고사/워크북 등)
-- ============================================================

alter table public.textbooks add column if not exists word_range int;
alter table public.textbook_units add column if not exists activity text;

-- ─────────── 0005_classes_daily.sql ───────────
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



-- ============================================================
-- 0008: 숙제 배정에 교재 단원 연결
-- ============================================================

-- 0008: 숙제 배정에 교재 단원 연결
--   daily_report_items.textbook_unit_id : 이 숙제가 가리키는 교재 단원 (교재DB의 단원명과 연동)
--   daily_report_items.range_note       : 단원으로 딱 떨어지지 않는 범위 메모 (예: "12~19p, 짝수만")
-- 안전하게 여러 번 실행 가능합니다.

alter table public.daily_report_items
  add column if not exists textbook_unit_id uuid references public.textbook_units(id) on delete set null;

alter table public.daily_report_items
  add column if not exists range_note text;

create index if not exists daily_report_items_unit_idx
  on public.daily_report_items (textbook_unit_id);
