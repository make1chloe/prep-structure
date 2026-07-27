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
import { passed, score } from "./wordTest.js";

// 한 수업에 여러 가지가 겹쳐도 **경고는 하루 1회**다.
//   지각도 하고 숙제도 안 해왔다고 2회를 주지는 않는다. 사유만 여러 개 적힌다.

export const DEFAULT_RULE = {
  reflectionAt: 3,      // 몇 회 쌓이면 반성문인가
  wordPassPct: 90,      // 단어시험 통과선 — **성취도 90% 이상이면 통과**
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
    const ok = passed(rep.word_correct, rep.word_total, rule.wordPassPct);
    if (ok === false) {
      reasons.push(`단어시험 ${score(rep.word_correct, rep.word_total)}`);
    }
  }

  return { hit: reasons.length > 0, reasons };
}

// 쌓인 경고를 **털어내는** 판단들.
//   reflection 반성문을 썼다
//   defer      3회가 됐지만 이번엔 넘어간다
//   reset      한 달에 한 번 하는 정리 — 지난달 것을 다음 달로 끌고 가지 않는다
// 셋 다 카운트만 0으로 돌린다. 기록은 남는다.
export const SETTLE_KINDS = ["reflection", "defer", "reset"];

/** 이번 달에 월간 초기화를 했는가 */
export function resetDoneIn(actions = [], ym) {
  return actions.some((a) => a.kind === "reset" && (a.on_date || "").slice(0, 7) === ym);
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
  // 정산(반성문·유예·월간초기화)한 날들 — 그 날짜까지의 경고는 털어낸다
  const settles = actions
    .filter((a) => SETTLE_KINDS.includes(a.kind))
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
    history: settles.map((s) => ({ on_date: s.on_date, kind: s.kind, note: s.note || null })),
    deferred: lastSettle?.kind === "defer",
  };
}

/**
 * 문자에 넣을 한 덩어리.
 *
 * 유예해준 날에는 경고가 0으로 돌아가므로 위쪽 경고 문구가 안 나온다.
 * 그래서 **유예했다는 사실을 따로 알린다.** 봐줬다는 걸 알아야
 * 학생도 학부모도 다음에 조심하게 된다.
 */
/** 학부모께 나갈 때는 같은 사실을 조금 부드러운 말로 적는다 */
function soften(reason) {
  return reason
    .replace("숙제 미제출", "숙제 미완료")
    .replace("숙제 미흡", "숙제 보충 필요")
    .replace("단어시험", "단어 테스트");
}

export function warningLines(state, rule = DEFAULT_RULE, forParent = true, date = null) {
  if (!state) return [];
  const at = rule.reflectionAt || 3;
  const L = [];

  // 오늘 유예해줬나 (오늘 날짜로 defer 기록이 있으면)
  const deferToday =
    date && (state.history || []).some((h) => h.kind === "defer" && h.on_date === date);
  if (deferToday) {
    L.push(
      forParent
        ? `※ 누적 ${at}회가 되었지만, 이번에는 반성문 없이 넘어가기로 했습니다.`
        : `※ 누적 ${at}회 — 이번엔 반성문을 유예해줬어요. 다음엔 꼭 지켜주세요.`
    );
    if (forParent) L.push("가정에서도 한 번 이야기 나눠주시면 큰 도움이 됩니다.");
    return L;
  }

  if (state.count === 0) return [];

  const latest = state.list[state.list.length - 1];
  L.push(
    forParent
      ? `※ 학습 약속 누적 ${state.count}/${at}회 — ${latest.reasons.map(soften).join(", ")}`
      : `⚠ 경고 ${state.count}/${at}회 — ${latest.reasons.join(", ")}`
  );

  if (state.need) {
    L.push(
      forParent
        ? `${at}회가 되어 이번에 반성문을 쓰기로 했습니다. 가정에서도 한 번 이야기 나눠주시면 큰 도움이 됩니다.`
        : `경고 ${at}회 — 반성문을 써야 합니다.`
    );
  } else {
    const left = at - state.count;
    const before = state.deferred ? "지난번에는 한 번 넘어가 드렸습니다. " : "";
    L.push(
      forParent
        ? `${before}${left}회가 더 쌓이면 반성문을 쓰게 되어, 미리 알려드립니다.`
        : `${state.deferred ? "지난번에 유예받았어요. " : ""}${left}회 더 받으면 반성문입니다.`
    );
  }
  return L;
}
