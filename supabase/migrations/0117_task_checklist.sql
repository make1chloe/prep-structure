-- 0117: 할일 하위목록 (체크리스트형)
--
-- 원장님 (2026-08-11) — 「할일의 하위목록을 만들 수 있어? 되풀이 할일 포함」
-- → 「체크리스트형 (추천)」 을 고르심: 목록을 적고 하나씩 체크만, 마감일·
-- 담당자는 따로 없음, 되풀이 할일에도 그대로 적용.
--
-- 숙제 항목의 체크리스트(homework_items.checklist)와 같은 모양이다 —
-- 한 줄에 하나씩 적고, 체크는 그 줄의 글자로 표시한다.
--
-- tasks.parent_id 라는 칸이 이미 있지만(0020) 화면이 한 번도 쓴 적이
-- 없다 — 「진짜 하위 할일」(담당자·마감일 따로) 로 가는 자리였는데,
-- 이번엔 그 방식을 안 쓴다. 다음에 진짜 하위 할일이 필요해지면 그때 쓴다.

alter table public.tasks
  add column if not exists checklist text,
  add column if not exists checklist_done text[] not null default '{}';

comment on column public.tasks.checklist is
  '하위목록 — 한 줄에 하나. 담당자·마감일은 따로 없다 (숙제 체크리스트와 같은 모양)';
comment on column public.tasks.checklist_done is
  '체크된 줄의 글자 그대로. checklist 의 줄과 내용으로 맞춘다 (순서 말고)';

-- 되풀이 할일 규칙에도 같은 칸 — 여기 적어두면 매번 생기는 할일마다
-- 같은 목록이 복사되어 들어간다 (그 뒤로는 각자 따로 체크된다)
alter table public.todo_routines
  add column if not exists checklist text;

create or replace function public.task_checklist_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.task_checklist_on() to authenticated;
