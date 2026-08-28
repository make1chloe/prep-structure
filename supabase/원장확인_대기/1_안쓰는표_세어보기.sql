-- ============================================================
-- 【읽기만 합니다 — 아무것도 안 지웁니다】 안 쓰는 표 세어보기
--
--   2026-08-28. 코드(app · lib · components · scripts) 전체를 훑어
--   **한 줄도 읽지도 쓰지도 않는 표**를 골라냈습니다. 아래 표들이 그것입니다.
--
--   지우기 전에 **원장님이 눈으로 확인하셔야 합니다.**
--   이 파일을 Supabase SQL Editor 에 통째로 붙여넣고 Run 하시면
--   표마다 지금 몇 줄이 들어 있는지 한 장으로 나옵니다.
--
--   · 전부 0 이면 → 빈 껍데기입니다. 지워도 잃을 것이 없습니다.
--   · 0 이 아닌 것이 있으면 → 그 표는 **지우지 마시고 알려주세요.**
--     어디선가 손으로 넣으셨거나 옛 이관분이 남아 있는 것입니다.
--
--   확인하신 뒤에 지우실 것은  2_안쓰는표_지우기.sql  입니다.
--   (그 파일은 SETUP_ALL.sql 에 **안 들어갑니다** — 원장님이 직접 한 번만
--    돌리는 것이라, 전체 복사에 섞이면 안 됩니다.)
-- ============================================================

select '① student_electives' as "표",
       '0001 최초 스키마 · 선택과목. 코드 참조 0' as "무엇이었나",
       (select count(*) from public.student_electives) as "지금 줄 수"
union all
select '② unit_sections',
       '0001 최초 스키마 · 단원 안의 절. 코드 참조 0',
       (select count(*) from public.unit_sections)
union all
select '③ learning_items',
       '0001 최초 스키마 · 옛 학습항목. 지금 쓰는 것은 homework_items. 코드 참조 0',
       (select count(*) from public.learning_items)
union all
select '④ tests',
       '0001 최초 스키마 · 옛 단어/문장 시험. 지금은 daily_reports 안에 있음. 코드 참조 0',
       (select count(*) from public.tests)
union all
select '⑤ class_sessions',
       '0005 · 옛 반 회차. 지금 쓰는 것은 term_sessions·class_progress. 코드 참조 0',
       (select count(*) from public.class_sessions)
union all
-- ── 아래 둘은 「참고」입니다. 같이 지울지는 따로 여쭙습니다 ──
--    2026-08-28 에 app/api/admin/tidy-books (다 끝난 일회성 교재 청소 도구)를
--    지우면서, 이 둘을 부르던 마지막 코드가 없어졌습니다. 그래서 오늘부터
--    「코드 참조 0」 이 되었습니다. ③ learning_items 를 가리키고 있습니다.
select '(참고) student_curriculum',
       '0001 · 옛 커리큘럼. tidy-books 삭제로 오늘부터 코드 참조 0',
       (select count(*) from public.student_curriculum)
union all
select '(참고) daily_assignments',
       '0001 · 옛 그날 배정. tidy-books 삭제로 오늘부터 코드 참조 0',
       (select count(*) from public.daily_assignments);
