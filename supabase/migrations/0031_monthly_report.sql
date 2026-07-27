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
