-- 0052: 내신 대비 자료 관리
--
-- 내신 교재를 따로 관리하지 않는다. 교재도 단원도 문제도 **기존 교재DB**에
-- 그대로 들어간다 (0051 에서 문제번호까지 넣었다).
-- 늘어나는 것은 **자료** 하나뿐이다.
--
--   시험   학교 + 학기 + 시험일          옥련여고 26' 1학기기말 · 7/8
--   범위   그 시험에 나오는 단원·문제들   2406H1 › 어법 › 29,30,33번
--   자료   그 범위에 쓸 자료 한 장        이그잼A (만들 것) · 백발백중 (구입)
--   배정   자료 ↔ 학생                    이그잼A → 김서은, 노주하
--
-- 범위를 지우면 그 아래 자료와 배정도 같이 사라진다 (원장님 판단).
-- 되돌릴 수 없으므로 화면에서 분명히 알린다.

-- ------------------------------------------------------------
-- 1. 시험
-- ------------------------------------------------------------
create table if not exists public.prep_exams (
  id         uuid primary key default gen_random_uuid(),
  school     text not null,
  term       text not null,                     -- "26' 1학기기말"
  grade      text,                              -- 고1 · 중2 (비면 학교 전체)
  exam_date  date,                              -- 영어 시험일 — 급한 순서를 이걸로 잡는다
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists prep_exams_date_idx on public.prep_exams (exam_date);

-- ------------------------------------------------------------
-- 2. 범위 — 교재 단원·문제를 골라 담는다
-- ------------------------------------------------------------
create table if not exists public.prep_scopes (
  id         uuid primary key default gen_random_uuid(),
  exam_id    uuid not null references public.prep_exams(id) on delete cascade,
  name       text,                              -- 비면 담긴 단원으로 이름을 만든다
  unit_ids   uuid[] not null default '{}',      -- textbook_units.id (단원이든 문제든)
  note       text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists prep_scopes_exam_idx on public.prep_scopes (exam_id, sort);

-- ------------------------------------------------------------
-- 3. 자료
--    단계는 자료마다 다르다. 필요한 것만 켠다.
--    구입 자료는 파는 쪽 업로드가 늦어질 수 있어서 주문일을 따로 둔다.
-- ------------------------------------------------------------
create table if not exists public.prep_materials (
  id          uuid primary key default gen_random_uuid(),
  scope_id    uuid not null references public.prep_scopes(id) on delete cascade,
  name        text not null,
  source      text not null default 'make',     -- make(만든다) / buy(산다)
  ordered_on  date,                             -- 산 것: 주문한 날 (며칠째 안 왔는지)
  arrived_on  date,                             -- 산 것: 받은 날
  -- 필요한 단계만 켠다
  need_make   boolean not null default true,
  need_print  boolean not null default true,
  need_card   boolean not null default false,   -- 클래스카드 업로드
  need_hand   boolean not null default true,    -- 배부
  need_solve  boolean not null default true,    -- 풀이
  need_grade  boolean not null default true,    -- 채점
  -- 학생과 무관한 단계는 여기서 끝난다
  made_at     timestamptz,
  printed_at  timestamptz,
  card_at     timestamptz,
  note        text,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists prep_materials_scope_idx on public.prep_materials (scope_id, sort);

-- ------------------------------------------------------------
-- 4. 학생 배정 — 자료는 범위로 만들지만 배정은 학생마다 다르다
--    배부·풀이·채점은 학생마다 따로 간다.
-- ------------------------------------------------------------
create table if not exists public.prep_assignments (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.prep_materials(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  handed_at   timestamptz,                      -- 배부
  solved_at   timestamptz,                      -- 풀이 완료
  graded_at   timestamptz,                      -- 채점
  result      text,                             -- done / weak / missing
  score       text,                             -- "18/20" 같은 자유 표기
  note        text,
  created_at  timestamptz not null default now(),
  unique (material_id, student_id)
);
create index if not exists prep_assign_student_idx on public.prep_assignments (student_id);

-- ------------------------------------------------------------
-- 잠금 — 선생님만. 학생은 자기 배정만 읽는다.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['prep_exams','prep_scopes','prep_materials','prep_assignments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated
         using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

drop policy if exists own_read on public.prep_assignments;
create policy own_read on public.prep_assignments
  for select to authenticated
  using (student_id = public.my_student_id());
