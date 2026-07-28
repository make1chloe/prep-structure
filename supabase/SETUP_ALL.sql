-- ============================================================
-- 클로이영어 학습관리 — 전체 스키마 (이 파일 하나만 실행하면 됩니다)
--
-- 쓰는 법
--   1. https://supabase.com/dashboard → 프로젝트 선택
--   2. 왼쪽 메뉴 SQL Editor → Untitled query 안을 클릭
--   3. **Ctrl+A 로 전체 선택하고 지운 뒤** 이 파일 내용을 붙여넣기
--      ★ 지난번 내용 아래에 덧붙이지 마세요. 통째로 갈아끼우는 것입니다.
--      — 앱 안에서 바로 복사할 수 있습니다: 설정 → Supabase SQL
--   4. 오른쪽 아래 Run (또는 Cmd/Ctrl + Enter)
--   5. "Success" 가 나오면 끝
--
-- 0001 부터 지금까지가 순서대로 다 들어 있습니다.
-- 여러 번 실행해도 안전합니다 — 이미 있는 것은 전부 건너뜁니다.
-- 새 프로젝트든 쓰던 프로젝트든 이 파일 하나면 됩니다.
--
-- ※ 중간에 에러가 나면 **아무것도 반영되지 않습니다** (한 덩어리로 실행되기 때문).
--   DB 가 망가진 게 아니니 원인만 고쳐서 다시 Run 하시면 됩니다.
--
-- 제대로 됐는지 확인하는 법
--   · 오늘 수업 맨 위에 "공지 · 전달사항" 입력칸                → 0009 까지 OK
--   · 수업 스케줄 · 시험 화면에 시험 일정 20건                  → 0022 까지 OK
--   · 학생용 페이지 숙제 아래 💬 댓글 버튼                      → 0023 까지 OK
--   · 오늘 수업 학생 칸에 '오늘 마무리' 줄                      → 0024 까지 OK
--   · 단어 교재 진도 아래 '1회독 · 시험 방식 미설정'            → 0025 까지 OK
--   · 학생 기록 오른쪽에 '경고 기록' 칸                         → 0026 까지 OK
--   · 오늘 수업 학생 칸에 '하원 안내' 줄                        → 0027 까지 OK
--   · 학습 항목 표에 '내 할일 자동 생성' 칸                     → 0028 까지 OK
--   · 설정 → 문자 문구에 문자 9개                              → 0029 까지 OK
--   · 문자 문구를 열었을 때 '알림톡' 칸                         → 0030 까지 OK
--   · 메뉴에 '월말 리포트' 가 보이고 열리면                    → 0031 까지 OK
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


-- ============================================================
-- 0009: 숙제 다중 단원 + 공지/전달사항
-- ============================================================

-- 0009: 숙제 다중 단원 배정 + 공지/전달사항
-- 안전하게 여러 번 실행 가능합니다.

-- ---------- 1) 숙제 하나에 단원 여러 개 ----------
alter table public.daily_report_items
  add column if not exists textbook_unit_ids uuid[];

-- ---------- 2) 공지 · 전달사항 ----------
-- 한 번 써서 전체/반/학교·학년/개인에게 뿌린다. (원칙1: 같은 값 두 번 입력하지 않기)
--   kind = 'deliver' : 수업 중 학생에게 말로 전달할 사항 → 하원 전 전달 체크
--   kind = 'notice'  : 학부모 리포트에 나갈 공지
create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  kind         text not null default 'deliver',
  scope        text not null default 'all',   -- all | class | grade | student
  class_id     uuid references public.classes(id) on delete set null,
  school       text,
  grade        text,
  body         text not null,
  task_id      uuid,                          -- 나중에 할일/일정 DB와 연결할 자리
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists notices_date_idx on public.notices (date);

-- 만들 때 대상 학생을 확정해서 한 줄씩 깔아둔다 → 오늘 수업 화면은 이 표만 읽으면 된다
create table if not exists public.notice_receipts (
  notice_id    uuid not null references public.notices(id) on delete cascade,
  student_id   uuid not null references public.students(id) on delete cascade,
  delivered_at timestamptz,
  primary key (notice_id, student_id)
);
create index if not exists notice_receipts_student_idx
  on public.notice_receipts (student_id);

do $$
declare t text;
begin
  foreach t in array array['notices','notice_receipts'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;

-- ---------- 3) 학습 항목별 학습 방법 (학생용 안내) ----------
alter table public.homework_items add column if not exists method text;


-- ============================================================
-- 0010: 학생별 교재 배정 · 단원 진도
-- ============================================================

-- 0010: 학생별 교재 배정 · 단원 진도 (순서 무관 체크)
-- 안전하게 여러 번 실행 가능합니다.
--
-- 설계 메모 (원칙1: 같은 값 두 번 입력하지 않기)
--   교재 단원은 textbook_units 한 곳에만 있다. 학생별로 복사하지 않는다.
--   학생이 "끝낸 단원"만 student_unit_progress 에 한 줄씩 쌓는다.
--   줄이 없으면 = 아직 안 한 단원. 그래서 순서와 무관하게 아무 단원이나 체크할 수 있다.

-- 학생 ← 교재 배정 (반에 교재를 붙이면 그 반 학생 전원에게 자동으로 깔린다)
create table if not exists public.student_textbooks (
  student_id  uuid not null references public.students(id) on delete cascade,
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  assigned_on date not null default current_date,
  status      text not null default 'active',   -- active | done | dropped
  primary key (student_id, textbook_id)
);
create index if not exists student_textbooks_book_idx
  on public.student_textbooks (textbook_id);

-- 학생별 단원 진도 — 완료한(또는 진행중인) 단원만 기록
create table if not exists public.student_unit_progress (
  student_id       uuid not null references public.students(id) on delete cascade,
  textbook_unit_id uuid not null references public.textbook_units(id) on delete cascade,
  status           text not null default 'done',   -- done | doing | skip
  done_on          date default current_date,
  note             text,
  primary key (student_id, textbook_unit_id)
);
create index if not exists student_unit_progress_unit_idx
  on public.student_unit_progress (textbook_unit_id);

do $$
declare t text;
begin
  foreach t in array array['student_textbooks','student_unit_progress'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;


-- ============================================================
-- 0011: 페이지 기반 진도
-- ============================================================

-- 0011: 단원을 아직 안 만든 교재의 진도 (페이지로 기록)
-- 단원 데이터를 다 만들기 전에도 "지금 몇 페이지까지"로 진도를 볼 수 있게 한다.
alter table public.student_textbooks
  add column if not exists current_page int;


-- ============================================================
-- 0012: 데일리리포트 발송
-- ============================================================

-- 0012: 데일리리포트 발송
--   sent_at     : 학부모에게 보낸 시각 (없으면 아직 안 보냄)
--   report_text : 실제로 보낸 문구. 비어 있으면 자동 생성 문구를 쓴다.
--                 선생님이 고쳐서 보내면 여기에 저장되고, 재발송도 이걸 쓴다.
alter table public.daily_reports add column if not exists sent_at timestamptz;
alter table public.daily_reports add column if not exists report_text text;
create index if not exists daily_reports_sent_idx on public.daily_reports (date, sent_at);


-- ============================================================
-- 0013: 재발송
-- ============================================================

-- 0013: 재발송 (숙제 문자 · 데일리리포트 다시 보내기)
--   homework_text     : 고친 숙제 문자. 비어 있으면 자동 생성 문구를 쓴다.
--   homework_sent_at  : 숙제 문자를 마지막으로 보낸 시각
--   report_sends      : 보낸 이력. 몇 번 보냈는지, 그때 뭘 보냈는지 남는다.
alter table public.daily_reports add column if not exists homework_text text;
alter table public.daily_reports add column if not exists homework_sent_at timestamptz;

create table if not exists public.report_sends (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  kind            text not null default 'report',   -- report | homework
  body            text not null,
  sent_at         timestamptz not null default now(),
  sent_by         uuid references public.profiles(id) on delete set null
);
create index if not exists report_sends_report_idx
  on public.report_sends (daily_report_id, kind);

alter table public.report_sends enable row level security;
drop policy if exists staff_all on public.report_sends;
create policy staff_all on public.report_sends
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());


