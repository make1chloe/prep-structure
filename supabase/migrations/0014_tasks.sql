-- 0014: 할일 · 일정 DB
--
-- 속성 정리 (원칙4-1: 만들기 전에 나열하고 불필요한 것 제거)
--   title        할일/일정 이름                       필수
--   kind         todo(할일) | schedule(일정)          필수 — 목록에서 나누는 기준
--   category     학사일정/수업/행정/상담/교재/기타     분류
--   due_on       할일 마감일 · 일정 날짜               필수
--   end_on       여러 날짜에 걸치는 일정의 끝날        선택
--   start_time   시간이 정해진 일정                    선택
--   status       open | done | canceled               필수
--   done_at      완료 시각                             자동
--   class_id     특정 반과 관련된 일정                 선택
--   assignee_id  담당자                                선택
--   note         메모                                  선택
--   deliver_*    이 일정에서 만들 "학생 전달사항"      선택 ← notices 와 연결
--
--   제외: 반복 규칙(아직 안 씀), 우선순위(날짜+상태로 충분), 태그(category로 충분), 첨부

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  kind          text not null default 'todo',      -- todo | schedule
  category      text,
  due_on        date not null default current_date,
  end_on        date,
  start_time    time,
  status        text not null default 'open',      -- open | done | canceled
  done_at       timestamptz,
  class_id      uuid references public.classes(id) on delete set null,
  assignee_id   uuid references public.profiles(id) on delete set null,
  note          text,

  -- 이 일정에서 학생에게 전달할 사항 (비어 있으면 만들지 않는다)
  deliver_body      text,
  deliver_scope     text,                          -- all | class | grade | student
  deliver_class_id  uuid references public.classes(id) on delete set null,
  deliver_school    text,
  deliver_grade     text,

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_due_idx on public.tasks (due_on, status);

alter table public.tasks enable row level security;
drop policy if exists staff_all on public.tasks;
create policy staff_all on public.tasks
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 일정에서 만든 전달사항을 되짚을 수 있게 (0009 에서 자리만 만들어 둔 컬럼)
alter table public.notices
  add column if not exists task_id uuid references public.tasks(id) on delete set null;
create index if not exists notices_task_idx on public.notices (task_id);
