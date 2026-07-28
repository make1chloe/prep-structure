-- 0042: 특강 기한 · 반별 출결
--
-- 두 가지를 푼다.
--
-- 1) 특강은 끝난다. 끝난 특강이 수강반 목록·오늘 수업·수강료에 계속
--    남아 있으면 매번 눈으로 걸러내야 한다.
--    → 종료일을 넣어두면 그 날이 지나는 순간 알아서 내려간다.
--      "보관 버튼을 누른다" 를 기억하지 않아도 되게.
--
-- 2) 정규는 왔는데 특강만 빠지는 날이 있다. 결석·보강·수강료가
--    반마다 따로 계산되므로, 그날 출결 한 줄로는 표현이 안 된다.
--    → 반별 출결을 따로 남긴다.
--
--    ※ 기존 attendance(하루 한 줄)는 **건드리지 않는다.**
--      그 표는 30군데 넘는 화면이 "학생·날짜에 한 줄" 을 전제로 읽고 쓴다.
--      수업 중에 쓰는 출결을 흔드는 것보다, 어쩌다 있는 특강 결석을
--      옆 표에 따로 남기는 쪽이 안전하다.
--      attendance = 그 학생이 그날 학원에 왔는가 (정규 기준)
--      class_attendance = 그날 그 반에 들어왔는가 (특강 등)

-- ------------------------------------------------------------
-- 1. 반에 기간을 준다
-- ------------------------------------------------------------
alter table public.classes add column if not exists starts_on  date;
alter table public.classes add column if not exists ends_on    date;
-- 기한 없이 흐지부지 끝나는 반도 있어서, 손으로 내리는 길도 남긴다
alter table public.classes add column if not exists archived_at timestamptz;

comment on column public.classes.starts_on is '개강일 (정규반은 비워둠 = 무기한)';
comment on column public.classes.ends_on   is '종강일 — 지나면 목록·오늘 수업·수강료에서 자동으로 내려간다';
comment on column public.classes.archived_at is '손으로 보관한 시각 (되살리면 null)';

create index if not exists classes_term_idx on public.classes (ends_on);


-- ------------------------------------------------------------
-- 2. 반별 출결
--    정규 출결은 attendance 에 그대로 남고, 여기엔 특강처럼
--    따로 세야 하는 반의 출결만 쌓인다.
-- ------------------------------------------------------------
create table if not exists public.class_attendance (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null default (now() at time zone 'Asia/Seoul')::date,
  status     attendance_status not null,
  makeup_of  date,                     -- 보강이면 원 결석일 (수강료가 여기 걸린다)
  note       text,
  created_at timestamptz not null default now(),
  unique (class_id, student_id, date)
);

create index if not exists class_attendance_date_idx    on public.class_attendance (date);
create index if not exists class_attendance_student_idx on public.class_attendance (student_id, date);

alter table public.class_attendance enable row level security;

drop policy if exists staff_all on public.class_attendance;
create policy staff_all on public.class_attendance
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists own_read on public.class_attendance;
create policy own_read on public.class_attendance
  for select to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = class_attendance.student_id and s.profile_id = auth.uid())
    or exists (select 1 from public.parent_student ps
               where ps.student_id = class_attendance.student_id
                 and ps.parent_profile_id = auth.uid())
  );
