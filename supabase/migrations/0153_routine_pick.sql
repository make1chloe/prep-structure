-- 0153: 루틴의 **일부만** 그 학생에게 배정
--
-- 원장님 (2026-08-24) — 「교재루틴이 있으면 그걸 학생한테 일부만 배정하는
-- 거야. 그래서 재원생에서 편집이 필요한 거고」 · 「교재루틴, 영역루틴 을
-- 학생에게 배정」.
--
-- 루틴은 **메뉴**다. 교재(또는 영역)에 한 벌 적어두고, 학생마다 그중 할 것만
-- 고른다. 여태는 루틴에 적힌 것이 곧 그 학생 것이라, 아이마다 다르게 하려면
-- 교재 루틴 자체를 고쳐야 했다 — 그러면 그 교재를 쓰는 **다른 아이까지**
-- 바뀐다.
--
-- 담는 방식은 「빼는 것」 이다 (고른 것이 아니라).
--   비어 있음 = 루틴에 적힌 것 **전부** 한다  ← 지금까지의 동작 그대로
--   담겨 있음 = 그 항목만 이 학생에게서 뺀다
--
-- 「고른 것」 으로 담으면 루틴에 항목을 새로 더할 때마다 학생 전원을 다시
-- 손봐야 한다. 빼는 것으로 담으면 새 항목은 저절로 모두에게 간다.
--
-- 교재 루틴과 영역 루틴을 가르지 않는다 — 영역 루틴도 결국 그 학생의
-- **그 교재** 자리에서 쓰이므로, 여기 한 칸이 둘 다 덮는다.

alter table public.student_textbooks
  add column if not exists routine_skip uuid[] not null default '{}';

comment on column public.student_textbooks.routine_skip is
  '이 학생이 이 교재의 루틴에서 빼는 학습 항목 (0153). 비어 있으면 전부 한다';

create or replace function public.routine_pick_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_pick_on() to authenticated;
