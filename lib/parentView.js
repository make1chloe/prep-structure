/**
 * 학부모가 보는 한 판 — **이번 달이 지금 어떻게 되고 있나.**
 *
 * 데일리리포트는 하루치라 "오늘 어땠나" 만 알려주고, 월간리포트는 달이 끝나야
 * 나온다. 그 사이가 비어 있다. 학부모가 궁금한 건 대개 **지금까지**다.
 *   "이번 달 몇 번 빠졌지"  "숙제는 잘 내고 있나"  "단어시험은 어떤가"
 *
 * 그래서 이번 달 것을 **달이 끝나기 전에도** 그대로 세어 보여준다.
 * 세는 방법은 월간리포트와 같다 (lib/monthly 의 summarize) — 두 곳이 다르면
 * 학부모가 "저번엔 이렇게 나왔는데" 하고 묻게 된다.
 */

export const ATT_LABEL = {
  present: "출석",
  late: "지각",
  absent: "결석",
  makeup: "보강",
  online: "온라인",
  homework: "숙제검사",
  "late-school": "지각(학교일정)",
};

/** 이번 달의 며칠까지 왔나 — "8월 (12일 중 5일 수업)" 처럼 적는다 */
export function monthRange(today) {
  const ym = (today || "").slice(0, 7);
  return { ym, from: `${ym}-01`, to: today };
}

/**
 * 출결을 학부모가 읽는 말로.
 * 결석이 0이면 굳이 "결석 0회" 라고 쓰지 않는다 — 없는 것을 세어 보여주면
 * 있는 것처럼 읽힌다.
 */
export function attendanceLine(att = {}) {
  const order = ["present", "late", "absent", "makeup", "online", "homework"];
  const parts = order
    .filter((k) => (att[k] || 0) > 0)
    .map((k) => `${ATT_LABEL[k] || k} ${att[k]}회`);
  return parts.join(" · ") || "아직 수업이 없어요";
}

/**
 * 세 줄 요약 — 출결 · 숙제 · 단어.
 * 숫자만 늘어놓으면 읽히지 않는다. **한 줄에 하나씩**, 좋은지 아닌지가 보이게.
 */
export function threeLines(sum) {
  const out = [];

  out.push({
    key: "att",
    label: "출결",
    text: attendanceLine(sum?.att),
    tone: (sum?.att?.absent || 0) > 0 ? "warn" : "ok",
  });

  if (sum?.rate != null) {
    out.push({
      key: "hw",
      label: "숙제",
      text: `성취도 ${sum.rate}%`,
      tone: sum.rate >= 80 ? "ok" : sum.rate >= 60 ? "mid" : "warn",
    });
  }

  if (sum?.wordRate != null) {
    // "평균 10개 중 1개 틀림" — 시험 한 번의 모습이 그대로 그려진다
    const detail =
      sum.avgTotal != null && sum.avgWrong != null
        ? `평균 ${sum.avgTotal}개 중 ${sum.avgWrong}개 틀림`
        : null;
    out.push({
      key: "word",
      label: "단어시험",
      text: [`${sum.wordRate}%`, detail].filter(Boolean).join(" · "),
      tone: sum.wordRate >= 90 ? "ok" : sum.wordRate >= 75 ? "mid" : "warn",
    });
  }

  return out;
}

export const TONE_CLS = { ok: "tag-mint", mid: "tag-amber", warn: "tag-red" };
