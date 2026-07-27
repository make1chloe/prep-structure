-- 0028: 숙제를 배정하면 **내 할일**이 자동으로 생긴다
--
-- 단원평가 대비 복습을 숙제로 내주면, 다음 수업 전에 **내가 문제를 출제해야 한다.**
-- 지금까지는 그걸 따로 기억하고 있어야 했다.
--
-- 그래서 숙제 항목에 "이걸 배정하면 이런 할일이 생긴다" 를 적어둔다.
-- 이름을 코드에 박지 않는다 — 나중에 다른 숙제에도 붙일 수 있어야 하기 때문이다.
--   예) 단원평가 대비 복습  →  "{학생} 단원평가 출제"
--       수행평가대비 워크북  →  "{학생} 수행평가 자료 준비"
-- {학생} 자리에 학생 이름이 들어간다. 비워두면 할일을 만들지 않는다.

alter table public.homework_items
  add column if not exists prep_task text;

comment on column public.homework_items.prep_task is
  '이 숙제를 배정하면 만들 내 할일의 제목. {학생} 은 학생 이름으로 바뀐다. 비면 안 만든다';

-- 같은 배정으로 할일이 두 번 생기지 않게 (리포트를 여러 번 저장해도 하나)
alter table public.tasks
  add column if not exists auto_key text;
create unique index if not exists tasks_auto_key_idx
  on public.tasks (auto_key) where auto_key is not null;

comment on column public.tasks.auto_key is
  '자동으로 만든 할일의 열쇠. 값이 있으면 앱이 만든 것이다 (사람이 만든 건 비어 있다)';

-- 단원평가 대비 복습이 아직 없으면 만들어 둔다
insert into public.homework_items (name, category, sort) values
  ('단원평가 대비 복습', '내신', 590)
on conflict (name) do nothing;

-- 이름에 '단원평가' 가 들어간 항목은 출제 할일을 켜준다 (직접 껐으면 그대로 둔다)
update public.homework_items
   set prep_task = '{학생} 단원평가 출제'
 where prep_task is null
   and name like '%단원평가%';
