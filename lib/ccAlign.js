import { dayNum } from "./classcard";

/**
 * **앱 진도를 클래스카드 플래너에 맞추면 무엇이 바뀌나** — 한 벌.
 *
 * 원장님 (2026-08-28): 「보고 맞추게 할 때 버튼 누르기」 —
 * **자동으로 맞추지 않는다.** 원장님이 보고 누를 때만 바뀐다.
 *
 * ── 규칙 한 줄 ────────────────────────────────────────
 *
 *   그 학생의 단어 교재 단원 중
 *     dayNum(이름) <= 플래너 최고 Day  →  완료(○)
 *     dayNum(이름) >  플래너 최고 Day  →  완료 해제
 *
 * 이름→숫자는 lib/classcard 의 dayNum 한 벌이다 — 대시보드가 「어긋났다」고
 * 재는 그 자와 같은 자여야 한다. 다르면 눌러도 재촉이 안 없어지거나,
 * 안 어긋난 것을 고치게 된다.
 *
 * ── 왜 미리보기와 저장이 이 함수 하나를 같이 쓰나 ────────
 *
 * 「무엇이 바뀔지 보여준 것」과 「실제로 바뀐 것」이 다르면 그건 사고다.
 * 미리보기용 셈과 저장용 셈을 따로 적으면 언젠가 갈라진다. 그래서
 * **읽는 것도 쓰는 것도 이 한 함수의 답을 그대로 쓴다.**
 *
 * 판단만 한다 — 조회도 저장도 안 한다 (저장은 setUnitProgress 한 곳).
 *
 * @param units  [{ id, name, bookName }] 그 학생이 지금 쓰는 **단어 교재**의 단원
 * @param doneIds Set(unitId) — 지금 완료(○)로 찍혀 있는 단원
 * @param ccMax  플래너의 최고 Day
 * @returns { toDone, toClear, skipped }
 *          toDone  = 완료로 바꿀 단원 (이미 완료인 것은 안 넣는다)
 *          toClear = 완료를 해제할 단원 (**원장님이 찍어둔 기록을 지운다**)
 *          skipped = 이름에 Day 숫자가 없어 판단할 수 없는 단원
 */
export function ccAlignPlan({ units = [], doneIds = new Set(), ccMax = null } = {}) {
  const toDone = [];
  const toClear = [];
  const skipped = [];
  if (ccMax === null || ccMax === undefined) return { toDone, toClear, skipped };

  for (const u of units) {
    const day = dayNum(u.name);
    if (day === null) { skipped.push(u); continue; }
    const done = doneIds.has(u.id);
    if (day <= ccMax && !done) toDone.push({ ...u, day });
    else if (day > ccMax && done) toClear.push({ ...u, day });
  }
  // 사람이 읽을 차례로 — Day 순
  toDone.sort((a, b) => a.day - b.day);
  toClear.sort((a, b) => a.day - b.day);
  return { toDone, toClear, skipped };
}
