-- 0118: 이해도 — 집중도(옛 「태도」) 옆에 나란히
--
-- 원장님 (2026-08-11) — 「태도를 집중도로 고치고 이해도 추가해줘.
-- 둘 다 선택하지 않으면 출력되지 않게 해줘」
--
-- 「태도」 는 말이 넓다 — 떠들었는지, 못 알아들었는지, 졸았는지가 다
-- 한 칸에 뭉개진다. 어머니가 궁금한 것은 두 가지다: **집중해서 들었는가**
-- (집중도), **알아들었는가** (이해도).
--
-- 집중도는 새 칸을 만들지 않는다 — 기존 attitude 칸을 그대로 쓰고 화면의
-- 이름만 바꾼다 (지금까지 적어온 별점이 그대로 집중도가 된다). 이해도만
-- 새 칸이다. 별점 갈래(Excellent~Area of Concern)도 같은 것을 쓴다.

alter table public.daily_reports
  add column if not exists understanding text;

comment on column public.daily_reports.attitude is
  '집중도 (화면 이름은 2026-08-11 에 태도→집중도로 바뀜). Excellent~Area of Concern';
comment on column public.daily_reports.understanding is
  '이해도. Excellent~Area of Concern — attitude 와 같은 갈래';

create or replace function public.understanding_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.understanding_on() to authenticated;
