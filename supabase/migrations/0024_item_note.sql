-- 0024: 숙제 하나하나에 채점 피드백
--
-- 수업 중에 교재를 펼쳐놓고 검사하다 보면
--   "단어 20개 중 12개만 외워옴"
--   "독해 3번 대명사 지칭 틀림"
-- 처럼 **그 숙제에 대한 한 줄**을 적고 싶어진다.
-- 지금은 리포트 전체 '공지' 한 칸밖에 없어서 몰아 쓰게 된다.
--
-- 그래서 daily_report_items 에 note 를 붙인다.
--   · 검사한 항목(done/weak/missing) → 채점 피드백
--   · 배정한 항목(assigned)          → 이미 range_note 가 있으므로 그대로 둔다
-- 리포트 문구에는 "· 숙제: 독해 미흡 (3번 대명사 지칭 틀림)" 처럼 괄호로 붙는다.

alter table public.daily_report_items add column if not exists note text;
