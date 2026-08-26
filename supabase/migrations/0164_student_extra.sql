-- **특강 = 재원생 속성** (특강-이행계획서-v2 §1 — 1단계).
--
-- 특강은 수업(classes 행)이 아니라 「학생의 추가 시간+기간」 이다
-- (원장님 확정 2026-08-26). 반으로 만들면 같은 날 판이 둘로 갈라지고
-- (#9 겹침 저장 사고), 출결이 이중이 되고, 학년 요금표가 특강비를
-- 덮었다 — 전부 모델이 만든 병이라 모델을 바꾼다. 이 마이그는 표만
-- 깐다(소비 0곳) — 화면·백필·수강료 전환은 다음 커밋들.
--
-- 되돌리기:
--   drop table if exists public.student_extra_absences;
--   drop table if exists public.student_extra_schedules;

create table if not exists public.student_extra_schedules (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students(id) on delete cascade,
  label       text not null,          -- '여름 내신 특강' — 화면·문자에 그대로
  days        text[] not null,
  start_time  time not null,
  end_time    time,
  from_date   date not null,
  to_date     date not null,          -- 특강은 끝난다 (무기한 금지)
  -- 학생별 정액. 결석해도 안 깎는다 (원장님 확정 — 보강도 예외적 수동).
  -- null = 별도 청구 없음
  fee         int,
  off_dates   date[] not null default '{}',  -- 이 특강만 쉬는 날
  source      text not null default 'manual', -- 'migrated' = 백필분 (되돌리기 표적)
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists ses_student_to
  on public.student_extra_schedules (student_id, to_date);
-- 같은 이름 특강이 두 기수면 공지 대상이 섞인다
create unique index if not exists ses_label_once
  on public.student_extra_schedules (student_id, label, from_date);

-- 「정규는 왔는데 특강만 빠짐」 — 내부 기록 전용 (리포트·학부모 발송
-- 제외는 attendance_kind 에 안 들어가는 것으로 저절로 성립).
-- status 'makeup' = 예외적으로 보강을 잡아준 기록.
create table if not exists public.student_extra_absences (
  id          uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.student_extra_schedules(id) on delete cascade,
  date        date not null,
  status      text not null default 'absent' check (status in ('absent','makeup')),
  note        text,
  unique (schedule_id, date)
);

alter table public.student_extra_schedules enable row level security;
drop policy if exists staff_all on public.student_extra_schedules;
create policy staff_all on public.student_extra_schedules
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

alter table public.student_extra_absences enable row level security;
drop policy if exists staff_all on public.student_extra_absences;
create policy staff_all on public.student_extra_absences
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 돌아가는지 손가락 하나로 확인하는 탐침
create or replace function public.student_extra_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.student_extra_on() to authenticated;
