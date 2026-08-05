// 월간리포트
//
// 하루치 데일리리포트는 그날만 보여준다. 한 달을 모아 보면 다른 게 보인다.
//   숙제를 얼마나 해왔는지, 몇 번 왔는지, 단원평가는 어땠는지.
//
// 새로 입력받는 것은 없다. **그 달의 데일리리포트를 다시 세는 것**뿐이다.

import { parts } from "./day.js";
import { score, scoreRaw } from "./wordTest.js";

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

  // 단어 테스트 — **수업당 평균**으로 본다.
  //
  // 한 달치를 통째로 합치면 (맞은 개수 ÷ 전체 개수) 시험 범위가 큰 날이
  // 그 달 전체를 끌고 간다. 30개짜리 하루를 잘 보면 10개짜리 네 번을
  // 못 봐도 평균이 좋아 보인다. 그래서 **하루하루의 성취도를 낸 다음
  // 그것들의 평균**을 낸다. 시험 한 번이 한 표다.
  const tested = reports.filter((r) => r.word_total > 0);
  const each = tested.map((r) => (r.word_correct ?? 0) / r.word_total);
  const wordRate = each.length
    ? Math.round((each.reduce((a, x) => a + x, 0) / each.length) * 100)
    : null;
  // 개수도 **한 번 볼 때 기준**으로 적는다.
  //
  // "한 달에 100개 중 10개 틀렸습니다" 는 학부모가 감을 못 잡는다. 100개가
  // 몇 번에 나눠서 본 것인지 모르기 때문이다. "한 번에 10개 보고 1개 틀렸다"
  // 는 바로 읽힌다 — 시험 한 번의 모습이 그대로 그려진다.
  const correctSum = tested.reduce((a, r) => a + (r.word_correct ?? 0), 0);
  const totalSum = tested.reduce((a, r) => a + r.word_total, 0);
  const wrongSum = totalSum - correctSum;
  const avgTotal = tested.length ? Math.round(totalSum / tested.length) : null;
  // 오답은 반올림하면 0개가 되어 "다 맞았다" 로 읽힌다. 한 자리까지 남긴다
  const avgWrong = tested.length ? Math.round((wrongSum / tested.length) * 10) / 10 : null;

  // 제일 잘 본 날과 제일 못 본 날 — 평균만 보면 둘 다 안 보인다
  const best = each.length ? Math.round(Math.max(...each) * 100) : null;
  const worst = each.length ? Math.round(Math.min(...each) * 100) : null;

  return {
    days: reports.length,
    att,
    homework: { done, weak, missing, checked, rate },
    word: {
      count: tested.length,
      wrong: wrongSum,
      total: totalSum,
      avgTotal,
      avgWrong,
      rate: wordRate,
      best,
      worst,
      perTest: each.map((x) => Math.round(x * 100)),
    },
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
/**
 * 학교 시험 기간이 아닌 날의 결석이 몇 회부터 한마디를 붙일까.
 *
 * 한 달에 8~9회 수업에서 두 번이면 4분의 1이다. 한 번은 누구나 있는 일이라
 * 붙이지 않는다 — 한 번에도 말하면 그 말이 흔해져서 정작 필요할 때 안 들린다.
 */
export const ABSENCE_NOTE_AT = 2;

/** 그 달 결석 중 학교 시험 기간에 걸치지 않은 것이 몇 번인가 */
export function offScheduleAbsences(reports = [], periods = []) {
  const inExam = (d) => periods.some((p) => d >= p.from_date && d <= p.to_date);
  return reports.filter(
    (r) => r.attendance_kind === "absent" && r.date && !inExam(r.date)
  ).length;
}

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

export function oneLiner(sum, prev = null, R = ONELINE_RULE, opts = {}) {
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

  // 4) 출결 — 위에서 이미 결석 이야기를 했으면 또 하지 않는다.
  //    같은 말을 두 번 하면 잔소리로 읽힌다.
  if (!opts.saidAbsence && absent >= R.absentAt) {
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

/** 1.0 은 1 로, 1.5 는 1.5 로 — 뒤에 .0 이 붙으면 눈에 걸린다 */
function num(n) {
  if (n === null || n === undefined) return "0";
  return Number.isInteger(n) ? String(n) : String(n);
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
 * 학부모께 나갈 월간리포트 문구.
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

  // 학교 시험 기간이 아닌 날의 결석이 잦을 때.
  //
  // 대놓고 지적하면 학부모가 방어부터 하게 된다. 그래서 **아이를 탓하지 않고**
  // 왜 이어서 듣는 게 나은지로 말한다. 부탁의 형태지만 읽으면 안다.
  // 시험 기간 결석은 세지 않는다 — 그건 어쩔 수 없는 것이고, 그걸 같이 세면
  // 이 말이 억울해져서 아무 힘이 없어진다.
  const saidAbsence = (sum.offSchedule || 0) >= ABSENCE_NOTE_AT;
  if (saidAbsence) {
    L.push(
      `· 학교 시험 기간이 아닌 날의 결석이 ${sum.offSchedule}회 있었습니다. ` +
        "빠진 회차는 보강으로 채우고 있습니다."
    );
    L.push(
      "· 수업의 연속성을 통해 실력이 향상되는 만큼, 가능하시면 정규 수업일에 " +
        "맞춰주시면 아이에게 도움이 됩니다."
    );
  }

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
    // 수업당 평균이다 — 시험 한 번이 한 표다. 범위가 큰 날이 한 달을 끌고 가지 않는다
    L.push(`· ${sum.word.count}회 · 회차당 평균 ${sum.word.rate}%`);
    // 한 달치를 합친 개수가 아니라 **한 번 볼 때** 기준이라야 그림이 그려진다
    if (sum.word.avgTotal) {
      L.push(`· 한 번에 평균 ${sum.word.avgTotal}개를 보고 ${num(sum.word.avgWrong)}개 틀렸습니다.`);
    }
    // 평균만 보면 잘 본 날도 무너진 날도 안 보인다
    if (sum.word.best !== null && sum.word.worst !== null && sum.word.best !== sum.word.worst) {
      L.push(`· 가장 좋았던 회차 ${sum.word.best}% / 가장 낮았던 회차 ${sum.word.worst}%`);
    }
  }

  // 단원평가 · 시험
  if (sum.exams.length > 0) {
    L.push("");
    L.push("▶ 단원평가");
    sum.exams.forEach((e) => {
      // 단원평가는 **점수로** 읽는다 — 「18/20 (90%)」
      const s = e.total ? ` ${scoreRaw(e.score, e.total)}` : e.score ? ` ${e.score}점` : "";
      L.push(`· ${e.name}${s}`);
    });
    // 단어와 같은 방식 — **시험당 평균**이다. 개수를 합치면 문항 많은 시험이 끌고 간다
    const rates = sum.exams
      .filter((e) => e.total > 0 && e.score !== null && e.score !== undefined)
      .map((e) => e.score / e.total);
    if (rates.length >= 2) {
      const avg = Math.round((rates.reduce((a, x) => a + x, 0) / rates.length) * 100);
      L.push(`· ${rates.length}회 · 시험당 평균 ${avg}%`);
    }
  }

  // 한 줄 평 — 원장님이 직접 적으신 게 있으면 그게 이깁니다 (사람 말이 낫다)
  const one = r.note ? "" : oneLiner(sum, r.prev || null, ONELINE_RULE, { saidAbsence });
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
