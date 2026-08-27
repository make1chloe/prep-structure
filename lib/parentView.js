/**
 * 학생·학부모가 보는 한 판 — **이번 달이 지금 어떻게 되고 있나.**
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
function attendanceLine(att = {}) {
  const order = ["present", "late", "absent", "makeup", "online", "homework"];
  const parts = order
    .filter((k) => (att[k] || 0) > 0)
    .map((k) => `${ATT_LABEL[k] || k} ${att[k]}회`);
  return parts.join(" · ") || "아직 수업이 없어요";
}

/** "평균 10개 중 1개 틀림" — 시험 한 번의 모습이 그대로 그려진다 */
function perTest(t) {
  return t?.avgTotal != null && t?.avgWrong != null
    ? `평균 ${t.avgTotal}개 중 ${t.avgWrong}개 틀림`
    : null;
}

/**
 * 이번 달 한 판 — **출결 · 숙제 · 단어 · 문법** (원장님, 2026-08-06).
 * 숫자만 늘어놓으면 읽히지 않는다. **한 줄에 하나씩**, 좋은지 아닌지가 보이게.
 *
 * 값은 `lib/monthly` 의 summarize 가 준 것을 그대로 읽는다.
 *
 * **여기서 한 번 크게 틀렸다.** 이 함수가 `sum.rate` · `sum.wordRate` 를 읽고
 * 있었는데 summarize 는 `sum.homework.rate` · `sum.word.rate` 로 준다.
 * 그래서 학생 화면도 학부모 화면도 **출결 한 줄만** 뜨고 숙제·단어는 몇 주째
 * 아예 안 보이고 있었다. 값이 없으면 그 줄을 조용히 빼는 규칙이라 오류도 안 났다.
 * 모양을 짐작해서 읽으면 이렇게 된다 — 주는 쪽 모양을 그대로 받는다.
 *
 * @param sum  summarize() 가 돌려준 것
 * @param pass 단어시험 통과 요약 (lib/wordTest 의 passSummary)
 */
export function threeLines(sum, pass = null) {
  const out = [];

  out.push({
    key: "att",
    label: "출결",
    text: attendanceLine(sum?.att),
    tone: (sum?.att?.absent || 0) > 0 ? "warn" : "ok",
  });

  const hw = sum?.homework?.rate;
  if (hw != null) {
    out.push({
      key: "hw",
      label: "숙제",
      text: `성취도 ${hw}%`,
      tone: hw >= 80 ? "ok" : hw >= 60 ? "mid" : "warn",
    });
  }

  const word = sum?.word;
  if (word?.rate != null) {
    // 통과선은 학생마다 다르다. 몇 번 중 몇 번 통과인지가 %보다 먼저 읽힌다
    // 재시험에서 통과한 것도 통과는 통과다. 다만 **한 번에 통과한 것과 구별**해서
    // 적는다 — 숨길 일이 아니고, 그게 그 달의 실제 모습이다 (원장님 규칙)
    const took = pass?.took
      ? `${pass.took}번 중 ${pass.ok}번 통과` +
        (pass.retry ? ` (그중 재시험 ${pass.retry}번)` : "")
      : null;
    out.push({
      key: "word",
      label: "단어시험",
      text: [took, `${word.rate}%`, perTest(word)].filter(Boolean).join(" · "),
      tone: word.rate >= 90 ? "ok" : word.rate >= 75 ? "mid" : "warn",
    });
  }

  // 문법 테스트 — 칸 이름은 sent_* 지만 원장님은 「문법」 이라 부르신다.
  // 본 적이 없는 달에는 줄을 아예 안 만든다 (없는 것을 0 으로 보여주면 안 된다).
  const sent = sum?.sent;
  if (sent?.rate != null) {
    out.push({
      key: "sent",
      label: "문법",
      text: [`${sent.count}회`, `${sent.rate}%`, perTest(sent)].filter(Boolean).join(" · "),
      tone: sent.rate >= 90 ? "ok" : sent.rate >= 75 ? "mid" : "warn",
    });
  }

  return out;
}

export const TONE_CLS = { ok: "tag-mint", mid: "tag-amber", warn: "tag-red" };
