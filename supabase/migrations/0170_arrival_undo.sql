-- 0170 (어55) 잘못 누른 하원을 취소한다 · 원장님 2026-09-16 「하원버튼 실수할거같으니 강조해주고, 다시 누르면 취소가능하게」
--   ⚠️ 지우지 않는다(대전제-6) — 줄은 그대로 두고 undone_at 을 찍어 **없던 것으로 내린다.** 읽는 자리가 그 줄을 빼고 센다.
--     (처음엔 delete 로 지으려다 check-grants 가 막았다 — 「지울 권한을 가진 표가 없다」가 이 앱의 규칙이다)
--   ⚠️ 다시 찍으면 되살아난다 — staffStamp 의 upsert 가 undone_at 을 null 로 덮는다(하루 한 줄 · 학생·날짜·걸음).
--   ⚠️ 몇 번을 돌려도 같은 결과여야 한다.
alter table v2.arrival add column if not exists undone_at timestamptz;

comment on column v2.arrival.undone_at is
  '(어55) 잘못 누른 도착·하원을 취소한 때 (lib/arrival.js clearStamp). '
  '값이 있으면 **안 찍은 것으로 본다** — 읽는 자리가 전부 .is("undone_at", null) 로 뺀다(check-arrival 이 지킨다). '
  '⚠️ 학원 사람이 찍은 줄(stamped_by = staff)만 내릴 수 있다 — 아이 앱이 찍은 시각은 1차 기준이라 시각 고치기로만 바꾼다';

notify pgrst, 'reload schema';
