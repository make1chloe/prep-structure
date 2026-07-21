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
