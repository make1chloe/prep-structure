-- 루틴 항목별 주의사항 (원장님, 2026-08-19 — 「숙제 항목이 다른 건 아닌데
-- 주의사항이 혼재되어 쓸 수밖에 없는데, 학습항목의 설명에 넣어야 하나?」).
--
-- 학습항목 설명은 어디서나 같은 「하는 법」 자리다. 교재·루틴마다 다른
-- 주의(스크램블 6000점↑, 3번 녹음 인증 …)를 거기 넣으면 혼재가 된다.
-- 루틴 단계에 {항목 id: 주의} 를 담고, 루틴이 숙제를 채울 때 그 항목의
-- 배정 메모로 붙인다 — 학생 화면에 그대로 뜬다.
-- 엑셀 표기: 항목 이름 뒤 대괄호 — 클카 스크램블[6000점 이상]

alter table public.routine_steps
  add column if not exists item_notes jsonb not null default '{}'::jsonb;

create or replace function public.routine_item_notes_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.routine_item_notes_on() to authenticated;