-- ============================================================
-- 0014: 할일 · 일정 DB
-- ============================================================

-- 0014: 할일 · 일정 DB
--
-- 속성 정리 (원칙4-1: 만들기 전에 나열하고 불필요한 것 제거)
--   title        할일/일정 이름                       필수
--   kind         todo(할일) | schedule(일정)          필수 — 목록에서 나누는 기준
--   category     학사일정/수업/행정/상담/교재/기타     분류
--   due_on       할일 마감일 · 일정 날짜               필수
--   end_on       여러 날짜에 걸치는 일정의 끝날        선택
--   start_time   시간이 정해진 일정                    선택
--   status       open | done | canceled               필수
--   done_at      완료 시각                             자동
--   class_id     특정 반과 관련된 일정                 선택
--   assignee_id  담당자                                선택
--   note         메모                                  선택
--   deliver_*    이 일정에서 만들 "학생 전달사항"      선택 ← notices 와 연결
--
--   제외: 반복 규칙(아직 안 씀), 우선순위(날짜+상태로 충분), 태그(category로 충분), 첨부

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  kind          text not null default 'todo',      -- todo | schedule
  category      text,
  due_on        date not null default current_date,
  end_on        date,
  start_time    time,
  status        text not null default 'open',      -- open | done | canceled
  done_at       timestamptz,
  class_id      uuid references public.classes(id) on delete set null,
  assignee_id   uuid references public.profiles(id) on delete set null,
  note          text,

  -- 이 일정에서 학생에게 전달할 사항 (비어 있으면 만들지 않는다)
  deliver_body      text,
  deliver_scope     text,                          -- all | class | grade | student
  deliver_class_id  uuid references public.classes(id) on delete set null,
  deliver_school    text,
  deliver_grade     text,

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_due_idx on public.tasks (due_on, status);

alter table public.tasks enable row level security;
drop policy if exists staff_all on public.tasks;
create policy staff_all on public.tasks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 일정에서 만든 전달사항을 되짚을 수 있게 (0009 에서 자리만 만들어 둔 컬럼)
alter table public.notices
  add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists notices_task_idx on public.notices (task_id);


-- ============================================================
-- 0015: 연동 설정 (문자 발송 · 웹훅)
-- ============================================================

-- 0015: 연동 설정 (문자 발송 · 웹훅 · 학원 정보)
--
-- 환경변수 대신 앱에서 바꾼다. 값이 바뀌어도 재배포가 필요 없다.
--   id      solapi | webhook | academy
--   enabled 이 연동을 쓸지
--   config  jsonb — 키·번호·URL 등 (비밀값 포함, 화면에는 가려서 보여준다)
--
-- 보안: 원장만 읽고 쓸 수 있다. 비밀값은 서버에서만 읽고 화면으로 내려보내지 않는다.

create table if not exists public.integrations (
  id         text primary key,
  enabled    boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.integrations enable row level security;
drop policy if exists principal_all on public.integrations;
create policy principal_all on public.integrations
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'principal')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'principal')
  );

-- 발송 결과를 남긴다 (성공/실패 사유)
alter table public.report_sends add column if not exists channel text;   -- copy | sms | webhook
alter table public.report_sends add column if not exists ok boolean;
alter table public.report_sends add column if not exists detail text;
alter table public.report_sends add column if not exists to_phone text;

insert into public.integrations (id, enabled, config) values
  ('academy', true, '{"name":"클로이영어"}'::jsonb)
on conflict (id) do nothing;


-- ============================================================
-- 0016: 앱 알림 (웹 푸시)
-- ============================================================

-- 0016: 앱 알림 (웹 푸시) — 문자 비용 없이 학생·학부모에게 알림
--
--   push_subscriptions : 기기 하나당 한 줄. 알림 허용을 누르면 브라우저가 만들어 준다.
--   보낼 때 필요한 키(VAPID)는 integrations 테이블의 'push' 에 저장한다.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  ua         text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_student_idx
  on public.push_subscriptions (student_id);

alter table public.push_subscriptions enable row level security;

-- 본인 기기는 본인이 등록/삭제, 선생님은 전체 조회 가능
drop policy if exists own_or_staff on public.push_subscriptions;
create policy own_or_staff on public.push_subscriptions
  for all to authenticated
  using (profile_id = auth.uid() or public.is_staff())
  with check (profile_id = auth.uid() or public.is_staff());

-- 학생이 자기 정보를 볼 수 있게 (학생용 페이지)
drop policy if exists student_self on public.students;
create policy student_self on public.students
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

drop policy if exists student_self_reports on public.daily_reports;
create policy student_self_reports on public.daily_reports
  for select to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
  );

drop policy if exists student_self_items on public.daily_report_items;
create policy student_self_items on public.daily_report_items
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.daily_reports r
      join public.students s on s.id = r.student_id
      where r.id = daily_report_id and s.profile_id = auth.uid()
    )
  );

-- 숙제 항목·교재 단원은 학생도 읽을 수 있어야 한다 (학습 방법 · 단원명)
drop policy if exists read_all_staff_or_student on public.homework_items;
create policy read_all_staff_or_student on public.homework_items
  for select to authenticated using (true);

drop policy if exists read_all_staff_or_student on public.textbook_units;
create policy read_all_staff_or_student on public.textbook_units
  for select to authenticated using (true);

drop policy if exists read_all_staff_or_student on public.textbooks;
create policy read_all_staff_or_student on public.textbooks
  for select to authenticated using (true);


-- ============================================================
-- 0017: 결석 예정 · 신규 상담 · 안내 문자 템플릿
-- ============================================================

-- 0017: 결석 예정 · 신규 상담 · 안내 문자 템플릿
-- 안전하게 여러 번 실행 가능합니다.

-- ------------------------------------------------------------
-- 1. 결석 예정 (미리 연락받은 결석)
--
-- 속성 정리: 새 상태값을 만들지 않고 기존 'absent' 에 표시만 더한다.
--   planned = true  → 미리 연락받음 (당일 결석과 구분)
--   reason          → 사유 (학교 행사 / 병원 / 가족 일정 …)
--   makeup_of       → 이미 있는 컬럼. 보강일을 잡으면 그 날짜 행에 원 결석일이 들어간다.
-- 이렇게 하면 출결 집계·보강 안내가 지금 구조 그대로 돌아간다.
-- ------------------------------------------------------------
alter table public.attendance add column if not exists planned boolean not null default false;
alter table public.attendance add column if not exists reason  text;
create index if not exists attendance_planned_idx on public.attendance (date, planned);


-- ------------------------------------------------------------
-- 2. 신규 상담 (문의 → 상담 → 레벨테스트 → 등록)
--
-- 속성 정리
--   name/phone            필수 — 이것만 있으면 접수된다
--   school/grade          상담 준비에 필요
--   source                유입경로 (블로그/소개/전단/검색/방문)
--   status                new | scheduled | consulted | tested | enrolled | hold | declined
--   consult_on/at         상담 예정 일시
--   test_on/at            레벨테스트 예정 일시
--   test_result/test_note 테스트 결과
--   want_days/want_time   희망 요일·시간 (반 배정 판단)
--   class_id              배정하려는 반
--   student_id            등록으로 전환되면 연결 (원칙1: 이름을 다시 안 적는다)
--   memo                  상담 내용
--   제외: 주소·형제자매·직업 등 (지금 쓰지 않음)
-- ------------------------------------------------------------
create table if not exists public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  student_phone text,
  school      text,
  grade       text,
  source      text,
  status      text not null default 'new',
  consult_on  date,
  consult_at  time,
  test_on     date,
  test_at     time,
  test_result text,
  test_note   text,
  want_days   text[],
  want_time   text,
  class_id    uuid references public.classes(id) on delete set null,
  student_id  uuid references public.students(id) on delete set null,
  memo        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists inquiries_status_idx on public.inquiries (status, created_at desc);
