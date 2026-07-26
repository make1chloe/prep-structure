// 회차 기준 수강료 계산
//   회차 = 그 달 해당 요일 수업일 − 전체 휴강 − 반 휴강
//   금액 = 월 수강료 × 실제 회차 ÷ 기준 회차
// 결석은 차감하지 않는다 (보강으로 처리하므로).

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function monthRange(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${ym}-${String(lastDay).padStart(2, "0")}`;
  return { first, last, lastDay, y, m };
}

// 그 달에 이 반이 수업하는 날짜 전부
export function sessionDates(ym, days = []) {
  const { y, m, lastDay } = monthRange(ym);
  const out = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(Date.UTC(y, m - 1, d));
    const dow = DAYS[date.getUTCDay()];
    if (days.includes(dow)) {
      out.push(`${ym}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

/**
 * 반 하나의 그 달 회차
 * @returns { all: string[], off: string[], live: string[] }
 */
export function classSessions(ym, klass, holidays = []) {
  const all = sessionDates(ym, klass.days || []);
  const offSet = new Set(
    holidays
      .filter((h) => h.scope === "all" || h.class_id === klass.id)
      .map((h) => h.date)
  );
  const off = all.filter((d) => offSet.has(d));
  const live = all.filter((d) => !offSet.has(d));
  return { all, off, live };
}

/**
 * 학생 한 명의 그 달 금액
 * @param live      휴강 뺀 수업일 목록
 * @param baseCount 기준 회차 (반에 적힌 값 없으면 live.length)
 * @param unit      월 수강료
 * @param student   { started_on, ended_on }
 */
export function studentAmount(live, baseCount, unit, student = {}) {
  const from = student.started_on || null;
  const to = student.ended_on || null;
  const mine = live.filter((d) => (!from || d >= from) && (!to || d <= to));
  const base = baseCount || live.length || 0;
  if (!unit || base === 0) {
    return { sessions: mine.length, base, amount: null, full: mine.length === live.length };
  }
  const amount = Math.round((unit * mine.length) / base / 10) * 10; // 10원 단위
  return { sessions: mine.length, base, amount, full: mine.length === live.length };
}

export function won(n) {
  if (n === null || n === undefined) return "—";
  return `${n.toLocaleString()}원`;
}
