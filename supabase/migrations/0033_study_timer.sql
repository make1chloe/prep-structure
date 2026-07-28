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

-- 처음 쓰는 사람이 바로 쓸 수 있게, 기다리는 게 뻔한 것들은 켜 둔다.
-- (단어시험은 학생이 혼자 보므로 뺀다 — 0036 에서 바로잡았다)
update public.homework_items
   set no_timer = true
 where no_timer = false
   and (name like '%구두%' or name like '%검사%' or name like '%채점%' or name like '%상담%');


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
