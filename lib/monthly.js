// 월말 리포트
//
// 하루치 데일리리포트는 그날만 보여준다. 한 달을 모아 보면 다른 게 보인다.
//   숙제를 얼마나 해왔는지, 몇 번 왔는지, 단원평가는 어땠는지.
//
// 새로 입력받는 것은 없다. **그 달의 데일리리포트를 다시 세는 것**뿐이다.

import { parts } from "./day.js";
import { score } from "./wordTest.js";

/** "2026-07" → "7월" */
export function monthLabel(ym) {
  return `${Number(ym.slice(5, 7))}월`;
}

const ATT_LABEL = {
  present: "정시",
  late: "지각",
  absent: "결석",
  makeup: "보강",
  early_leave: "조퇴",
  online: "온라인",
};

/**
 * 한 학생의 한 달을 센다.
 *
 * @param reports [{ date, attendance_kind, word_correct, word_total, items:[{status}] }]
 * @param exams   [{ date, name, score, total }]  그 달의 단원평가
 */
export function summarize(reports = [], exams = []) {
  const att = {};
  reports.forEach((r) => {
    const k = r.attendance_kind || "present";
    att[k] = (att[k] || 0) + 1;
  });

  // 숙제 성취도 — 완료를 1, 보충 필요를 0.5, 미완료를 0 으로 본다.
  // 미흡을 0 으로 세면 "해오긴 했는데 부족했던" 노력이 통째로 사라진다.
  let done = 0;
  let weak = 0;
  let missing = 0;
  reports.forEach((r) => {
    (r.items || []).forEach((i) => {
      if (i.status === "done") done += 1;
      else if (i.status === "weak") weak += 1;
      else if (i.status === "missing") missing += 1;
    });
  });
  const checked = done + weak + missing;
  const rate = checked > 0 ? Math.round(((done + weak * 0.5) / checked) * 100) : null;

  // 단어 테스트 — 그 달 평균 성취도 (다른 숫자와 같은 방향으로 읽히게)
  const tested = reports.filter((r) => r.word_total > 0);
  const correctSum = tested.reduce((a, r) => a + (r.word_correct ?? 0), 0);
  const totalSum = tested.reduce((a, r) => a + r.word_total, 0);
  const wrongSum = totalSum - correctSum;
  const wordRate = totalSum > 0 ? Math.round((correctSum / totalSum) * 100) : null;

  return {
    days: reports.length,
    att,
    homework: { done, weak, missing, checked, rate },
    word: { count: tested.length, wrong: wrongSum, total: totalSum, rate: wordRate },
    exams: exams || [],
  };
}

/**
 * 한 줄 평 — **기준**
 *
 * 지어내지 않는다. 위에서 센 숫자만 쓴다. 위에서부터 맞는 것 하나만 고른다
 * (여러 줄을 늘어놓으면 결국 안 읽는다).
 *
 *   0. 수업이 3회 미만이면 안 쓴다 — 몇 번 안 온 달을 두고 평하면 안 된다
 *   1. 지난달보다 숙제·단어가 10%p 이상 올랐다      → 오른 것을 말한다
 *   2. 지난달보다 15%p 이상 떨어졌다                → 떨어진 것을 말한다
 *   3. 결석·지각 0 · 숙제 95 이상 · 단어 90 이상    → 흠 없는 달
 *   4. 결석 3회 이상                                → 출결부터 말한다
 *   5. 숙제 70 미만                                 → 숙제
 *   6. 단어 70 미만                                 → 단어
 *   7. 숙제 90 이상                                 → 꾸준함
 *   8. 그 밖                                        → 안 쓴다
 *
 * 숫자는 여기 한 군데에 모아 둔다. 기준을 바꾸고 싶으면 이것만 고치면 된다.
 */
export const ONELINE_RULE = {
  minDays: 3,
  upBy: 10,
  downBy: 15,
  greatHomework: 95,
  greatWord: 90,
  absentAt: 3,
  lowHomework: 70,
  lowWord: 70,
  steadyHomework: 90,
};

