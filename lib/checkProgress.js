/**
 * **검사 결과 → 진도 3분기** (계획서 v2 §2-4-② — 판단 한 곳).
 *
 * ○(done)이면 done + 그 날짜, △(weak)면 doing, ✕(missing)면 **그 날
 * 찍은 것만** 도로 지운다(reCheckOn — 지난 회차에 끝낸 단원까지 지우면
 * 안 된다). 미검사(빈 값·취소)는 그대로 — 아직 안 본 것과 진도판에서
 * 직접 찍은 것을 구별할 수 없기 때문이다 (8/22·8/23 원장 확정).
 *
 * 같은 단원이 ○·△·✕ 여러 숙제에 동시에 걸리면 **높은 쪽이 이긴다**
 * (○>△>✕) — 항목 하나씩 처리하면 마지막 항목이 이겨버리므로, 반드시
 * 항목 전체를 모아 한 번에 부른다 (검토 A-1).
 *
 * 회독(round)과 「이미 done 인 단원 안 되돌리기」 는 setUnitProgress
 * 한 곳에 있다 — 여기는 분배만 한다. 실패해도 검사 기록은 살린다 —
 * warn 문구만 돌려준다 (RPC 가 멱등이라 다시 저장하면 맞춰진다).
 *
 * @param itemIds    이번에 판정을 볼 항목들 (판=toCheck 전체 / 단건=[하나])
 * @param itemStatus { [itemId]: 'done'|'weak'|'missing'|기타(무시) }
 * @param unitsOf    { [itemId]: { unitIds } } — 지난 배정의 단원
 * @returns warn 문구 또는 null
 */
import { setUnitProgress } from "@/app/progress/actions";

export async function applyCheckProgress(studentId, date, itemIds, itemStatus, unitsOf) {
  const unitsWhere = (want) => [
    ...new Set(
      (itemIds || [])
        .filter((iid) => itemStatus[iid] === want)
        .flatMap((iid) => unitsOf[iid]?.unitIds || [])
        .filter(Boolean)
    ),
  ];
  const doneUnits = unitsWhere("done");
  // ○ 먼저 — 같은 단원이 ○·△·✕ 여러 숙제에 걸리면 높은 쪽이 이긴다
  const weakUnits = unitsWhere("weak").filter((id) => !doneUnits.includes(id));
  const missUnits = unitsWhere("missing")
    .filter((id) => !doneUnits.includes(id) && !weakUnits.includes(id));

  let warn = null;
  if (doneUnits.length) {
    const r = await setUnitProgress(studentId, doneUnits, "done", { on: date, keepDone: true, reCheckOn: date });
    if (r?.error) warn = `진도 반영 실패: ${r.error}`;
  }
  if (weakUnits.length) {
    const r = await setUnitProgress(studentId, weakUnits, "doing", { on: date, keepDone: true, reCheckOn: date });
    if (r?.error) warn = warn || `진도 반영 실패: ${r.error}`;
  }
  if (missUnits.length) {
    // ✕ — 그 날 찍은 진도를 도로 지운다 (메모가 있는 줄은 메모만 남는다)
    const r = await setUnitProgress(studentId, missUnits, null, { reCheckOn: date });
    if (r?.error) warn = warn || `진도 반영 실패: ${r.error}`;
  }
  return warn;
}
