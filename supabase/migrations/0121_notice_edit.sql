-- 공지 수정 (0121)
--
-- 원장님 (2026-08-14): 「확인했어도 수정 후 재공지 필요할 수가 있어서」.
--
-- 지금까지 공지는 지우고 다시 쓰는 수밖에 없었다. 이제 제자리에서 고치고,
-- 고친 시각(edited_at)을 새긴다 — 학생·학부모 길목(NoticeGate)은 공지를
-- 「id + 고친 시각」 으로 기억하므로, 고치는 순간 **확인했던 사람에게도
-- 새 공지처럼 다시 뜬다.** 그게 재공지다.
alter table public.notices add column if not exists edited_at timestamptz;

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면이 부른다)
create or replace function public.notice_edit_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.notice_edit_on() to authenticated;
