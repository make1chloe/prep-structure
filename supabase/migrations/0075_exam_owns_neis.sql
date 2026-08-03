-- 방향을 뒤집는다. **내 시험이 주인이고, 나이스가 거기 붙는다.**
--
-- 지금까지는 거꾸로였다
--   나이스에서 받은 시험 기간을 먼저 만들고, 거기에 내 범위·자료·등급컷을 붙였다.
--   그러면 학교 일정이 내 자료의 주인이 된다. 실제로는 그 반대다 —
--   내가 대비하는 시험이 먼저 있고, 학교가 언제 보는지는 **참고로 붙는 것**이다.
--
-- 무엇이 달라지나
--   1) 다시 받아와도 **내 것은 안 바뀐다.** 나이스가 말하는 기간은 따로 적어두고,
--      내 기간과 다르면 "학교 일정이 바뀌었어요" 라고 알려만 준다. 반영은 내가 누른다.
--   2) 나이스에 없는 시험도 **제대로 된 시험**이다. 학원에서 보는 대비 시험,
--      학교가 아직 안 올린 일정 — 지금까지는 이런 것이 '임시' 처럼 취급됐다.
--   3) 학교가 '1회고사' 라고 부르든 '1차고사' 라고 부르든, **내가 부르는 이름**이
--      따로 있다. 나이스 이름은 옆에 적어둔다.
--
-- 그래서 칸을 나눈다
--   from_date · to_date · name  → **내 것.** 화면과 계산은 전부 이것을 본다
--   neis_*                      → 나이스가 마지막으로 말한 것 (참고)

-- 어느 나이스 일정에 붙어 있나 (tasks.source_id 와 같은 열쇠 — "학교코드:날짜:행사")
alter table public.exam_periods add column if not exists neis_source_id text;
-- 나이스가 말한 것 — 내 것과 견주기 위해 그대로 적어둔다
alter table public.exam_periods add column if not exists neis_from date;
alter table public.exam_periods add column if not exists neis_to   date;
alter table public.exam_periods add column if not exists neis_name text;
alter table public.exam_periods add column if not exists neis_seen_at timestamptz;

comment on column public.exam_periods.neis_source_id is
  '붙여둔 나이스 일정 (tasks.source_id). 비어 있으면 내가 만든 시험이다.';
comment on column public.exam_periods.neis_from is
  '나이스가 마지막으로 말한 시작일. from_date(내 것)와 다르면 화면에서 알려준다.';
comment on column public.exam_periods.neis_name is
  '학교가 부르는 이름 (1회고사 · 1차고사). 내가 부르는 이름은 name 이다.';

create index if not exists exam_periods_neis_idx
  on public.exam_periods (neis_source_id)
  where neis_source_id is not null;

-- 같은 나이스 일정이 두 시험에 붙으면 "바뀌었어요" 가 두 군데로 간다
create unique index if not exists exam_periods_neis_uniq
  on public.exam_periods (neis_source_id)
  where neis_source_id is not null;

-- 0074 의 source 는 뜻이 바뀌었다.
--   예전: 이 줄의 주인이 누구인가 (neis / manual)
--   지금: **모든 줄이 내 것이다.** 나이스가 붙어 있는지는 neis_source_id 가 말한다.
-- 이미 'neis' 로 적힌 것은 "받아와서 만든 것" 이라는 뜻으로만 남긴다.
comment on column public.exam_periods.source is
  '이 줄을 처음 어떻게 만들었나 (neis=받아와서 · manual=손으로). 주인은 언제나 나다.';
