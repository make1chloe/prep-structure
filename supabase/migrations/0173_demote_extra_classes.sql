-- 0173: 옛 특강반 일괄 하강 (특강 이행계획서 v2 §9, 9단계).
--
-- 원장 확정 (2026-08-26): 「응, 내려도 됨」.
--
-- 특강은 반이 아니라 재원생 속성(0164)이 되었다 — 새 특강은 재원생 →
-- 특강 탭에서 만든다. 반으로 남아 있는 옛 특강(category <> '정규반')이
-- 무기한(ends_on 없음)으로 서 있으면 오늘 수업·달력·수강료가 계속
-- 두 모델을 같이 굴리게 된다. **화면에서만 내린다**(archived_at) —
-- 표·기록(classes · class_students · class_attendance)은 지우지 않는다
-- (원장 확정: 지난 특강은 지난 반 조회로 본다. sqlChecks 0042 도 존치).
--
-- 「특강인가」 는 lib/classTerm.isExtra 와 같은 판단이다 (원칙 1):
--   category 가 있고 '정규반' 이 아니다.
--
-- 시각을 고정 리터럴로 박는 이유 — now() 로 적으면 손으로 보관한 반과
-- 섞여서 「이 마이그가 내린 것」 만 골라 되돌릴 수가 없다.
--
-- 되돌리기 (이 마이그가 내린 것만):
--   update public.classes set archived_at = null
--    where archived_at = timestamptz '2026-08-27 00:00:00+09';

update public.classes
   set archived_at = timestamptz '2026-08-27 00:00:00+09'
 where category is not null
   and category <> '정규반'
   and archived_at is null;

-- 돌아가는지 손가락 하나로 확인하는 탐침 (설정 → SQL 화면·메뉴 배지가 본다)
create or replace function public.demote_extra_classes_on()
returns boolean language sql stable as $$ select true $$;
grant execute on function public.demote_extra_classes_on() to authenticated;
