-- 신규 상담에 교재 배정 (0122)
--
-- 원장님 (2026-08-15): 「신규 상담 정보에 교재 배정이 없음. 아직 등록 안 해도.」
--
-- 레벨테스트 뒤 등록 전에 교재 안내(구매)를 먼저 보내는 흐름이 실제로 있다.
-- 지금은 안내 문자만 나가고 상담 정보에는 아무것도 안 남았다. 이제 상담에
-- 교재를 골라두면 ① 상담 화면에 보이고 ② 교재 안내를 보낼 때 자동으로
-- 적히고 ③ 등록(재원생 전환)하는 순간 그 교재가 배정으로 이어진다 —
-- 같은 값을 두 번 입력하지 않는다 (원칙 1).
alter table public.inquiries add column if not exists book_ids uuid[];

-- 돌았는지 확인하는 손잡이 (설정 → SQL 화면 · 관리자 배지가 부른다)
create or replace function public.inquiry_books_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.inquiry_books_on() to authenticated;