create index if not exists inquiries_test_idx   on public.inquiries (test_on);


-- ------------------------------------------------------------
-- 3. 안내 문자 템플릿
--
-- 교재 구매 안내, 레벨테스트 등원·하원 안내처럼 정형화된 문자를 미리 써둔다.
-- 본문에 {{변수}} 를 넣으면 보낼 때 실제 값으로 바뀐다.
--   {{학원명}} {{학생명}} {{날짜}} {{시간}}
--   {{교재목록}} {{교재비}} {{구매링크}}   ← 교재 구매 안내용
--   {{테스트결과}}                        ← 레벨테스트용
-- ------------------------------------------------------------
create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null default 'general',  -- book | test_in | test_out | general
  body       text not null,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 같은 이름이 두 번 들어가지 않게 한다.
-- 이 파일을 여러 번 실행하면 아래 seed 가 매번 새로 꽂혀서
-- '교재 구매 안내' 가 3개, 4개로 늘어나고 있었다. 있던 중복은 여기서 정리한다.
delete from public.message_templates a
 using public.message_templates b
 where a.name = b.name and a.ctid > b.ctid;
create unique index if not exists message_templates_name_idx
  on public.message_templates (name) where active;

insert into public.message_templates (name, kind, body, sort) values
  ('교재 구매 안내', 'book',
   '[{{학원명}}] {{학생명}} 학생 교재 안내

이번에 사용할 교재입니다.

{{교재목록}}

구매: {{구매링크}}

구매가 어려우시면 학원으로 말씀해주세요.', 10),
  ('레벨테스트 등원 안내', 'test_in',
   '[{{학원명}}] {{학생명}} 학생이 레벨테스트를 위해 도착했습니다.

테스트는 약 40분 정도 걸리며, 끝나면 다시 안내드리겠습니다.', 20),
  ('레벨테스트 하원 안내', 'test_out',
   '[{{학원명}}] {{학생명}} 학생 레벨테스트가 끝나 하원했습니다.

{{테스트결과}}

상담 일정은 따로 연락드리겠습니다. 감사합니다.', 30)
on conflict (name) where active do nothing;


-- ------------------------------------------------------------
-- 4. 권한
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['inquiries','message_templates'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      drop policy if exists staff_all on public.%I;
      create policy staff_all on public.%I
        for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $f$, t, t);
  end loop;
end $$;


-- ============================================================
-- 0018: 수강료 계산 · 학부모 신청 양식
-- ============================================================

-- 0018: 수강료 계산 (회차 기준) · 학부모 신청 양식
-- 안전하게 여러 번 실행 가능합니다.

-- ------------------------------------------------------------
-- 1. 휴강일
--    scope = all  : 전체 휴강 (명절·학원 사정)
--    scope = class: 특정 반만 휴강
-- ------------------------------------------------------------
create table if not exists public.holidays (
  id       uuid primary key default gen_random_uuid(),
  date     date not null,
  name     text,
  scope    text not null default 'all',   -- all | class
  class_id uuid references public.classes(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists holidays_date_idx on public.holidays (date);


-- ------------------------------------------------------------
-- 2. 수강료 단가
--    classes.tuition       월 수강료 (원)
--    classes.base_sessions 기준 회차. 비우면 그 달 정상 회차를 기준으로 본다.
--    students.tuition      이 학생만 다른 금액을 받을 때 (형제 할인 등)
--    students.started_on   등원 시작일 — 달 중간에 시작하면 회차가 줄어든다
--    students.ended_on     퇴원일
-- ------------------------------------------------------------
alter table public.classes  add column if not exists tuition       int;
alter table public.classes  add column if not exists base_sessions int;
alter table public.students add column if not exists tuition       int;
alter table public.students add column if not exists started_on    date;
alter table public.students add column if not exists ended_on      date;


-- ------------------------------------------------------------
-- 3. 학부모 신청 양식
--    전화로 이름만 받아두고 링크를 보내면, 학부모가 직접 채운다.
--    양식을 안 내고 바로 오는 경우도 있어서 전부 선택 입력이다.
--    form_submitted_at 이 비어 있으면 "양식 미제출" 로 표시된다.
-- ------------------------------------------------------------
alter table public.inquiries add column if not exists form_submitted_at timestamptz;
alter table public.inquiries add column if not exists prev_academy   text;   -- 이전 학원 / 학습 경험
alter table public.inquiries add column if not exists goal           text;   -- 목표·요청사항
alter table public.inquiries add column if not exists want_days_text text;   -- 희망 요일 (자유 입력)
alter table public.inquiries add column if not exists visit_on       date;   -- 학부모 방문상담 희망일
alter table public.inquiries add column if not exists visit_at       time;
alter table public.inquiries add column if not exists visit_alt      text;   -- 다른 가능 시간
alter table public.inquiries add column if not exists test_want_on   date;   -- 레벨테스트 희망일
alter table public.inquiries add column if not exists test_want_at   time;
alter table public.inquiries add column if not exists token          text;   -- 양식 링크 식별자

create unique index if not exists inquiries_token_idx on public.inquiries (token)
  where token is not null;


-- ------------------------------------------------------------
-- 4. 권한
-- ------------------------------------------------------------
alter table public.holidays enable row level security;
drop policy if exists staff_all on public.holidays;
create policy staff_all on public.holidays
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학부모가 로그인 없이 양식을 제출할 수 있게 (넣기만 가능, 읽기는 불가)
drop policy if exists anon_apply_insert on public.inquiries;
create policy anon_apply_insert on public.inquiries
  for insert to anon
  with check (true);

-- 링크(token)로 접수 건을 채워 넣는 경우도 허용 (해당 건만)
drop policy if exists anon_apply_update on public.inquiries;
create policy anon_apply_update on public.inquiries
  for update to anon
  using (token is not null)
  with check (token is not null);


-- ------------------------------------------------------------
-- 5. 교재 안내 문자에서 교재비 제거 (학원에서 교재비를 따로 받지 않음)
-- ------------------------------------------------------------
update public.message_templates
set body = '[{{학원명}}] {{학생명}} 학생 교재 안내

이번에 사용할 교재입니다.

{{교재목록}}

구매: {{구매링크}}

구매가 어려우시면 학원으로 말씀해주세요.'
where kind = 'book' and body like '%교재비%';


-- ============================================================
-- 0019: 일정 연결 · 학생/학부모 요청 · 교재 사용 기록
-- ============================================================

-- 0019: 일정 ↔ 결석예정 연결 · 학생/학부모 요청 · 교재 사용 기록 · 문구 설정
-- 안전하게 여러 번 실행 가능합니다. (테이블을 지우는 구문은 없습니다)

-- ------------------------------------------------------------
-- 1. 일정(tasks)을 상위 개념으로 — 하나의 일정에서 세 가지가 파생된다
--      deliver_body        → 학생 전달사항 (이미 있음)
--      notice_body         → 학부모 공지
--      absence_student_ids → 결석 예정 (due_on ~ end_on 기간 전체)
-- ------------------------------------------------------------
alter table public.tasks add column if not exists notice_body         text;
alter table public.tasks add column if not exists absence_student_ids uuid[];
alter table public.tasks add column if not exists absence_reason      text;
alter table public.tasks add column if not exists applied_at          timestamptz;


-- ------------------------------------------------------------
-- 2. 학생 · 학부모가 직접 넣는 요청
--    결석 알림, 보강 요청, 질문. 선생님이 확인하면 결석 예정으로 반영된다.
-- ------------------------------------------------------------
create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  kind        text not null default 'absence',   -- absence | makeup | question
  from_date   date,
  to_date     date,
  body        text,
  status      text not null default 'new',       -- new | accepted | declined | done
  reply       text,
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists requests_status_idx on public.requests (status, created_at desc);
create index if not exists requests_student_idx on public.requests (student_id);


-- ------------------------------------------------------------
-- 3. 교재 사용 기록 — "사용중"이 두 가지라서 나눈다
--      textbooks.status         학원 차원 (사용중 / 절판 / 중단)
--      student_textbooks.status 학생 차원 (사용중 / 완료 / 중단)  ← 이미 있음
--    끝낸 교재는 재원생 기록에만 남고, 숙제 배정·진도 화면에서는 빠진다.
-- ------------------------------------------------------------
alter table public.student_textbooks add column if not exists ended_on date;
alter table public.student_textbooks add column if not exists note     text;


-- ------------------------------------------------------------
-- 4. 문구 설정 (인삿말·맺음말·연락처) — 앱에서 바꾼다
-- ------------------------------------------------------------
insert into public.integrations (id, enabled, config) values
  ('message', true, '{"greeting":"","closing":"","phone":"","address":""}'::jsonb)
on conflict (id) do nothing;


-- ------------------------------------------------------------
-- 5. 권한
-- ------------------------------------------------------------
alter table public.requests enable row level security;

-- 선생님은 전부, 학생·학부모는 자기 것만
drop policy if exists staff_all on public.requests;
create policy staff_all on public.requests
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_requests on public.requests;
create policy own_requests on public.requests
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
    or exists (
      select 1 from public.parent_student ps
      where ps.student_id = requests.student_id and ps.parent_profile_id = auth.uid()
    )
  );

drop policy if exists own_requests_insert on public.requests;
create policy own_requests_insert on public.requests
  for insert to authenticated
  with check (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
    or exists (
      select 1 from public.parent_student ps
      where ps.student_id = requests.student_id and ps.parent_profile_id = auth.uid()
    )
  );

-- 학생·학부모가 자기 반 정보를 읽을 수 있게 (결석 알릴 날짜 판단용)
drop policy if exists read_classes_all on public.classes;
create policy read_classes_all on public.classes
  for select to authenticated using (true);

drop policy if exists read_class_students on public.class_students;
create policy read_class_students on public.class_students
  for select to authenticated using (true);


-- ============================================================
-- 0020: 할일 / 일정 분리
-- ============================================================

-- 0020: 할일과 일정을 나눈다 · 할일 분류를 직접 관리
--
-- 나누는 기준
--   일정(schedule) : 날짜·시간이 정해진 것 (학사일정, 특강, 시험, 상담 예약, 휴강)
--   할일(todo)     : 내가 해야 하는 것 (마감일은 있을 수도, 없을 수도)
--
-- 할일은 분류를 직접 만들어 쓴다 (원칙4-6: 자주 바뀌는 항목은 마스터 테이블로)
-- 하위 할일(parent_id)로 큰 일을 쪼갤 수 있다.

create table if not exists public.todo_categories (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  parent_id uuid references public.todo_categories(id) on delete cascade,
  color     text,                       -- sky | lav | mint | amber | muted
  sort      int not null default 0,
  active    boolean not null default true
);
create index if not exists todo_categories_parent_idx on public.todo_categories (parent_id);

-- 같은 이름이 두 번 들어가지 않게 (여러 번 실행하면 아래 기본 분류가 계속 늘어났다)
delete from public.todo_categories a
 using public.todo_categories b
 where a.name = b.name and a.parent_id is not distinct from b.parent_id and a.ctid > b.ctid;
create unique index if not exists todo_categories_name_idx
  on public.todo_categories (name) where active and parent_id is null;

alter table public.tasks add column if not exists todo_category_id uuid
  references public.todo_categories(id) on delete set null;
alter table public.tasks add column if not exists parent_id uuid
  references public.tasks(id) on delete cascade;
alter table public.tasks add column if not exists priority int not null default 0;  -- 0 보통 / 1 중요 / 2 급함
alter table public.tasks add column if not exists due_time time;
alter table public.tasks add column if not exists no_due boolean not null default false;

create index if not exists tasks_kind_idx on public.tasks (kind, status, due_on);
create index if not exists tasks_parent_idx on public.tasks (parent_id);

-- 기본 분류 (지우거나 이름을 바꿔도 됩니다)
insert into public.todo_categories (name, color, sort) values
  ('수업 준비', 'sky', 10),
  ('교재 · 자료', 'mint', 20),
  ('학부모 응대', 'lav', 30),
  ('신규 상담', 'amber', 40),
  ('행정 · 정산', 'muted', 50),
  ('홍보 · 블로그', 'lav', 60),
  ('시설 · 비품', 'muted', 70),
  ('기타', 'muted', 90)
on conflict (name) where active and parent_id is null do nothing;

alter table public.todo_categories enable row level security;
drop policy if exists staff_all on public.todo_categories;
create policy staff_all on public.todo_categories
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());


-- ============================================================
-- 0021: 학교 시험 일정
-- ============================================================

-- 0021: 학교 시험 일정
--
-- 입력이 두 단계로 들어온다
--   1차: 시험 **기간** 만 안다 (학교에서 먼저 알려주는 것)
--        → 그 기간의 정규수업은 타과목 시험 때문에 **결석 예상**
--   2차: **영어 시험일** 이 확정된다
--        → 그 **전날**은 정규수업이 아니어도 등원해야 한다
--
-- 속성 정리
--   school     필수 — 학교마다 시험이 다르다
--   grade      비우면 그 학교 전체 학년
--   name       1학기 중간고사 / 2학기 기말고사 …
--   from_date  ~ to_date   시험 기간 (1차)
--   english_on 영어 시험일 (2차, 나중에 채운다)
--   제외: 과목별 전체 일정 (영어만 알면 된다), 시험 범위(교재 단원으로 대체)

create table if not exists public.exam_periods (
  id         uuid primary key default gen_random_uuid(),
  school     text not null,
  grade      text,
  name       text,
  from_date  date not null,
  to_date    date not null,
  english_on date,
  note       text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists exam_periods_range_idx on public.exam_periods (from_date, to_date);

alter table public.exam_periods enable row level security;
drop policy if exists staff_all on public.exam_periods;
create policy staff_all on public.exam_periods
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모도 자기 학교 시험 일정을 볼 수 있게
drop policy if exists read_exams on public.exam_periods;
create policy read_exams on public.exam_periods
  for select to authenticated using (true);


-- 0022: 2026년 학교 시험 일정 (노션 학사일정DB에서 옮김)
--
-- 노션에는 시험 기간과 영어 시험일이 **따로 적혀 있었다.**
--   "신송중 2회고사"  2026-07-01 ~ 07-03   ← 기간
--   "신송중 영어시험"  2026-07-04          ← 영어 시험일
-- 여기서는 학교로 짝을 지어 한 줄로 합쳤다.
--
-- 1회고사(4월)에는 영어 시험일 기록이 노션에 없어서 비워 두었다.
-- 나중에 `수업 스케줄 · 시험` 화면에서 채워 넣으면 된다.
--
-- 박문중은 2회고사 기간이 노션에 없고 영어 시험일(07-07)만 있었다.
-- 기간을 몰라 그날 하루로 넣어 두었으니 확인 후 고쳐주세요.
--
-- 여러 번 실행해도 같은 시험이 두 번 들어가지 않는다.

create unique index if not exists exam_periods_uniq
  on public.exam_periods (school, coalesce(grade,''), from_date);

insert into public.exam_periods (school, grade, name, from_date, to_date, english_on, note) values
  -- 1학기 중간고사 (영어 시험일 기록 없음)
  ('해송고',   null, '1학기 중간고사', '2026-04-27', '2026-04-30', null, '노션 이관'),
  ('은송중',   null, '1학기 중간고사', '2026-04-27', '2026-04-28', null, '노션 이관'),
  ('현송중',   null, '1학기 중간고사', '2026-04-27', '2026-04-28', null, '노션 이관'),
  ('연송고',   null, '1학기 중간고사', '2026-04-27', '2026-04-30', null, '노션 이관'),
  ('신정중',   null, '1학기 중간고사', '2026-04-28', '2026-04-29', null, '노션 이관'),
  ('연수여고', null, '1학기 중간고사', '2026-04-28', '2026-04-30', null, '노션 이관'),
  ('옥련여고', null, '1학기 중간고사', '2026-04-28', '2026-05-01', null, '노션 이관'),
  ('신송중',   null, '1학기 중간고사', '2026-04-29', '2026-04-30', null, '노션 이관'),
  ('박문중',   null, '1학기 중간고사', '2026-04-29', '2026-04-30', null, '노션 이관'),

  -- 1학기 기말고사 (영어 시험일까지 있음)
  ('옥련여고', null, '1학기 기말고사', '2026-06-30', '2026-07-03', '2026-07-03', '노션 이관'),
  ('신송중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-04', '노션 이관'),
  ('신정중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-05', '노션 이관'),
  ('은송중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-05', '노션 이관'),
  ('현송중',   null, '1학기 기말고사', '2026-07-01', '2026-07-03', '2026-07-05', '노션 이관'),
  ('연송고',   null, '1학기 기말고사', '2026-07-02', '2026-07-07', null,         '노션 이관 · 영어 시험일 기록 없음'),
  ('연수여고', null, '1학기 기말고사', '2026-07-02', '2026-07-07', '2026-07-04', '노션 이관'),
  ('해송고',   null, '1학기 기말고사', '2026-07-02', '2026-07-07', '2026-07-04', '노션 이관'),
  ('박문중',   null, '1학기 기말고사', '2026-07-07', '2026-07-07', '2026-07-07', '노션에 기간이 없어 영어 시험일 하루만 넣음 — 확인 필요'),

  -- 2학기 (신정중만 노션에 있음)
  ('신정중',   null, '2학기 중간고사', '2026-10-28', '2026-10-30', null, '노션 이관'),
  ('신정중',   null, '2학기 기말고사', '2026-12-14', '2026-12-16', null, '노션 이관')
on conflict do nothing;


-- 0023: 숙제 · 데일리리포트에 댓글
--
-- 지금은 학부모가 문자를 받고 **답장할 데가 없다.** 전화나 카톡으로 오면
-- 기록이 흩어진다. 그래서 리포트 한 줄에 댓글을 붙인다.
--
-- 속성 정리 (원칙4-1)
--   daily_report_id  어느 날 어느 학생의 리포트인가            필수
--   student_id       RLS 를 단순하게 하려고 같이 둔다          필수
--   author_id        쓴 사람 (profiles)                        필수
--   author_role      staff | student | parent — 화면 구분용    필수
--   body             내용                                      필수
--   read_at          선생님이 읽은 시각 (안 읽은 것만 보려고)
--   제외: 대댓글(스레드), 첨부, 수정 이력 — 지금 필요 없다
--
-- 학생·학부모는 **자기 것만** 읽고 쓴다. 남의 리포트는 보이지 않는다.

create table if not exists public.report_comments (
  id              uuid primary key default gen_random_uuid(),
  daily_report_id uuid not null references public.daily_reports(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  author_role     text not null default 'staff',   -- staff | student | parent
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists report_comments_report_idx
  on public.report_comments (daily_report_id, created_at);
create index if not exists report_comments_unread_idx
  on public.report_comments (read_at, created_at);

alter table public.report_comments enable row level security;

-- 선생님은 전부
drop policy if exists staff_all on public.report_comments;
create policy staff_all on public.report_comments
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모는 자기 것만 읽기
drop policy if exists own_comments_read on public.report_comments;
create policy own_comments_read on public.report_comments
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = report_comments.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = report_comments.student_id
                 and ps.parent_profile_id = auth.uid())
  );

-- 학생·학부모는 자기 것에만 쓰기 (author_id 를 남의 것으로 못 적게 같이 검사)
drop policy if exists own_comments_write on public.report_comments;
create policy own_comments_write on public.report_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.students s
              where s.id = report_comments.student_id and s.profile_id = auth.uid())
      or exists (select 1 from public.parent_student ps
                 where ps.student_id = report_comments.student_id
                   and ps.parent_profile_id = auth.uid())
    )
  );

-- 자기가 쓴 댓글은 지울 수 있다 (잘못 쓴 경우)
drop policy if exists own_comments_delete on public.report_comments;
create policy own_comments_delete on public.report_comments
  for delete to authenticated
  using (author_id = auth.uid());

-- 학부모가 자기 자녀 연결을 확인할 수 있게 (없으면 댓글 권한 판정이 막힌다)
drop policy if exists own_parent_link on public.parent_student;
create policy own_parent_link on public.parent_student
  for select to authenticated
  using (parent_profile_id = auth.uid() or public.is_staff());



-- 0024: 경고 · 반성문 · 오늘 마무리(늦귀가과제)
--
-- ── 경고 ────────────────────────────────────────────────────
-- 규칙: 지각 / 숙제 미제출·미흡 / 단어시험 미통과 → 경고 1회. 3회 누적 → 반성문.
--
-- 경고를 테이블에 따로 쌓지 않는다. 이미 데일리리포트에 다 있기 때문이다.
--   지각        → attendance_kind = 'late'
--   숙제        → daily_report_items.status = 'missing' | 'weak'
--   단어시험    → word_correct / word_total 이 통과선 미달
-- 매번 계산하면 되고, 그래야 리포트를 고쳤을 때 경고도 같이 맞는다.
--
-- 대신 **사람이 내린 판단만** 저장한다. 이건 계산으로 알 수 없다.
--   waive      그 날 경고를 없던 것으로 (사정이 있었다)
--   reflection 반성문을 썼다 → 여기까지 정산, 다음 경고부터 새로 센다
--   defer      3회가 됐지만 이번엔 넘어간다 → 정산은 하되 '유예' 로 남는다
--
-- ── 오늘 마무리 ─────────────────────────────────────────────
-- 숙제를 안 했거나 그날 학습이 부족하면 남아서 채우고 간다.
-- 미흡·미제출을 찍으면 자동으로 목록에 올라오고, 다 못하면 숙제로 넘기거나 넘어간다.
-- 학생용 페이지에서도 보인다.

-- ------------------------------------------------------------
-- 1. 경고에 대한 판단 기록
-- ------------------------------------------------------------
create table if not exists public.warning_actions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  kind        text not null,          -- waive | reflection | defer
  on_date     date not null,          -- 판단한 날 (정산 기준점)
  target_date date,                   -- waive 일 때: 어느 날 경고를 없앨지
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists warning_actions_student_idx
  on public.warning_actions (student_id, on_date);

alter table public.warning_actions enable row level security;
drop policy if exists staff_all on public.warning_actions;
create policy staff_all on public.warning_actions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모는 자기 것만 읽기 (문자에 나가는 내용이라 봐도 된다)
drop policy if exists own_read on public.warning_actions;
create policy own_read on public.warning_actions
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = warning_actions.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = warning_actions.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 2. 오늘 마무리 (늦귀가과제)
--
--   status  todo    남아서 할 것
--           done    다 함
--           moved   못 끝내서 숙제로 넘김
--           skipped 오늘은 넘어감
-- ------------------------------------------------------------
create table if not exists public.stay_tasks (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  date             date not null,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  body             text not null,
  status           text not null default 'todo',
  auto             boolean not null default false,   -- 미흡·미제출에서 자동으로 올라온 것
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  done_at          timestamptz
);
create index if not exists stay_tasks_student_date_idx
  on public.stay_tasks (student_id, date);
create index if not exists stay_tasks_date_idx on public.stay_tasks (date, status);

alter table public.stay_tasks enable row level security;
drop policy if exists staff_all on public.stay_tasks;
create policy staff_all on public.stay_tasks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.stay_tasks;
create policy own_read on public.stay_tasks
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = stay_tasks.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = stay_tasks.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 3. 경고 기준을 설정에서 바꿀 수 있게
--    (단어시험 통과선, 반성문까지 몇 회인지)
-- ------------------------------------------------------------
insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordPassPct":80,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;


-- 0025: 단어시험 방식 (학생마다 · 교재마다 · 회독마다 다르다)
--
-- 단어시험은 학생마다 보는 방법이 다르다. 개수는 정해져 있지 않고,
-- **네 가지 유형이 합쳐서 100%** 가 되게 배분한다. 0인 것도 있다.
--
--   객관식 뜻      영단어를 주고 뜻을 고른다
--   주관식 뜻      영단어를 주고 뜻을 쓴다
--   객관식 영단어  뜻을 주고 영단어를 고른다
--   주관식 영단어  뜻을 주고 영단어를 쓴다 — 첫 글자 힌트가 있을 수도, 없을 수도
--
-- 언제 정하나
--   · 그 교재를 **시작할 때** 한 번
--   · 진도를 다 끝내고 **한 번 더 돌릴 때(2회독)** 다시. 보통 더 어렵게 바꾼다
--
-- 그래서 (학생, 교재, 회독) 하나에 설정 한 줄이다.

create table if not exists public.word_test_settings (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  textbook_id  uuid not null references public.textbooks(id) on delete cascade,
  round        int  not null default 1,      -- 몇 회독째

  -- 네 가지 배분 (합이 100 이 되게 화면에서 잡아준다)
  mc_meaning   int not null default 0,       -- 객관식 뜻
  sa_meaning   int not null default 0,       -- 주관식 뜻
  mc_word      int not null default 0,       -- 객관식 영단어
  sa_word      int not null default 0,       -- 주관식 영단어

  first_hint   boolean not null default false, -- 주관식 영단어 첫 글자 힌트
  started_on   date default current_date,
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  unique (student_id, textbook_id, round)
);
create index if not exists word_test_settings_student_idx
  on public.word_test_settings (student_id, textbook_id);

alter table public.word_test_settings enable row level security;
drop policy if exists staff_all on public.word_test_settings;
create policy staff_all on public.word_test_settings
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모도 자기 것은 볼 수 있게 (어떻게 시험 보는지 알아야 준비한다)
drop policy if exists own_read on public.word_test_settings;
create policy own_read on public.word_test_settings
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = word_test_settings.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = word_test_settings.student_id
                 and ps.parent_profile_id = auth.uid())
  );

