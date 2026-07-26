// 앞으로 3개월 수업 스케줄 점검
//   · 달마다 회차가 몇 번인지 (9회/7회 같은 특이사항)
//   · 시험 기간과 겹치는 수업일 → 타과목 시험이라 결석 예상
//   · 영어 시험 전날 → 정규수업이 아니어도 등원 필요

const DOWN = ["일", "월", "화", "수", "목", "금", "토"];

export function ymOf(d) {
  return d.slice(0, 7);
}
export function addDaysISO(d, n) {
  const t = new Date(`${d}T00:00:00+09:00`);
  t.setDate(t.getDate() + n);
  return t.toISOString().slice(0, 10);
}
export function dowOf(d) {
  return DOWN[new Date(`${d}T00:00:00+09:00`).getDay()];
}
export function monthsFrom(startYM, count) {
  const [y, m] = startYM.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** 그 달에 이 반이 수업하는 날짜 */
export function datesOfMonth(ym, days = []) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= last; d++) {
    const iso = `${ym}-${String(d).padStart(2, "0")}`;
    if (days.includes(dowOf(iso))) out.push(iso);
  }
  return out;
}

/**
 * 반 한 개의 3개월 점검
 * @param klass    { id, name, days, base_sessions }
 * @param months   ["2026-08", ...]
 * @param holidays [{ date, scope, class_id }]
 * @param exams    [{ school, grade, from_date, to_date, english_on }]
 * @param roster   [{ school, grade }]  이 반 학생들
 */
export function reviewClass(klass, months, holidays = [], exams = [], roster = []) {
  const offSet = new Set(
    holidays
      .filter((h) => h.scope === "all" || h.class_id === klass.id)
      .map((h) => h.date)
  );

  // 이 반 학생들에게 걸리는 시험만
  const mine = exams.filter((e) =>
    roster.some(
      (s) =>
        (s.school || "") === e.school &&
        (!e.grade || (s.grade || "") === e.grade)
    )
  );

  return months.map((ym) => {
    const all = datesOfMonth(ym, klass.days || []);
    const off = all.filter((d) => offSet.has(d));
    const live = all.filter((d) => !offSet.has(d));
    const base = klass.base_sessions || null;

    // 시험 기간과 겹치는 수업일
    const inExam = live.filter((d) =>
      mine.some((e) => d >= e.from_date && d <= e.to_date)
    );

    // 영어 시험 전날 = 등원 필요 (정규수업이든 아니든)
    const engEve = mine
      .filter((e) => e.english_on)
      .map((e) => ({ ...e, eve: addDaysISO(e.english_on, -1) }))
      .filter((e) => ymOf(e.eve) === ym)
      .map((e) => ({
        date: e.eve,
        english_on: e.english_on,
        school: e.school,
        grade: e.grade,
        isClassDay: (klass.days || []).includes(dowOf(e.eve)),
      }));

    const alerts = [];
    if (base && live.length > base) {
      alerts.push({
        kind: "over",
        text: `${live.length}회 — 기준 ${base}회보다 ${live.length - base}회 많습니다. 그냥 하면 서비스, 쉬려면 휴강으로 지정하세요.`,
        extra: live.length - base,
      });
    }
    if (base && live.length < base) {
      alerts.push({
        kind: "short",
        text: `${live.length}회 — 기준 ${base}회보다 ${base - live.length}회 적습니다. 보강이 필요합니다.`,
        extra: base - live.length,
      });
    }
    if (off.length > 0) {
      alerts.push({ kind: "off", text: `휴강 ${off.length}회`, extra: off.length });
    }
    if (inExam.length > 0) {
      alerts.push({
        kind: "exam",
        text: `타과목 시험 기간에 수업 ${inExam.length}회 — 결석이 많을 수 있습니다.`,
        extra: inExam.length,
      });
    }
    engEve.forEach((e) => {
      alerts.push({
        kind: "engEve",
        text: `${e.date.slice(5)} 영어 시험(${e.english_on.slice(5)}) 전날 — ${
          e.isClassDay ? "정규수업일" : "정규수업이 아니지만 등원 필요"
        }`,
        date: e.date,
      });
    });

    return { ym, all, off, live, base, inExam, engEve, alerts };
  });
}
