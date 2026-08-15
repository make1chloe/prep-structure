-- 교재 안내가 **나갔는지**를 배정 줄에 새긴다 (원장님, 2026-08-15 —
-- 「교재안내는 놓치면 안되는 중요한 부분」 · 「발송목록에 추가해서 확인후
-- 보내야지」).
--
-- 사용 예정 배정은 두 길로 생긴다: ① 발송 화면의 교재 안내(보내면서 배정)
-- ② 상담 등록·재원생 직접 추가(안내 없이 배정). ②로 생긴 것은 문자가
-- 안 나갔는데 아무도 모른다. 안내가 나간 날을 배정 줄에 적어두면
-- 「사용 예정인데 notified_on 이 빈 것」 = 안내 안 나간 것 — 발송 화면이
-- 이걸 확인 목록으로 보여준다.

alter table public.student_textbooks
  add column if not exists notified_on date;

create or replace function public.book_notified_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.book_notified_on() to authenticated;