-- 지금 몇 회독째인지 (교재를 다 끝내고 다시 돌리면 올린다)
alter table public.student_textbooks add column if not exists round int not null default 1;


-- ------------------------------------------------------------
-- 경고 기준 정정
--   단어시험은 **오답 10% 이내면 통과** 다 (맞은 비율이 아니라 틀린 비율).
--   0001 스키마의 pass_threshold_pct 주석과 같은 뜻.
--   예전에 넣어둔 wordPassPct(맞은 비율) 는 뜻이 반대라 지운다.
-- ------------------------------------------------------------
update public.integrations
   set config = (config - 'wordPassPct') || '{"wordWrongPct":10}'::jsonb
 where id = 'warning';

insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordWrongPct":10,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- 0026
-- ============================================================

-- 0026: 회독별 진도 기록 + 경고 월간 초기화
--
-- ── 회독 진도를 지우지 않는다 ────────────────────────────────
-- 0025 에서 "다음 회독으로" 를 누르면 끝낸 단원을 **지웠다.**
-- 그러면 1회독을 언제 어디까지 했는지가 사라진다.
-- 이제는 지우지 않고 회독을 붙여서 **쌓는다.**
--   (학생, 단원, 회독) 하나에 한 줄. 2회독은 빈 상태로 시작하고,
--   1회독 기록은 그대로 남아서 학생 기록에서 볼 수 있다.

