-- 0054: 내신 자료도 순서대로
--
-- 교재에 루틴이 있듯 내신 자료에도 순서가 있다.
--   이그잼 변형문제 → 분석지 → 워크북
-- 그런데 학생마다 다르다. 어떤 아이는 분석지를 건너뛰고, 어떤 아이는
-- 워크북을 먼저 한다.
--
-- 새 표를 만들지 않는다. 순서는 두 군데에만 있으면 된다.
--   1. 종류에 매긴 순서  = 기본 루틴 (이미 prep_material_types.sort 에 있다)
--   2. 학생 배정에 매긴 순서 = 그 학생만의 순서   ← 여기만 새로
-- 배정에 순서가 없으면 기본 루틴을 따른다.

alter table public.prep_assignments
  add column if not exists sort int;

comment on column public.prep_assignments.sort is
  '이 학생에게 낼 순서. 비면 자료·종류에 매긴 기본 순서를 따른다';

-- 지금 하고 있는 것 / 다음에 낼 것을 빨리 찾기 위해
create index if not exists prep_assign_next_idx
  on public.prep_assignments (student_id, sort) where graded_at is null;
