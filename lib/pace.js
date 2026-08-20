/**
 * **학생별 소화량** (원장님, 2026-08-20 — 「학생이 지난 숙제 완성도를
 * 고려해서 판단하는 거라면 괜찮은데, 일률적으로 몇 % 이상이면 어떻게
 * 한다는 식이면 곤란해」).
 *
 * 일률 기준을 안 쓴다 — **그 학생의 실제 타이머 기록**(study_sessions)
 * 으로 항목별 평균 소요시간을 낸다. 기록이 없는 항목은 **추정하지 않고**
 * 「기록 없음」 으로만 센다. 지어낸 숫자가 판단을 오염시키는 것이
 * 제일 나쁘다.
 *
 * 등원 목록과 다음 수업 계획이 **같은 계산**을 쓴다 (원칙 1).
 */

/** 최근 타이머 기록 → `${studentId}|${itemId}` → 평균 초 */
export function paceMap(sessions = []) {
  const sum = new Map();
  const cnt = new Map();
  (sessions || []).forEach((x) => {
    if (!x.homework_item_id || !x.seconds || x.seconds < 30) return; // 실수 클릭 제외
    const k = `${x.student_id}|${x.homework_item_id}`;
    sum.set(k, (sum.get(k) || 0) + x.seconds);
    cnt.set(k, (cnt.get(k) || 0) + 1);
  });
  const avg = new Map();
  sum.forEach((v, k) => avg.set(k, Math.round(v / cnt.get(k))));
  return avg;
}

/**
 * 목록의 예상 부하 — 아는 것의 합과 모르는 개수를 가른다.
 * @returns { sec, knownN, unknownN }
 */
export function listLoad(paceOf = {}, itemIds = []) {
  let sec = 0;
  let knownN = 0;
  itemIds.forEach((iid) => {
    const a = paceOf[iid];
    if (a) {
      sec += a;
      knownN += 1;
    }
  });
  return { sec, knownN, unknownN: itemIds.length - knownN };
}

/**
 * 시간을 넘어가는 꼬리 — 위에서부터 담다가 예산(분)을 넘긴 뒤의 항목들.
 * 기록 없는 항목은 시간 0으로 치지 않고 **그대로 담는다** (모르면 안 자른다).
 */
export function overflowIds(paceOf = {}, itemIds = [], budgetMin = 0) {
  if (!budgetMin) return [];
  let sec = 0;
  const over = [];
  let exceeded = false;
  itemIds.forEach((iid) => {
    const a = paceOf[iid];
    if (a) sec += a;
    if (!exceeded && sec / 60 > budgetMin) exceeded = true;
    else if (exceeded && a) over.push(iid);
  });
  return over;
}

/** "~55분" — 화면 표시용 */
export function minLabel(sec) {
  const m = Math.round((sec || 0) / 60);
  return m < 1 ? "1분 안" : `~${m}분`;
}