alter table public.student_unit_progress
  add column if not exists round int not null default 1;

-- 기본키를 (학생, 단원) → (학생, 단원, 회독) 으로 넓힌다
alter table public.student_unit_progress
  drop constraint if exists student_unit_progress_pkey;
alter table public.student_unit_progress
  add constraint student_unit_progress_pkey
  primary key (student_id, textbook_unit_id, round);

create index if not exists student_unit_progress_round_idx
  on public.student_unit_progress (student_id, round);


-- ── 경고 월간 초기화 ────────────────────────────────────────
-- 한 달에 한 번 쌓인 경고를 0으로 되돌린다.
-- warning_actions 에 kind = 'reset' 한 줄을 남기는 것으로 끝난다.
-- 스키마를 바꿀 필요가 없다 — kind 는 원래 자유 문자열이다.
--   waive      그 날 경고만 빼기
--   reflection 반성문 씀
--   defer      이번엔 넘어감 (유예)
--   reset      월간 초기화        ← 여기서 추가
-- 어느 쪽이든 **기록은 지워지지 않는다.** 경고가 몇 회였고 언제 정리했는지
-- 학생 기록에 그대로 남는다. 다음 달 카운트만 0에서 시작한다.
comment on column public.warning_actions.kind is
  'waive | reflection | defer | reset — 사람이 내린 판단. 경고 자체는 리포트에서 계산한다';

