-- ============================================================
-- ⚠⚠ 【원장님 확인 전입니다. 아직 돌리지 마세요.】 ⚠⚠
--
--   먼저  1_안쓰는표_세어보기.sql  을 돌려서 **다섯 표가 전부 0 줄**인 것을
--   눈으로 보신 뒤에만 이 파일을 돌리십시오.
--   0 이 아닌 표가 하나라도 있으면 **돌리지 마시고 알려주세요.**
--
--   이 파일은 **SETUP_ALL.sql 에 안 들어갑니다.** 일부러 그렇게 했습니다 —
--   supabase/migrations/ 밖에 두었기 때문에 `node scripts/build-setup-sql.mjs`
--   가 절대 담아가지 않습니다. 전체 복사(설정 → Supabase SQL)에도 안 섞입니다.
--
--   ★ 붙여넣을 때 **Ctrl+A 로 지우고 이 파일만** 붙이세요.
--     예전에 「일부만 실행」 사고가 세 번 있었습니다. 이 파일은 한 덩어리로
--     돌아갑니다 — 중간에 에러가 나면 아무것도 안 지워집니다.
--
--   여러 번 돌려도 안전합니다 (없으면 그냥 넘어갑니다).
--   되돌리기: 표를 되살릴 수는 없습니다. 필요해지면 0001·0005 마이그레이션의
--   create table 문을 그대로 다시 돌리면 **빈 표**로는 되살아납니다.
--
--   ※ 꼭 아셔야 할 것 — **한 번 지워도 다시 생깁니다.**
--     이 다섯 표를 만드는 문장은 아직 0001_core_schema.sql · 0005_classes_daily.sql
--     안에 살아 있고, 그 둘은 SETUP_ALL.sql 안에 들어 있습니다. 그래서 지운 뒤에
--     SETUP_ALL.sql 을 다시 돌리시면 **빈 표로 되살아납니다** (자료는 안 돌아옵니다).
--     아주 없애려면 0001·0005 에서 그 create table 과 RLS 목록의 이름까지 빼야
--     하는데, 그건 **최초 스키마를 건드리는 일**이라 이번 청소에 끼워 넣지
--     않았습니다 (이번 지시는 「표는 DROP 하지 말고 원장님이 보실 보고서만」
--     이었습니다). 별건으로 남깁니다 — 하실 때는 0001·0005 를 고치고
--     `node scripts/build-setup-sql.mjs` 로 합본을 다시 찍은 다음
--     `bash scripts/check-pages.sh` (진짜 Postgres 에 SETUP_ALL 을 세 번
--     돌려봅니다) 가 통과하는지 보면 됩니다.
--
--   근거 (2026-08-28 실측)
--     app · lib · components · scripts 전체에서 다섯 이름 모두 참조 0.
--     supabase/migrations/ 안에서도 자기를 만드는 문장과 0001 의 정책 목록
--     한 줄 말고는 아무도 안 씁니다. 뷰·트리거·함수도 안 씁니다.
--     밖에서 이 표를 가리키는 외래키는 learning_items 하나뿐이고,
--     그것도 student_curriculum · daily_assignments (둘 다 지금은 안 쓰는
--     옛 표) 에서 옵니다 — 그래서 아래에서 cascade 를 씁니다.
--     cascade 는 **그 외래키 제약만** 없앱니다. 저 두 표와 그 안의 줄은
--     그대로 남습니다.
-- ============================================================

begin;

-- ① 선택과목 (0001) — 코드 참조 0
drop table if exists public.student_electives;

-- ② 단원 안의 절 (0001) — 코드 참조 0
drop table if exists public.unit_sections;

-- ③ 옛 학습항목 (0001) — 지금 쓰는 것은 homework_items. 코드 참조 0
--    student_curriculum · daily_assignments 가 이 표를 가리키는 외래키를
--    갖고 있어서 cascade 가 필요합니다 (제약만 사라지고 표는 남습니다).
drop table if exists public.learning_items cascade;

-- ④ 옛 단어/문장 시험 (0001) — 지금은 daily_reports 안에 있음. 코드 참조 0
drop table if exists public.tests;

-- ⑤ 옛 반 회차 (0005) — 지금 쓰는 것은 term_sessions · class_progress. 코드 참조 0
drop table if exists public.class_sessions;

commit;

-- 다 되면 아래로 확인하세요 — 다섯 줄 다 false 여야 합니다.
select t as "표", to_regclass('public.'||t) is not null as "아직 있나"
from unnest(array['student_electives','unit_sections','learning_items','tests','class_sessions']) t;
