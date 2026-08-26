-- **학습 항목을 지워도 과거 검사는 산다** (마이그1 v2 §1-3 — #14.
-- 원장 확정 8/27: 기록 있으면 삭제 거절 → 숨김 안내).
--
-- 지금은 항목 하나를 지우면 전 학생·전 날짜의 검사행(daily_report_items)·
-- 답지 열람 기록(answer_files)·클카 그림자(classcard_shadow)가 cascade 로
-- 통째 사라진다 — 비가역 소실 1순위(#14). cascade → **restrict**:
-- DB 가 이력 있는 삭제를 거절하고, 앱은 삭제 전에 3표를 세어 이력이
-- 있으면 「숨김」(active=false — 이미 있는 칸)을 안내한다. 숨기면 화면
-- 목록에서 즉시 빠지고(전 화면이 .eq("active", true)) 과거 기록은 이름
-- 그대로 남는다.
--
-- 되돌리기 (cascade 복원):
--   alter table public.daily_report_items drop constraint daily_report_items_homework_item_id_fkey;
--   alter table public.daily_report_items add constraint daily_report_items_homework_item_id_fkey
--     foreign key (homework_item_id) references public.homework_items(id) on delete cascade;
--   (answer_files·classcard_shadow 동형)

alter table public.daily_report_items
  drop constraint if exists daily_report_items_homework_item_id_fkey;
alter table public.daily_report_items
  add constraint daily_report_items_homework_item_id_fkey
  foreign key (homework_item_id) references public.homework_items(id) on delete restrict;

alter table public.answer_files
  drop constraint if exists answer_files_homework_item_id_fkey;
alter table public.answer_files
  add constraint answer_files_homework_item_id_fkey
  foreign key (homework_item_id) references public.homework_items(id) on delete restrict;

alter table public.classcard_shadow
  drop constraint if exists classcard_shadow_item_id_fkey;
alter table public.classcard_shadow
  add constraint classcard_shadow_item_id_fkey
  foreign key (item_id) references public.homework_items(id) on delete restrict;

create or replace function public.items_keep_history_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.items_keep_history_on() to authenticated;
