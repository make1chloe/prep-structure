-- 0059: 나이스 학사일정 가져오기
--
-- 학교 시험 · 방학 · 체험학습 날짜를 학교 알림장에서 옮겨 적고 있었다.
-- 학교가 여러 곳이면 그것만으로 일이다. 나이스(NEIS)가 학사일정을 열어두고
-- 있으니 받아온다.
--
--   · 학교는 **표준학교코드**로 잡는다. 이름만으로는 같은 이름 학교가 여럿이다.
--   · 받아온 일정은 tasks 에 넣는다 — 새 화면을 만들지 않는다 (원칙1).
--     원장님은 이미 일정 화면을 보고 있고, 학교 일정도 결국 그 화면에서 본다.
--   · 몇 번을 다시 받아도 같은 줄이 늘어나면 안 된다. 그래서 어디서 온
--     무엇인지(source · source_id)를 적어두고 그것으로 맞춘다.

create table if not exists public.neis_schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- 학교 이름 (나이스가 준 그대로)
  atpt_code   text not null,                 -- 시도교육청코드 (예: B10 서울)
  schul_code  text not null,                 -- 표준학교코드
  kind        text,                          -- 초등학교 / 중학교 / 고등학교
  active      boolean not null default true, -- 안 보는 학교는 꺼둔다
  created_at  timestamptz not null default now(),
  unique (atpt_code, schul_code)
);

alter table public.neis_schools enable row level security;
drop policy if exists staff_all on public.neis_schools;
create policy staff_all on public.neis_schools
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ------------------------------------------------------------
-- 어디서 온 일정인지
--
-- 손으로 적은 일정과 받아온 일정을 섞어두면, 다시 받을 때 손으로 적은 것까지
-- 지우게 된다. 그래서 출처를 적어둔다. 다시 받으면 **같은 출처의 같은 줄만**
-- 맞추고, 손으로 적은 것은 건드리지 않는다.
-- ------------------------------------------------------------
alter table public.tasks add column if not exists source    text;
alter table public.tasks add column if not exists source_id text;

comment on column public.tasks.source is
  '어디서 온 일정인가. 비어 있으면 손으로 적은 것 (neis = 나이스에서 받아온 것)';
comment on column public.tasks.source_id is
  '그 출처 안에서의 고유 이름. 다시 받아도 늘어나지 않게 이것으로 맞춘다';

-- 같은 것을 두 번 넣지 않는다 (손으로 적은 것은 source 가 비어 있어 걸리지 않는다)
create unique index if not exists tasks_source_uidx
  on public.tasks (source, source_id)
  where source is not null;
