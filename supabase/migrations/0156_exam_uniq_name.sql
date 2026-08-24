-- 0156: 같은 학교에 같은 날 시작하는 **다른** 시험을 막지 않는다
--
-- 원장님 (2026-08-24) — 시험을 추가하니
--   duplicate key value violates unique constraint "exam_periods_uniq"
-- 그리고 추가한 것이 저장되지 않았다.
--
-- 0022 의 잣대는 (학교, 학년, 시작일) 이었다. 그 표는 노션에서 옮겨온 시험을
-- 두 번 넣지 않으려고 만든 것인데, **손으로 더할 때** 발목을 잡는다:
-- 시험 기간을 아직 모르면 시작일을 「오늘」 로 넣어두기 때문에, 같은 학교의
-- 2학기 중간·기말을 같은 날 적으면 둘째 것이 거절당한다.
--
-- 잣대에 **시험 이름**을 더한다. 「같은 학교의 같은 시험이 두 번」 은 여전히
-- 막히고(옮겨오기를 다시 돌려도 안 겹친다), 「같은 학교의 다른 시험」 은
-- 날짜가 겹쳐도 들어간다.
--
-- 잣대가 느슨해지는 쪽이라 지금 있는 줄은 하나도 안 걸린다.

drop index if exists public.exam_periods_uniq;

create unique index if not exists exam_periods_uniq
  on public.exam_periods (school, coalesce(grade,''), from_date, coalesce(name,''));

create or replace function public.exam_uniq_name_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.exam_uniq_name_on() to authenticated;
