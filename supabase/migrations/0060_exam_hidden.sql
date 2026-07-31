-- 0060: 필요 없는 시험 일정은 숨긴다
--
-- 나이스에서 학사일정을 받으면 시험 기간이 **다 들어온다.** 우리 학생이
-- 없는 학년의 시험도 있고, 학교가 '고사' 라고만 적어둔 것도 있다.
--
-- 지우게 하면 안 된다 — 다시 받아오면 또 들어오고, 그때마다 다시 지워야 한다.
-- 그래서 **숨긴다.** 숨긴 것은 화면에도 안 나오고 결석 예상도 안 잡히지만
-- 기록은 남아서, 다시 받아도 숨긴 채로 있다.

alter table public.exam_periods
  add column if not exists hidden boolean not null default false;

comment on column public.exam_periods.hidden is
  '필요 없어서 숨긴 시험. 화면·알림·결석 예상에서 빠지지만 기록은 남는다 (다시 받아도 숨긴 채)';

create index if not exists exam_periods_live_idx
  on public.exam_periods (from_date) where not hidden;
