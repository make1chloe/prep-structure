-- 상담자에게 안내한 교재의 **사용 예정일 보존** (전수검사 A13, 원장님
-- 2026-08-16 「남겨줘」).
--
-- 발송 화면에서 상담자(아직 학생 아님)에게 교재 안내를 보내면 교재
-- 목록(book_ids, 0122)은 남는데 「언제부터 쓴다」 는 버려졌다. 등록
-- 전환이 시작일을 등록한 오늘로 잡아버려서, 안내 문자에 적은 날짜와
-- 어긋날 수 있었다. 안내 때의 예정일을 상담에 같이 적어두고, 등록
-- 전환이 그 날짜(아직 안 왔으면)로 배정한다.

alter table public.inquiries add column if not exists book_start_on date;

create or replace function public.inquiry_book_start_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.inquiry_book_start_on() to authenticated;
