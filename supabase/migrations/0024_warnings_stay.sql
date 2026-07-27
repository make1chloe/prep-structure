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