-- "이번 달은 그냥 둘게요" 를 눌렀을 때 그 달을 기억해 둔다 (알림이 다시 안 뜨게)
insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordWrongPct":10,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- 0027
-- ============================================================

-- 0027: 늦은 귀가 안내 (하원 안내 문자)
--
-- 남아서 단어 재시험을 보거나 숙제를 마저 하고 가면 평소보다 늦게 나간다.
-- 데리러 오시는 학부모께는 **수업 중에** 알려드려야 의미가 있다.
--
-- 자동으로 잡히는 사유
--   · 단어시험 미통과   → 재시험을 보고 간다
--   · 숙제 미제출·미흡  → 오늘 마무리로 남는다
-- 원장님은 **하원 예상 시간만** 고르면 된다.
--
-- 그 밖의 사유(상담, 보강, 학교 행사 …)는 직접 적어서 보낸다.
--
-- 하루에 학생 한 명당 한 번이므로 daily_reports 에 붙인다.
-- 데일리리포트·숙제 문자와 같은 자리에서 발송 이력이 남는다.

alter table public.daily_reports
  add column if not exists late_until   text,          -- 하원 예상 시간 "21:30"
  add column if not exists late_reason  text,          -- 직접 적은 사유 (자동 사유는 계산한다)
  add column if not exists late_text    text,          -- 손으로 고친 문구
  add column if not exists late_sent_at timestamptz;   -- 보낸 시각

comment on column public.daily_reports.late_until is
  '하원 예상 시간 (HH:MM). 값이 있으면 늦은 귀가 안내 대상이다';

-- 발송 이력의 kind 에 'late' 가 하나 늘어난다.
-- report_sends.kind 는 자유 문자열이라 스키마는 그대로다.
comment on column public.report_sends.kind is
  'report | homework | late — 어떤 문자였는지';

-- ============================================================
-- 0028
-- ============================================================

-- 0028: 숙제를 배정하면 **내 할일**이 자동으로 생긴다
--
-- 단원평가 대비 복습을 숙제로 내주면, 다음 수업 전에 **내가 문제를 출제해야 한다.**
-- 지금까지는 그걸 따로 기억하고 있어야 했다.
--
-- 그래서 숙제 항목에 "이걸 배정하면 이런 할일이 생긴다" 를 적어둔다.
-- 이름을 코드에 박지 않는다 — 나중에 다른 숙제에도 붙일 수 있어야 하기 때문이다.
--   예) 단원평가 대비 복습  →  "{학생} 단원평가 출제"
--       수행평가대비 워크북  →  "{학생} 수행평가 자료 준비"
-- {학생} 자리에 학생 이름이 들어간다. 비워두면 할일을 만들지 않는다.

alter table public.homework_items
  add column if not exists prep_task text;

comment on column public.homework_items.prep_task is
  '이 숙제를 배정하면 만들 내 할일의 제목. {학생} 은 학생 이름으로 바뀐다. 비면 안 만든다';