export function oneLiner(sum, prev = null, R = ONELINE_RULE) {
  if (!sum || sum.days < R.minDays) return "";

  const hw = sum.homework.rate;
  const wd = sum.word.rate;
  const absent = sum.att.absent || 0;
  const late = sum.att.late || 0;

  // 1·2) 지난달과 견준다 — 변화가 제일 와닿는다
  if (prev) {
    const pairs = [
      { label: "숙제", now: hw, was: prev.homework?.rate },
      { label: "단어 테스트", now: wd, was: prev.word?.rate },
    ].filter((p) => p.now !== null && p.now !== undefined && p.was !== null && p.was !== undefined);

    const up = pairs
      .map((p) => ({ ...p, gap: p.now - p.was }))
      .filter((p) => p.gap >= R.upBy)
      .sort((a, b) => b.gap - a.gap)[0];
    if (up) {
      return `지난달보다 ${up.label}를 훨씬 잘 챙겼습니다 (${up.was}% → ${up.now}%). 그대로만 이어가면 좋겠습니다.`;
    }

    const down = pairs
      .map((p) => ({ ...p, gap: p.was - p.now }))
      .filter((p) => p.gap >= R.downBy)
      .sort((a, b) => b.gap - a.gap)[0];
    if (down) {
      return `지난달보다 ${down.label}가 조금 밀렸습니다 (${down.was}% → ${down.now}%). 다음 달에 함께 챙기겠습니다.`;
    }
  }

  // 3) 흠 없는 달
  if (
    absent === 0 && late === 0 &&
    hw !== null && hw >= R.greatHomework &&
    (wd === null || wd >= R.greatWord)
  ) {
    return "한 달 동안 빠짐없이 오고, 숙제도 거의 다 해왔습니다. 정말 성실했습니다.";
  }

  // 4) 출결
  if (absent >= R.absentAt) {
    return `이번 달은 결석이 ${absent}회 있었습니다. 빠진 날 진도는 따로 챙기고 있습니다.`;
  }

  // 5·6) 아쉬운 것
  if (hw !== null && hw < R.lowHomework) {
    return "숙제가 빠지는 날이 잦았습니다. 다음 달에는 학원에서도 함께 챙기겠습니다.";
  }
  if (wd !== null && wd < R.lowWord) {
    return "단어 테스트가 조금 아쉬웠습니다. 외우는 방법부터 같이 잡아보겠습니다.";
  }

  // 7) 꾸준함
  if (hw !== null && hw >= R.steadyHomework) {
    return "큰 흔들림 없이 꾸준히 해오고 있습니다.";
  }

  return "";
}

/** 성취도에 붙일 한마디 — 숫자만 보내면 매정하다 */
function rateWord(rate) {
  if (rate === null) return "";
  if (rate >= 95) return "거의 빠짐없이 해왔습니다.";
  if (rate >= 85) return "대체로 잘 해왔습니다.";
  if (rate >= 70) return "해오는 편이지만 빠지는 날이 있었습니다.";
  return "빠지는 날이 잦았습니다. 다음 달에 함께 챙기겠습니다.";
}

/**
 * 학부모께 나갈 월말 리포트 문구.
 * @param r { student, ym, sum, note }
 */
export function buildMonthlyText(r, academy = "클로이영어", msg = {}) {
  const { sum } = r;
  const L = [];
  L.push(`[${academy}] ${r.student.name} 학생 ${monthLabel(r.ym)} 학습 리포트`);
  L.push("");
  if (msg.greeting) {
    L.push(msg.greeting);
    L.push("");
  }

  // 출결
  const attParts = Object.entries(sum.att)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${ATT_LABEL[k] || k} ${n}회`);
  L.push(`▶ 출결 — 총 ${sum.days}회 수업`);
  L.push(attParts.length ? `· ${attParts.join(" / ")}` : "· 기록 없음");

  // 숙제
  L.push("");
  L.push("▶ 숙제");
  if (sum.homework.rate === null) {
    L.push("· 검사한 숙제가 없습니다.");
  } else {
    L.push(`· 성취도 ${sum.homework.rate}%  (검사 ${sum.homework.checked}건)`);
    const d = [];
    if (sum.homework.done) d.push(`완료 ${sum.homework.done}`);
    if (sum.homework.weak) d.push(`보충 필요 ${sum.homework.weak}`);
    if (sum.homework.missing) d.push(`미완료 ${sum.homework.missing}`);
    if (d.length) L.push(`· ${d.join(" / ")}`);
    const w = rateWord(sum.homework.rate);
    if (w) L.push(`· ${w}`);
  }

  // 단어 테스트
  if (sum.word.count > 0) {
    L.push("");
    L.push("▶ 단어 테스트");
    L.push(`· ${sum.word.count}회 · 평균 성취도 ${sum.word.rate}%`);
    L.push(`· 모두 ${sum.word.total}개 중 ${sum.word.wrong}개 틀렸습니다.`);
  }

  // 단원평가 · 시험
  if (sum.exams.length > 0) {
    L.push("");
    L.push("▶ 단원평가");
    sum.exams.forEach((e) => {
      const s = e.total ? ` ${score(e.score, e.total)}` : e.score ? ` ${e.score}` : "";
      L.push(`· ${e.name}${s}`);
    });
  }

  // 한 줄 평 — 원장님이 직접 적으신 게 있으면 그게 이깁니다 (사람 말이 낫다)
  const one = r.note ? "" : oneLiner(sum, r.prev || null);
  if (r.note || one) {
    L.push("");
    L.push(r.note || one);
  }
  if (msg.closing) {
    L.push("");
    L.push(msg.closing);
  }
  return L.join("\n");
}
