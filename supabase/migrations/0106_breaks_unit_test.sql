-- ============================================================
-- 0106. 쉬는 시간 · 단원평가 결과 내기
--
-- 원장님 (2026-08-07)
--   「등원학습 아래에 쉬는 시간 버튼 - 개별진도라 가끔 쉬는 시간이 제각각임.
--    몇분 쉬었는지 기록하고 특이사항 있을때만 선생님 대시보드에 알림
--    (반복적으로 5분이상이거나, 1회 10분이상일때)」
--   「숙제에서 단원평가를 내가 미리 배정 함 - 다음 시간에 등원 해서
--    학생이 결과만 제출 함」
--
-- ── 1) 쉬는 시간 ────────────────────────────────────────
--
-- 개별 진도라 쉬는 때가 아이마다 다르다. 지금은 아이가 자리를 비워도
-- **아무 데도 안 남는다.** 5분 다녀온 것과 20분 사라진 것이 똑같아 보인다.
--
-- **다 알릴 수는 없다.** 한 반에 열 명이 하루에 두 번씩 쉬면 스무 번이
-- 울린다. 그러면 알림을 꺼버리시게 되고, 정작 봐야 할 것까지 같이 죽는다.
-- 그래서 **눈에 띄는 것만** 올린다 (규칙은 lib/breaks.js 한 곳에).
--
-- ── 2) 단원평가 ─────────────────────────────────────────
--
-- 단원평가는 원장님이 **미리 숙제로 배정**하신다. 아이는 다음 시간에 와서
-- **결과만** 낸다. 그러니 아이가 단원 이름을 적을 일이 없다 — 배정에 이미
-- 붙어 있다. 적게 하면 제각각 적어서 같은 단원이 여러 이름으로 쌓인다.
--
-- 학습 항목에 표시 한 칸만 둔다. 그 항목으로 배정된 숙제는 아이 화면에서
-- 「결과 내기」 가 열린다.
-- ============================================================

create table if not exists public.study_breaks (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  date       date not null default (now() at time zone 'Asia/Seoul')::date,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  -- 끝낼 때 셈해서 넣는다. 나중에 세면 화면마다 다르게 셀 수 있다
  minutes    int,
  created_at timestamptz not null default now()
);

create index if not exists study_breaks_day_idx on public.study_breaks (date, student_id);

alter table public.study_breaks enable row level security;

-- 아이는 **자기 것만** — 남의 쉬는 시간을 만들거나 고칠 수 없다
drop policy if exists breaks_own on public.study_breaks;
create policy breaks_own on public.study_breaks
  for all to authenticated
  using (student_id = public.my_student_id())
  with check (student_id = public.my_student_id());

-- 선생님은 다 본다 (현황판·대시보드가 이걸 읽는다)
drop policy if exists breaks_staff on public.study_breaks;
create policy breaks_staff on public.study_breaks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 어머니도 우리 아이 것은 보신다 (문제가 됐을 때 이야기가 되려면 근거가 있어야 한다)
drop policy if exists breaks_parent on public.study_breaks;
create policy breaks_parent on public.study_breaks
  for select to authenticated
  using (
    exists (
      select 1 from public.parent_student ps
       where ps.student_id = study_breaks.student_id
         and ps.parent_profile_id = auth.uid()
    )
  );


-- ── 단원평가로 쓰는 학습 항목 ────────────────────────────
--
-- 이 표시가 붙은 항목으로 배정하면, 아이 화면에 「결과 내기」 가 열린다.
alter table public.homework_items
  add column if not exists unit_test boolean not null default false;

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.breaks_on()
returns boolean language sql immutable as $$ select true $$;
