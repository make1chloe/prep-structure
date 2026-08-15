-- 다음 달 일정 확정 (0123) — 회차 확정 워크플로
--
-- 원장님 (2026-08-14~15):
--   「매달 25일까지 학부모 어플 통해서 다음달 결석일정 확인하고, 공휴일·
--    시험기간 등 전체 확인 후 학생별 회차 일정을 확정해야 함. 안 하면 알림.」
--   「학부모가 일정 제출 후 1차 확인 버튼 눌러서 일정을 확정하는 과정」
--
-- 결석 제출은 이미 requests 로 들어온다. 여기는 **확인 도장 두 개**만 적는다:
--   parent_at    학부모가 「다음 달 일정 1차 확인」 을 누른 시각
--                (결석이 없어도 누른다 — 「없음」 도 확인이다)
--   principal_at 원장님이 겹침(공휴일·시험)까지 보고 회차를 확정한 시각
-- 수납 안내는 앱 밖 일이라 여기서는 상태만 보인다.
create table if not exists public.month_confirms (
  student_id   uuid not null references public.students(id) on delete cascade,
  ym           text not null,                       -- '2026-09'
  parent_at    timestamptz,
  parent_by    uuid references public.profiles(id) on delete set null,
  principal_at timestamptz,
  primary key (student_id, ym)
);

alter table public.month_confirms enable row level security;

-- 선생님은 전부
drop policy if exists staff_all on public.month_confirms;
create policy staff_all on public.month_confirms
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학부모·학생은 자기 아이 것만 보고, 학부모 확인 도장만 찍는다
drop policy if exists own_month_confirms on public.month_confirms;
create policy own_month_confirms on public.month_confirms
  for select to authenticated
  using (
    exists (select 1 from public.students s where s.id = student_id and s.profile_id = auth.uid())
    or exists (
      select 1 from public.parent_student ps
      where ps.student_id = month_confirms.student_id and ps.parent_profile_id = auth.uid()
    )
  );

drop policy if exists own_month_confirms_write on public.month_confirms;
create policy own_month_confirms_write on public.month_confirms
  for insert to authenticated
  with check (
    exists (
      select 1 from public.parent_student ps
      where ps.student_id = month_confirms.student_id and ps.parent_profile_id = auth.uid()
    )
  );

drop policy if exists own_month_confirms_update on public.month_confirms;
create policy own_month_confirms_update on public.month_confirms
  for update to authenticated
  using (
    exists (
      select 1 from public.parent_student ps
      where ps.student_id = month_confirms.student_id and ps.parent_profile_id = auth.uid()
    )
  );

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면 · 관리자 배지가 부른다)
create or replace function public.month_confirm_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.month_confirm_on() to authenticated;
