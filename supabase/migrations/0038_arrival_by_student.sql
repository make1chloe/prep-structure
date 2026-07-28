-- 0038: 등원 체크는 **학생이** 누른다
--
-- 0037 에서 폰·숙제 제출을 daily_reports 에 넣고 선생님이 찍게 했다.
-- 그런데 이건 **학생이 하는 일**이다. 들어와서 폰 내고 숙제 내는 건 아이 몫이고,
-- 선생님은 다 냈는지 눈으로 확인만 하면 된다.
--
-- 출석 체크는 **외부 앱**에서 한다. 우리 화면에서 등원 절차는 둘뿐이다.
--   ① 핸드폰 제출   ② 숙제 제출
--
-- 학생이 자기 것을 쓰려면 권한이 필요한데, daily_reports 를 통째로 열어주면
-- 점수나 리포트까지 건드릴 수 있다. 그래서 **따로 표를 둔다.**

create table if not exists public.arrival_checks (
  student_id  uuid not null references public.students(id) on delete cascade,
  date        date not null,
  phone_at    timestamptz,      -- 핸드폰 낸 시각
  homework_at timestamptz,      -- 숙제 낸 시각
  primary key (student_id, date)
);
create index if not exists arrival_checks_date_idx on public.arrival_checks (date);

alter table public.arrival_checks enable row level security;

drop policy if exists staff_all on public.arrival_checks;
create policy staff_all on public.arrival_checks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생은 **자기 것만** 쓰고 읽는다
drop policy if exists own_all on public.arrival_checks;
create policy own_all on public.arrival_checks
  for all to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = arrival_checks.student_id and s.profile_id = auth.uid())
  )
  with check (
    exists (select 1 from public.students s
            where s.id = arrival_checks.student_id and s.profile_id = auth.uid())
  );

drop policy if exists parent_read on public.arrival_checks;
create policy parent_read on public.arrival_checks
  for select to authenticated
  using (
    exists (select 1 from public.parent_student ps
            where ps.student_id = arrival_checks.student_id
              and ps.parent_profile_id = auth.uid())
  );

-- 0037 에서 만든 daily_reports 의 두 칸은 이제 안 쓴다.
-- 지우지는 않는다 — 이미 찍어둔 게 있을 수 있고, 지워서 얻을 게 없다.
comment on column public.daily_reports.phone_in is
  '안 씀 (0038 부터 arrival_checks 로 옮김)';
comment on column public.daily_reports.homework_in is
  '안 씀 (0038 부터 arrival_checks 로 옮김)';
