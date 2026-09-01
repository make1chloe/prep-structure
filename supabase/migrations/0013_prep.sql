-- ─────────────────────────────────────────────────────────────
-- 0013 · 내신 — 「남은 것」 목록 (원장님 ㉟)
-- ⚠️ 시험 하나를 **단계 아홉으로 세우지 않는다.** 학교마다 시작이 다르고
--    범위가 중간에 바뀐다. 마감만 있고 **순서는 없다.**
--    순서가 있는 것은 **자료 하나 안에서만** — 만들기→인쇄→배부→풀이→채점.
-- ─────────────────────────────────────────────────────────────
create table v2.prep_scope (              -- 시험 범위 — **교재 단원을 고른다**
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references v2.exams(id) on delete restrict,
  book_id uuid references v2.books(id) on delete restrict,
  unit_id uuid references v2.units(id) on delete restrict,
  free_note text,                          -- 단원으로 못 고르는 것만
  added_on date not null default v2.today(),
  removed_on date,                         -- 학교가 빼면 **지우지 않고** 날짜를 찍는다
  created_at timestamptz not null default now()
);
create table v2.material_type (           -- 자료 종류 — 루틴이 여기 붙는다
  id uuid primary key default gen_random_uuid(),
  name text not null unique,               -- 분석지·워크북·어법지·변형문제·클래스카드
  steps text[] not null default '{make,print,hand,solve,score}',  -- 클카는 인쇄가 없다
  state text not null default 'active' check (state in ('active','retired')),
  sort int not null default 0
);
create table v2.material (                -- 자료 한 장
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references v2.exams(id) on delete restrict,
  type_id uuid not null references v2.material_type(id) on delete restrict,
  title text not null,
  scope_id uuid references v2.prep_scope(id) on delete set null,
  reuse_of uuid references v2.material(id) on delete set null,   -- ♻️ 지난번 것
  made_at timestamptz, printed_at timestamptz,
  state text not null default 'todo' check (state in ('todo','made','printed','done','dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column v2.material.reuse_of is
  '♻️ 같은 범위로 지난번에 만든 것. **있으면 「만들기」가 체크된 채로** 할 일에 선다(원장님 ㊵)';
create table v2.material_item (           -- 자료 안의 체크 목록
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references v2.material(id) on delete cascade,
  item_id uuid references v2.learn_items(id) on delete restrict,
  unit_id uuid references v2.units(id) on delete restrict,
  sort int not null default 0, done_at timestamptz
);
create table v2.material_give (           -- 배부(원장)와 수령(아이)은 **다른 사실**
  material_id uuid not null references v2.material(id) on delete cascade,
  student_id uuid not null references v2.students(id) on delete restrict,
  handed_at timestamptz,                   -- 원장이 나눠 줌
  got_at timestamptz,                      -- 아이가 받았다고 찍음
  stage text not null default 'none' check (stage in ('none','got','doing','done')),
  due_on date,                             -- 아이가 스스로 약속한 마감
  primary key (material_id, student_id)
);
do $$ declare t text; begin
  foreach t in array array['material'] loop
    execute format('create trigger %I_touch before update on v2.%I for each row execute function v2.touch_row()',t,t); end loop;
  foreach t in array array['prep_scope','material_type','material','material_item','material_give'] loop
    execute format('create trigger %I_audit after insert or update or delete on v2.%I for each row execute function v2.audit_row()',t,t); end loop;
end $$;