-- 같은 배정으로 할일이 두 번 생기지 않게 (리포트를 여러 번 저장해도 하나)
alter table public.tasks
  add column if not exists auto_key text;
create unique index if not exists tasks_auto_key_idx
  on public.tasks (auto_key) where auto_key is not null;

comment on column public.tasks.auto_key is
  '자동으로 만든 할일의 열쇠. 값이 있으면 앱이 만든 것이다 (사람이 만든 건 비어 있다)';

-- 단원평가 대비 복습이 아직 없으면 만들어 둔다
insert into public.homework_items (name, category, sort) values
  ('단원평가 대비 복습', '내신', 590)
on conflict (name) do nothing;

-- 이름에 '단원평가' 가 들어간 항목은 출제 할일을 켜준다 (직접 껐으면 그대로 둔다)
update public.homework_items
   set prep_task = '{학생} 단원평가 출제'
 where prep_task is null
   and name like '%단원평가%';

-- ============================================================
-- 0029
-- ============================================================

-- 0029: 문자 문구를 종류별로 나눈다
--
-- 지금까지 인삿말·맺음말이 **하나뿐**이라 데일리리포트에도, 숙제 문자에도,
-- 하원 안내에도 같은 말이 붙었다. 종류마다 톤이 다른데 그럴 수가 없었다.
--
-- 문자를 두 갈래로 본다.
--
--   ① 앱이 본문을 만드는 것 (key 가 있다)
--      데일리리포트 · 숙제 문자 · 하원 안내
--      본문은 그날 입력에서 자동으로 만들어진다. 손댈 것은 인삿말·맺음말뿐이다.
--
--   ② 내가 본문을 쓰는 것 (key 가 없다)
--      교재 안내 · 지각 안내 · 보강 안내 · 단원평가 결과 · 상담 일정 …
--      {{변수}} 를 넣어두면 보낼 때 채워진다.
--
-- 둘 다 **설정 → 문자 문구** 한 곳에서 추가·수정·삭제한다. 코드에는 없다.

alter table public.message_templates
  add column if not exists key      text,   -- report | homework | late (앱이 본문을 만드는 것)
  add column if not exists greeting text,
  add column if not exists closing  text;

create unique index if not exists message_templates_key_idx
  on public.message_templates (key) where key is not null;

comment on column public.message_templates.key is
  '앱이 본문을 자동으로 만드는 문자. 값이 있으면 본문은 못 고치고 인삿말·맺음말만 고친다';


-- ------------------------------------------------------------
-- ① 앱이 만드는 문자 — 자리를 만들어 둔다
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, key, body, sort) values
  ('데일리리포트',      'auto', 'report',   '', 10),
  ('숙제 문자 (학생용)', 'auto', 'homework', '', 20),
  ('늦은 귀가 안내',     'auto', 'late',     '', 30)
on conflict (key) where key is not null do nothing;   -- 부분 유니크 인덱스라 조건을 같이 적어야 한다

-- 예전에 한 곳에 적어둔 인삿말·맺음말을 데일리리포트로 옮긴다 (한 번만)
update public.message_templates t
   set greeting = coalesce(t.greeting, i.config->>'greeting'),
       closing  = coalesce(t.closing,  i.config->>'closing')
  from public.integrations i
 where i.id = 'message'
   and t.key = 'report'
   and t.greeting is null
   and t.closing is null;


