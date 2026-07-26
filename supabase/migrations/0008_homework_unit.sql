-- 0008: 숙제 배정에 교재 단원 연결
--   daily_report_items.textbook_unit_id : 이 숙제가 가리키는 교재 단원 (교재DB의 단원명과 연동)
--   daily_report_items.range_note       : 단원으로 딱 떨어지지 않는 범위 메모 (예: "12~19p, 짝수만")
-- 안전하게 여러 번 실행 가능합니다.

alter table public.daily_report_items
  add column if not exists textbook_unit_id uuid references public.textbook_units(id) on delete set null;

alter table public.daily_report_items
  add column if not exists range_note text;

create index if not exists daily_report_items_unit_idx
  on public.daily_report_items (textbook_unit_id);
