-- ============================================================
-- 0102. 신규 상담 양식 — 희망 시간표 · 글로 적는 희망 시간 · 개인정보 동의
--
-- 원장님 (2026-08-06)
--   「학생 레벨테스트와 방문상담 원하는 시간은 텍스트로 입력하게 해줘.
--    구체적으로 적으면 맞춰줄 수가 없어」
--   「희망요일 말고 6가지 중에 희망시간표를 선택하게 해. 중복 가능이야」
--   「개인정보수집동의 ... 체크박스 만들어줘」
--
-- 왜 칸을 새로 파나
--   `test_want_on` · `visit_on` 은 **날짜 칸(date)** 이다. 「평일 오후 아무때나」
--   를 넣을 수가 없다. 억지로 날짜로 받으면 학부모는 하루를 찍어야 하고,
--   원장님은 그 하루에 못 맞춰서 다시 전화하시게 된다 — 양식을 받은 보람이 없다.
--
--   날짜 칸은 **지우지 않는다.** 원장님이 상담 목록에서 **확정한 날**을 적는
--   자리로 그대로 쓴다. 희망(글)과 확정(날짜)은 다른 것이다.
-- ============================================================

-- 학부모가 고른 시간표 (여러 개). 글자 열쇠는 lib/applySlots 의 SLOTS.key
alter table public.inquiries add column if not exists want_slots text[] not null default '{}';

-- 희망 시간을 **글로** — 「평일 오전이면 아무때나」 「토요일 빼고」
alter table public.inquiries add column if not exists test_want_text text;
alter table public.inquiries add column if not exists visit_want_text text;

-- 개인정보 수집·이용에 동의한 때. **언제 동의했는지가 곧 증거다** —
-- true/false 로 두면 나중에 「언제 동의했나」 에 답할 수 없다
alter table public.inquiries add column if not exists privacy_agreed_at timestamptz;

comment on column public.inquiries.want_slots       is '학부모가 고른 희망 시간표 (lib/applySlots 의 key)';
comment on column public.inquiries.test_want_text   is '레벨테스트 희망 시간 — 글로 적은 것';
comment on column public.inquiries.visit_want_text  is '방문상담 희망 시간 — 글로 적은 것';
comment on column public.inquiries.privacy_agreed_at is '개인정보 수집·이용에 동의한 때 (개인정보 보호법 제15조)';

-- 화면이 이 파일이 돌았는지 알 수 있게
create or replace function public.apply_form_v2()
returns boolean language sql immutable as $$ select true $$;
