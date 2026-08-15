-- 단어 교재 — 한 번에 몇 단원씩 (0124)
--
-- 원장님 (2026-08-15): 「몇 단원씩 외우는지랑 몇 회독째인지도 체크하게
-- 해줘. 이미 체크했으면 자동 체크되고.」
--
-- 몇 회독째는 이미 있다 (student_textbooks.round). 「몇 단원씩」 을 적을
-- 자리가 없어서 매번 손으로 골랐고, 「지난번과 같게」 도 한 단원만 이어
-- 갔다. 시험 방식과 같은 결(학생·교재·회독)이라 word_test_settings 에 둔다.
alter table public.word_test_settings add column if not exists units_per int;

-- 돌았는지 확인하는 손잡이
create or replace function public.word_units_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.word_units_on() to authenticated;
