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

  // 단어 테스트 — 그 달 평균 오답률
  const tested = reports.filter((r) => r.word_total > 0);
  const wrongSum = tested.reduce(
    (a, r) => a + Math.max(0, r.word_total - (r.word_correct ?? 0)),
    0
  );
  const totalSum = tested.reduce((a, r) => a + r.word_total, 0);
  const wrongPct = totalSum > 0 ? Math.round((wrongSum / totalSum) * 100) : null;

  return {
    days: reports.length,
    att,
    homework: { done, weak, missing, checked, rate },
    word: { count: tested.length, wrong: wrongSum, total: totalSum, wrongPct },
    exams: exams || [],
  };
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
    L.push(`· ${sum.word.count}회 · 평균 오답률 ${sum.word.wrongPct}%`);
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

  if (r.note) {
    L.push("");
    L.push(r.note);
  }
  if (msg.closing) {
    L.push("");
    L.push(msg.closing);
  }
  return L.join("\n");
}
