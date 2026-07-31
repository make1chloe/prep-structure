-- 0066: 달력을 학생·학부모와 나눈다
--
-- 학사일정, 휴강, 시험 기간, 특강. 지금은 원장님 화면에만 있고, 아이와
-- 학부모는 카톡으로 물어본다. 물어보게 하지 말고 **그냥 보이게** 한다.
--
-- 다만 전부 보이면 안 된다.
--   · 할일(kind='todo') — 원장님이 처리할 일이다. 절대 나가지 않는다
--   · 일정 중에도 나만 볼 것이 있다 (상담 약속, 원장님 개인 일정)
--
-- 그래서 **일정은 기본으로 보이고, 나만 볼 것만 따로 잠근다.**
-- 반대로 하면(기본 숨김) 매번 공개를 눌러야 하고, 그러면 아무것도 안 보인다.

alter table public.tasks
  add column if not exists private boolean not null default false;

comment on column public.tasks.private is
  '나만 보기. 켜면 학생·학부모 달력에서 빠진다. 할일(kind=todo)은 이것과 무관하게 안 나간다';


-- 학생·학부모는 **일정만, 잠그지 않은 것만** 읽는다
drop policy if exists task_read_shared on public.tasks;
create policy task_read_shared on public.tasks
  for select to authenticated
  using (
    coalesce(tasks.kind, 'event') <> 'todo'
    and coalesce(tasks.private, false) = false
  );
