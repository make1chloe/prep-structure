-- 0089: 수업 가이드 링크
--
-- 원장님 (2026-08-06) — 「수업 가이드 링크를 설정에서 넣고 학생 화면에 띄워줘」
--
-- 무엇인가 — 학원 밖에 있는 안내다. 단어 외우는 방법 영상, 노션에 적어둔
-- 수업 규칙, 교재 사는 곳, 발음 연습 사이트 … 지금은 그걸 카톡으로 보내신다.
-- 카톡으로 보내면 그 링크는 **하루 만에 없어진다** — 대화가 밀려 올라가고,
-- 새로 온 아이에게는 아예 안 간다.
--
-- 왜 integrations 가 아닌가 (여기서 한 번 막혔다)
--   설정값은 원래 integrations 에 담는다. 그런데 그 표는 **원장님만 읽을 수 있다**
--   (0015). 학생 화면은 학생 자기 계정으로 읽으므로, 거기 넣으면 학생에게는
--   빈 목록만 보인다 — 아무 오류도 없이. 그래서 표를 따로 둔다.
--   비밀값이 아니라 **일부러 보여주려고 넣는 것**이라 갈라놓아도 잃는 것이 없다.
--
-- 규칙
--   · 원장님·강사가 넣고 고친다
--   · 학생·학부모는 **켜둔 것만 읽는다** (지운 것 · 꺼둔 것은 안 보인다)
--   · sort 로 순서를 잡는다. 아이가 제일 먼저 봐야 할 것이 위로 온다

create table if not exists public.class_guides (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  url        text not null,
  note       text,                                   -- 한 줄 설명 (없어도 된다)
  sort       integer not null default 100,
  active     boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_guides_sort_idx on public.class_guides (sort, created_at);

alter table public.class_guides enable row level security;

-- 넣고 고치는 것은 선생님만
drop policy if exists guide_staff on public.class_guides;
create policy guide_staff on public.class_guides
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 학생·학부모는 켜둔 것만 읽는다.
--   is_staff() 를 또 붙이지 않는다 — 위 정책이 이미 선생님을 열어준다.
drop policy if exists guide_read on public.class_guides;
create policy guide_read on public.class_guides
  for select to authenticated
  using (active);

comment on table public.class_guides is
  '수업 가이드 링크. 설정에서 넣고 학생·학부모 화면에 띄운다 (0089).';
