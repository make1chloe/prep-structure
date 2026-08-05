-- 0082: 주기적으로 되풀이되는 할일
--
-- 원장님 (2026-08-05) — 「주기적으로 할일을 관리하고 싶어, 기본 학습 목록처럼」
--
-- 학습 항목(homework_items)이 「무엇을 내줄 수 있나」 를 한 곳에 모아둔 것처럼,
-- **되풀이되는 할일도 한 곳에** 적어둔다. 매달 수강료 안내, 매주 월요일 교재
-- 점검, 매년 3월 학사일정 받아오기 — 이런 것들이다.
--
-- 설계 (원칙1: 같은 값 두 번 적지 않기)
--   · 되풀이 **규칙**만 여기 적는다. 실제 할일은 tasks 에 그대로 만들어진다.
--   · 만들어진 할일은 auto_key = 'routine:<루틴id>:<날짜>' 를 달고 있어서,
--     화면을 몇 번 열어도 **한 번만** 생긴다 (0028·0061 의 유일 인덱스).
--   · 그래서 체크·미루기·메모는 여느 할일과 똑같이 하면 된다.
--     여기에 「이번 달 했나」 를 따로 적어두지 않는다 — 두 군데가 되면 어긋난다.

create table if not exists public.todo_routines (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  -- 어떤 주기인가
  --   weekly  : dows 에 적은 요일마다        (예: 월·금)
  --   monthly : 매달 day_of_month 일          (말일은 31 로 적으면 그 달 말일)
  --   yearly  : 매년 month 월 day_of_month 일
  repeat_kind text not null default 'monthly',
  dows        text[] not null default '{}',   -- ['월','금']
  day_of_month int,
  month        int,
  -- 며칠 전부터 할일로 띄울까. 0 이면 그날 아침에 뜬다.
  -- (수강료 안내처럼 미리 준비할 것이 있으면 3~5일 앞이 낫다)
  lead_days   int not null default 0,
  todo_category_id uuid references public.todo_categories(id) on delete set null,
  priority    int not null default 0,
  note        text,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists todo_routines_active_idx on public.todo_routines (active, sort);

comment on table public.todo_routines is
  '되풀이되는 할일의 규칙. 실제 할일은 tasks 에 auto_key=routine:<id>:<날짜> 로 만들어진다.';

-- ------------------------------------------------------------
-- 권한 — 선생님만 본다. 학생·학부모에게 보일 것이 아니다.
-- (정책만 걸고 GRANT 를 빠뜨리면 조용히 막힌다 — 0081 에서 겪었다)
-- ------------------------------------------------------------
alter table public.todo_routines enable row level security;

drop policy if exists todo_routines_staff on public.todo_routines;
create policy todo_routines_staff on public.todo_routines
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('principal', 'instructor', 'assistant')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('principal', 'instructor', 'assistant')
    )
  );

grant select, insert, update, delete on public.todo_routines to authenticated;
