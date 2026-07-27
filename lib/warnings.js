// 경고 · 반성문
//
// 규칙 (원장님 확인)
//   지각 / 숙제 미제출·미흡 / 단어시험 미통과  → 그날 경고 1회
//   경고 3회 누적                              → 반성문
//   단, 3회가 됐다고 무조건 쓰는 건 아니다. **유예**할 수 있다.
//
// 경고는 저장하지 않고 **매번 리포트에서 계산한다.**
//   리포트를 고치면 경고도 같이 맞아야 하기 때문이다.
//   저장하는 건 사람이 내린 판단(면제·반성문·유예)뿐이다.
//
// 한 수업에 여러 가지가 겹쳐도 **경고는 하루 1회**다.
//   지각도 하고 숙제도 안 해왔다고 2회를 주지는 않는다. 사유만 여러 개 적힌다.

export const DEFAULT_RULE = {
  reflectionAt: 3,      // 몇 회 쌓이면 반성문인가
  wordPassPct: 80,      // 단어시험 통과선 (%)
  countLate: true,
  countHomework: true,
  countWordTest: true,
};

/**
 * 리포트 한 건이 경고감인지 본다.
 * @param rep   { attendance_kind, word_correct, word_total }
 * @param items [{ status }]  그날 검사한 숙제
 * @returns { hit: boolean, reasons: string[] }
 */
export function judge(rep = {}, items = [], rule = DEFAULT_RULE) {
  const reasons = [];

  if (rule.countLate && rep.attendance_kind === "late") {
    reasons.push("지각");
  }

  if (rule.countHomework) {
    const missing = items.filter((i) => i.status === "missing").length;
    const weak = items.filter((i) => i.status === "weak").length;
    if (missing > 0) reasons.push(`숙제 미제출 ${missing}건`);
    else if (weak > 0) reasons.push(`숙제 미흡 ${weak}건`);
  }

  if (rule.countWordTest && rep.word_total > 0) {
    const pct = (rep.word_correct ?? 0) / rep.word_total * 100;
    if (pct < rule.wordPassPct) {
      reasons.push(`단어시험 ${rep.word_correct ?? 0}/${rep.word_total}`);
    }
  }

  return { hit: reasons.length > 0, reasons };
}

/**
 * 학생 한 명의 경고를 처음부터 훑어서 지금 몇 회인지 센다.
 *
 * @param reports [{ id, date, attendance_kind, word_correct, word_total, items:[{status}] }]
 *                날짜 오름차순
 * @param actions [{ kind, on_date, target_date }]  waive | reflection | defer
 * @returns {
 *   count,        지금 쌓인 경고 수 (마지막 정산 이후)
 *   need,         반성문을 써야 하는 상태인가
 *   list,         쌓여 있는 경고 [{ date, reasons }]
 *   history,      지난 정산 [{ on_date, kind }]
 *   deferred,     지난번에 유예한 적이 있나
 * }
 */
export function tally(reports = [], actions = [], rule = DEFAULT_RULE) {
  const waived = new Set(
    actions.filter((a) => a.kind === "waive" && a.target_date).map((a) => a.target_date)
  );
  // 정산(반성문·유예)한 날들 — 그 날짜까지의 경고는 털어낸다
  const settles = actions
    .filter((a) => a.kind === "reflection" || a.kind === "defer")
    .sort((a, b) => a.on_date.localeCompare(b.on_date));
  const lastSettle = settles.length ? settles[settles.length - 1] : null;

  const list = [];
  reports.forEach((r) => {
    if (waived.has(r.date)) return;                     // 면제한 날
    if (lastSettle && r.date <= lastSettle.on_date) return;  // 이미 정산된 구간
    const { hit, reasons } = judge(r, r.items || [], rule);
    if (hit) list.push({ date: r.date, reasons });
  });

  return {
    count: list.length,
    need: list.length >= (rule.reflectionAt || 3),
    list,
    history: settles.map((s) => ({ on_date: s.on_date, kind: s.kind })),
    deferred: lastSettle?.kind === "defer",
  };
}

/** 문자에 넣을 한 덩어리 — 경고가 없으면 빈 배열 */
export function warningLines(state, rule = DEFAULT_RULE, forParent = true) {
  if (!state || state.count === 0) return [];
  const at = rule.reflectionAt || 3;
  const L = [];

  const latest = state.list[state.list.length - 1];
  L.push(`⚠ 경고 ${state.count}/${at}회 — ${latest.reasons.join(", ")}`);

  if (state.need) {
    L.push(
      forParent
        ? `경고가 ${at}회 쌓여 반성문 대상입니다. 지도 부탁드립니다.`
        : `경고 ${at}회 — 반성문을 써야 합니다.`
    );
  } else {
    const left = at - state.count;
    L.push(
      forParent
        ? `${left}회 더 쌓이면 반성문을 쓰게 됩니다.`
        : `${left}회 더 받으면 반성문입니다.`
    );
  }
  return L;
}
