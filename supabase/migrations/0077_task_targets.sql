-- 0077: 일정을 **누구에게** 인가
--
-- 지금은 전달 대상이 전체 · 반 · 학교/학년 셋뿐이고, 학교와 학년은 **글자로**
-- 적는다. 「신송중」이라고 쳐야 하는데 「신송중학교」라고 치면 아무에게도 안 간다.
-- 조용히 안 간다 — 화면에는 저장됐다고 뜬다.
--
-- 두 가지를 고친다.
--   1) 학생을 **골라서** 지목할 수 있게 (한 명이든 여럿이든)
--   2) 학교는 글자가 아니라 **학교 표(0076)를 가리키게**
--
-- 옛 칸(deliver_school 글자)은 **안 지운다.** 이미 적어둔 일정이 있고,
-- school_id 가 비어 있으면 예전처럼 글자로 맞춘다.

alter table public.tasks
  add column if not exists deliver_student_ids uuid[] not null default '{}',
  add column if not exists deliver_school_id   uuid references public.schools(id) on delete set null;

comment on column public.tasks.deliver_student_ids is
  '이 일정을 받을 학생을 직접 고른 것. deliver_scope = student 일 때 쓴다';
comment on column public.tasks.deliver_school_id is
  '학교 표를 가리킨다 (0076). 비어 있으면 옛 deliver_school 글자로 맞춘다';

create index if not exists tasks_deliver_school_idx
  on public.tasks (deliver_school_id) where deliver_school_id is not null;

-- 이미 적어둔 학교 글자를 학교 표에 이어 붙인다.
-- school_key() 로 맞추므로 「신송중」과 「신송중학교」가 같은 곳으로 간다.
update public.tasks t
   set deliver_school_id = s.id
  from public.schools s
 where t.deliver_school_id is null
   and coalesce(t.deliver_school, '') <> ''
   and public.school_key(s.name) = public.school_key(t.deliver_school);