-- ------------------------------------------------------------
-- ② 내가 쓰는 문자 — 아직 없는 것만 만들어 둔다
--    문구는 초안입니다. 설정 화면에서 원장님 말투로 고쳐 쓰세요.
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, body, sort)
select v.name, v.kind, v.body, v.sort
  from (values
    ('지각 안내', 'late_in',
     '[{{학원명}}] {{학생명}} 학생 등원 안내

{{학생명}} 학생이 {{시간}}에 등원했습니다.
수업에 늦지 않도록 가정에서도 한 번 챙겨주시면 감사하겠습니다.', 40),

    ('보강 안내', 'makeup',
     '[{{학원명}}] {{학생명}} 학생 보강 안내

{{날짜}} {{시간}} 으로 보강 일정을 잡았습니다.

{{내용}}

시간이 어려우시면 말씀해주세요.', 50),

    ('단원평가 결과 안내', 'exam',
     '[{{학원명}}] {{학생명}} 학생 단원평가 결과

{{내용}}

부족한 부분은 다음 수업에서 다시 짚어주겠습니다.', 60),

    ('신규 상담 · 레벨테스트 일정 안내', 'consult',
     '[{{학원명}}] {{학생명}} 학생 상담 안내

문의해주셔서 감사합니다.

▶ 일시: {{날짜}} {{시간}}
▶ 장소: {{학원주소}}

{{내용}}

변경이 필요하시면 편하게 연락주세요.', 70)
  ) as v(name, kind, body, sort)
 where not exists (
   select 1 from public.message_templates m where m.name = v.name
 );

-- ============================================================
-- 0030
-- ============================================================

-- 0030: 알림톡 연결 · 할일 제목에 단원 넣기
--
-- ── 알림톡 ──────────────────────────────────────────────────
-- 알림톡은 **미리 승인받은 템플릿**으로만 나간다. 본문을 마음대로 못 쓴다.
-- 대신 템플릿 안의 #{변수} 는 보낼 때 채울 수 있다.
--
-- 그래서 문자 종류마다 두 가지를 적어둔다.
--   · 알림톡 템플릿 코드  — 카카오에서 승인받을 때 받은 코드
--   · 변수 연결          — 템플릿의 #{변수} 를 앱의 어떤 값에 붙일지
--
--     { "#{학생명}": "{{학생명}}", "#{내용}": "{{본문}}" }
--
-- 코드를 안 적으면 지금처럼 문자로 나간다. 종류마다 따로 정할 수 있다.
-- (데일리리포트만 알림톡, 나머지는 문자 — 이런 것도 된다)

alter table public.message_templates
  add column if not exists alimtalk_id   text,
  add column if not exists alimtalk_vars jsonb not null default '{}'::jsonb;

comment on column public.message_templates.alimtalk_id is
  '카카오에서 승인받은 알림톡 템플릿 코드. 비어 있으면 문자로 나간다';
comment on column public.message_templates.alimtalk_vars is
  '알림톡 템플릿의 #{변수} 를 앱의 값에 붙인 것. {"#{이름}":"{{학생명}}"}';


-- ── 할일 제목에 단원을 넣을 수 있게 ─────────────────────────
-- 0028 의 기본값은 학생 이름만 들어갔다. 무슨 단원인지가 빠져서
-- 할일만 보고는 뭘 출제해야 하는지 알 수 없었다.
--   {학생} 학생 이름   {단원} 배정한 단원   {교재} 그 교재   {숙제} 숙제 이름
-- 값이 비면 앞뒤 구분자까지 알아서 정리된다.
update public.homework_items
   set prep_task = '{학생}-단원평가-{단원}'
 where prep_task = '{학생} 단원평가 출제';

-- ============================================================
-- 0031
-- ============================================================

-- 0031: 월말 리포트 · 단원평가 결과
--
-- 하루치 리포트는 그날만 보여준다. 한 달을 모아 보면 다른 게 보인다 —
-- 숙제를 얼마나 해왔는지, 몇 번 왔는지, 단원평가는 어땠는지.
--
-- 새로 입력받는 것은 **단원평가 결과 하나뿐**이다. 나머지는 그 달의
-- 데일리리포트를 다시 세면 나온다.

-- ------------------------------------------------------------
-- 1. 단원평가 결과
--    '단원평가 대비 복습' 을 내주면 할일이 생기고(0028), 시험을 보면 여기에 남는다.
-- ------------------------------------------------------------
create table if not exists public.unit_exams (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  date        date not null default current_date,
  name        text not null,                       -- 무슨 단원평가인지 (단원명)
  textbook_id uuid references public.textbooks(id) on delete set null,
  total       int,                                 -- 전체 문항
  score       int,                                 -- 맞은 개수 (보여줄 때는 틀린 개수로 뒤집는다)
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists unit_exams_student_idx on public.unit_exams (student_id, date);

alter table public.unit_exams enable row level security;
drop policy if exists staff_all on public.unit_exams;
create policy staff_all on public.unit_exams
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.unit_exams;
create policy own_read on public.unit_exams
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = unit_exams.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = unit_exams.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 2. 월말 리포트
--    학생 한 명의 한 달에 한 줄. 문구는 자동으로 만들고, 고치면 여기 담는다.
-- ------------------------------------------------------------
create table if not exists public.monthly_reports (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  ym         text not null,                        -- "2026-07"
  text       text,                                 -- 손으로 고친 문구 (비면 자동 문구)
  note       text,                                 -- 이 학생에게만 덧붙일 한마디
  sent_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, ym)
);
create index if not exists monthly_reports_ym_idx on public.monthly_reports (ym);

alter table public.monthly_reports enable row level security;
drop policy if exists staff_all on public.monthly_reports;
create policy staff_all on public.monthly_reports
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.monthly_reports;
create policy own_read on public.monthly_reports
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = monthly_reports.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = monthly_reports.student_id
                 and ps.parent_profile_id = auth.uid())
  );


-- ------------------------------------------------------------
-- 3. 월말 리포트도 문자 문구에서 인삿말·맺음말을 정한다
-- ------------------------------------------------------------
insert into public.message_templates (name, kind, key, body, sort) values
  ('월말 리포트', 'auto', 'monthly', '', 35)
on conflict (key) where key is not null do nothing;

-- ============================================================
-- 0032
-- ============================================================

-- 0032: 점수 기준을 하나로 — **성취도 %**
--
-- 어떤 줄은 높아야 좋고(숙제 성취도) 어떤 줄은 낮아야 좋으면(오답률)
-- 읽는 사람이 매번 뒤집어 생각해야 한다. 전부 **높을수록 좋은 %** 로 맞춘다.
--
--   단어시험    18/20  →  90% (2개 틀림)
--   단원평가    17/20  →  85% (3개 틀림)
--   숙제 성취도          88%
--
-- 통과선도 같은 방향으로 적는다. "오답 10% 이내" 와 "성취도 90% 이상" 은 같은 말이다.
update public.integrations
   set config = (config - 'wordWrongPct')
              || jsonb_build_object(
                   'wordPassPct',
                   coalesce(100 - (config->>'wordWrongPct')::int, 90)
                 )
 where id = 'warning'
   and config ? 'wordWrongPct';

insert into public.integrations (id, enabled, config) values
  ('warning', true, '{"reflectionAt":3,"wordPassPct":90,"countLate":true,"countHomework":true,"countWordTest":true}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- 0033
-- ============================================================

-- 0033: 학생용 — 순서대로 · 시간을 재면서
--
-- 등원해서 무엇부터 할지 학생이 매번 묻지 않게 **순서대로** 보여준다.
-- 그리고 시작하려면 **타이머를 눌러야** 한다. 얼마나 걸렸는지가 남으면
-- "오래 걸렸지만 끝까지 했다" 를 알아볼 수 있다.
--
-- 다만 **선생님을 기다려야 하는 것**(단어시험, 숙제 검사 …)은 타이머를 켜면
-- 기다린 시간까지 공부한 시간으로 잡힌다. 그런 항목은 타이머를 안 쓴다.
-- 어떤 항목이 그런지는 학습 항목 화면에서 정한다.

alter table public.homework_items
  add column if not exists no_timer boolean not null default false;

comment on column public.homework_items.no_timer is
  '선생님 확인이 필요해 기다릴 수 있는 항목. 학생 화면에서 타이머를 안 띄운다';

-- 처음 쓰는 사람이 바로 쓸 수 있게, 기다리는 게 뻔한 것들은 켜 둔다
update public.homework_items
   set no_timer = true
 where no_timer = false
   and (name like '%시험%' or name like '%검사%' or name like '%채점%' or name like '%상담%');


-- ------------------------------------------------------------
-- 공부한 시간
--   한 번 시작하고 멈출 때마다 한 줄. 여러 번 나눠 해도 그대로 쌓인다.
-- ------------------------------------------------------------
create table if not exists public.study_sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  date             date not null,
  homework_item_id uuid references public.homework_items(id) on delete set null,
  stay_task_id     uuid references public.stay_tasks(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  seconds          int,                    -- 멈출 때 계산해 둔다 (매번 빼지 않게)
  created_at       timestamptz not null default now()
);
create index if not exists study_sessions_student_idx
  on public.study_sessions (student_id, date);

alter table public.study_sessions enable row level security;
drop policy if exists staff_all on public.study_sessions;
create policy staff_all on public.study_sessions
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 것만** 쓰고 읽는다 (타이머를 누르는 건 학생이다)
drop policy if exists own_all on public.study_sessions;
create policy own_all on public.study_sessions
  for all to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = study_sessions.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
            where s.id = study_sessions.student_id and s.profile_id = auth.uid())
  );

drop policy if exists parent_read on public.study_sessions;
create policy parent_read on public.study_sessions
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
            where ps.student_id = study_sessions.student_id
              and ps.parent_profile_id = auth.uid())
  );

-- ============================================================
-- 0034
-- ============================================================

-- 0034: 등원 학습 · 학생이 누르는 '학습 완료'
--
-- 0033 에서 타이머를 **집에서 하는 숙제**에 붙였는데, 정작 필요한 것은
-- **등원해서 학원에서 하는 학습**이었다. 실시간으로 남아야 하는 쪽은 이쪽이다.
--
-- 흐름
--   선생님  오늘 수업에서 "오늘 학원에서 할 것" 을 정해준다   (status = 'inclass')
--   학생    등원해서 위에서부터 하나씩 ▶시작 → ■학습 완료
--   학생    '검사 받을게요' 를 따로 안 누른다. **학습 완료가 곧 검사 대기**다
--   선생님  손이 비면 대기줄을 보고 **한꺼번에** 검사한다
--
-- 학생이 누른 완료(student_done_at)와 선생님이 찍은 결과(status)는 다른 것이다.
-- 학생은 "다 했어요" 를 말할 뿐이고, 잘했는지는 선생님이 본다.

alter table public.daily_report_items
  add column if not exists student_done_at timestamptz;

comment on column public.daily_report_items.student_done_at is
  '학생이 학습 완료를 누른 시각. 선생님 검사 결과(status)와는 다른 것이다';

comment on column public.daily_report_items.status is
  'assigned(다음 수업 숙제) | inclass(오늘 학원에서 할 것) | done | weak | missing | verified';

-- 타이머 줄에 등원 학습도 붙을 수 있게
alter table public.study_sessions
  add column if not exists kind text not null default 'home';

comment on column public.study_sessions.kind is
  'inclass(학원에서) | home(집에서). 나중에 습관을 볼 때 나눠 본다';

-- ============================================================
-- 0035
-- ============================================================

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

-- ============================================================
-- 0036
-- ============================================================

-- 0036: '선생님과 함께' 를 실제에 맞게 좁힌다
--
-- 0033 에서 이름에 시험·검사·채점·상담이 들어가면 타이머를 껐다.
-- 그런데 **단어시험은 학생이 혼자 본다.** 선생님을 기다려야 하는 것은
-- 구두테스트와 검사(숙제 검사·채점)뿐이다.
--
-- 잘못 꺼두면 두 가지가 어긋난다.
--   · 혼자 하는 것에 타이머가 안 붙어 시간이 안 쌓인다
--   · 등원하자마자 전원이 동시에 선생님을 기다리는 것처럼 잡힌다
--
-- 여기서 한 번 바로잡는다. 이후로는 학습 항목 화면에서 정하시면 된다.
update public.homework_items
   set no_timer = (
     name like '%구두%'
     or name like '%검사%'
     or name like '%채점%'
     or name like '%상담%'
   );
