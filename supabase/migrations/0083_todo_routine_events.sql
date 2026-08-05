-- 0083: 되풀이 할일에 **사건**을 더한다
--
-- 원장님 (2026-08-05)
--   「되풀이 할일이 신규 등록 시 할일이면 어떻게 해?」
--   「단어 교재 진도 끝나면 시험지 인쇄랑 클래스카드 플래너 설정 해야 하는데」
--
-- 둘 다 「때가 되면 늘 하는 일」 이다. 다만 그 **때**가 날짜가 아니다.
--   · 신규 학생이 들어오면  → 교재 안내 · 반 배정 · 계정 만들기 …
--   · 교재 진도가 끝나가면  → 시험지 인쇄 · 클래스카드 플래너 설정 …
--
-- 표를 새로 만들지 않는다. 0082 의 todo_routines 가 이미 「규칙을 적어두면
-- 때가 왔을 때 할일이 생긴다」 는 일을 한다. 여기에 **계기**만 늘린다.
-- 그래야 적는 자리도 하나, 고치는 자리도 하나다.
--
-- repeat_kind 에 두 가지가 늘어난다
--   student   신규 학생이 들어오면 그 학생마다 한 번
--   book_end  배정한 교재의 남은 단원이 lead_units 개 이하가 되면 한 번
--
-- 열쇠(tasks.auto_key)
--   routine:<id>:<날짜>                       — 날짜로 되풀이하는 것 (0082)
--   routine:<id>:s:<학생id>                   — 신규 학생
--   routine:<id>:b:<학생id>:<교재id>:<회독>   — 교재 끝나감
-- 회독이 열쇠에 들어간다. 2회독을 돌면 시험지도 다시 뽑아야 하기 때문이다.

-- 교재가 **몇 단원 남았을 때** 띄울까. 0 이면 다 끝난 뒤.
alter table public.todo_routines add column if not exists lead_units int not null default 2;

-- 어떤 교재에만 걸까. 비우면 배정된 교재 전부.
--   area  : 교재 영역 (단어 · 독해 · 문법 …) — 「단어 교재만」 이 실제 쓰임새다
alter table public.todo_routines add column if not exists book_area text;

comment on column public.todo_routines.lead_units is
  'book_end 일 때 — 남은 단원이 이 수 이하가 되면 할일을 만든다. 0이면 다 끝난 뒤.';
comment on column public.todo_routines.book_area is
  'book_end 일 때 — 이 영역의 교재에만 건다. 비우면 배정된 교재 전부.';
