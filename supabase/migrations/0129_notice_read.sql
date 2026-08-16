-- 확인한 공지는 **더 안 보이게** (원장님, 2026-08-16 — 「공지는 항상
-- 확인 누르면 안 보이게. 누르면 더 보이지 않게 해줘」).
--
-- 지금까지 「확인했어요」 는 기기(localStorage)에만 남아서, 길목에는 다시
-- 안 떠도 화면의 알림 덩어리에는 2~3주 내내 그대로 있었다. 확인을 DB 에
-- 남기고, 화면이 그 공지를 아예 안 보여준다. 원장님이 공지를 **고치면**
-- (edited_at 변경 = 재공지) 도장이 안 맞아 다시 보인다.

alter table public.notice_receipts add column if not exists read_at    timestamptz;
alter table public.notice_receipts add column if not exists read_stamp text;

-- 학생·학부모가 **자기 줄에만** 확인 도장을 찍을 수 있게
drop policy if exists receipt_mark_read on public.notice_receipts;
create policy receipt_mark_read on public.notice_receipts
  for update to authenticated
  using (notice_receipts.student_id in (select public.my_student_ids()))
  with check (notice_receipts.student_id in (select public.my_student_ids()));

create or replace function public.notice_read_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.notice_read_on() to authenticated;
