-- 0158 (뎌-4) 🃏 클래스카드 카드를 오늘 수업 01 에 세운다 — **넘긴 것을 적을 자리** 하나.
-- 원장님 2026-09-10: 「5. 클래스카드」(차례 ⑤).
-- 확정-⑱ **목표에 못 미쳐도 앱이 안 넘긴다** — 원장님이 「⏭ 목표 미달 넘기기」를 누르셔야 넘어간다.
--   그 누른 것을 어디엔가 적어야 다음에 열어도 넘어간 채로 보인다 → cc_planner 에 칸 둘.
-- 표는 새로 안 만든다(0031 의 cc_planner 그대로) · 확장이 다시 받아 적어도(upsert) 넘긴 자국은 **안 지운다**
--   — upsert 는 이 두 칸을 건드리지 않는다(lib/cc.js 가 보내는 칸에 없다).
-- 지우지 않는다(대전제-6) — 다시 누르면 skipped_at 이 null 로 돌아갈 뿐, 줄은 그대로 있다.
alter table v2.cc_planner add column if not exists skipped_at timestamptz;
alter table v2.cc_planner add column if not exists skip_by    uuid references v2.profiles(id);
comment on column v2.cc_planner.skipped_at is '(뎌-4) 원장님이 「⏭ 목표 미달 넘기기」를 누른 때 — 앱은 스스로 안 넘긴다(확정-⑱)';
comment on column v2.cc_planner.skip_by    is '(뎌-4) 누가 넘겼나(원장·강사·조교)';
-- 쓰기 권한은 이미 staff_all 정책과 0031 의 grant 가 준다(새 grant 없음 — check-grants 가 짝을 잰다).

-- 표 모양이 바뀌었다 — API 기억을 새로 읽지 않으면 화면이 이 칸을 못 쓴다(원장님 9/10 「schema cache」)
notify pgrst, 'reload schema';
