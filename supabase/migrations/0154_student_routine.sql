-- 0154: 학생 루틴을 **정했는가** · 그 학생의 **차례**
--
-- 원장님 (2026-08-24) — 「학생에게 교재를 배정할 때 무조건, 영역루틴과
-- 교재루틴에서 가져와서 학생루틴을 설정해야 해. 딱 그때 지정까진 안 하더라도
-- 교재지정은 하고, 안 되어 있으면 안 되는 정보니까 대시보드 알림이 필요해」
-- · 「그리고 배정할 때 기본순서도 정해놔」
--
-- 0153 이 「무엇을 빼나」 를 담았다면, 여기는 나머지 둘이다.
--
-- routine_set_at — **정했다는 도장.** 이게 없으면 「아직 안 정한 교재」 다.
--   0153 의 뺀 목록만으로는 이걸 알 수 없다 — 비어 있는 것이 「전부 한다」
--   인지 「아직 안 봤다」 인지 구별이 안 되기 때문이다. 그래서 도장을 따로
--   찍는다. 대시보드가 이 도장 없는 교재를 재촉한다.
--
-- routine_order — **이 학생의 차례.** 비어 있으면 루틴에 적힌 차례 그대로.
--   같은 루틴이라도 아이마다 먼저 할 것이 다르다 (단어부터 하는 아이,
--   채점부터 하는 아이). 오늘 수업의 등원 학습 목록이 이 차례로 차려진다.
--   목록에 없는 항목은 뒤에 붙는다 — 루틴에 항목을 새로 더해도 안 사라진다.

alter table public.student_textbooks
  add column if not exists routine_set_at timestamptz,
  add column if not exists routine_order  uuid[] not null default '{}';

comment on column public.student_textbooks.routine_set_at is
  '이 학생의 이 교재 루틴을 정한 시각 (0154). 없으면 아직 안 정한 것 — 대시보드가 재촉한다';
comment on column public.student_textbooks.routine_order is
  '이 학생이 할 차례 (0154). 비어 있으면 루틴에 적힌 차례 그대로';

create or replace function public.student_routine_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.student_routine_on() to authenticated;
