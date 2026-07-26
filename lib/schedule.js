// 앞으로 3개월 수업 스케줄 점검
//   · 달마다 회차가 몇 번인지 (9회/7회 같은 특이사항)
//   · 시험 기간과 겹치는 수업일 → 타과목 시험이라 결석 예상
//   · 영어 시험 전날 → 정규수업이 아니어도 등원 필요
//
// 중요 — 회차는 **달마다 따로 보지 않는다.**
//   이번 달이 7회(1회 부족)인데 다음 달이 9회(1회 많음)면
//   보강도 휴강도 하지 말고 다음 달을 9회 그대로 하면 딱 맞는다.
//   그래서 3개월치를 **누적**으로 계산해서, 언제 상쇄되는지를 알림에 같이 적어준다.

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

  const rows = months.map((ym) => {
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

  return balance(rows);
}

// ------------------------------------------------------------------
// 회차 누적 계산
//   diff = 그 달 실제 수업 회차 − 기준 회차
//   cum  = 첫 달부터 그 달까지 diff 를 더한 값 (0 이면 그 시점에 딱 맞는다)
// ------------------------------------------------------------------

function mLabel(ym) {
  return `${Number(ym.split("-")[1])}월`;
}

export function balance(rows) {
  let run = 0;
  const withDiff = rows.map((m) => {
    const diff = m.base ? m.live.length - m.base : 0;
    run += diff;
    return { ...m, diff, cum: run };
  });
  const horizonTotal = run;

  return withDiff.map((m, i) => {
    if (!m.base || m.diff === 0) return m;

    // 언제 딱 맞아떨어지는가 — 이번 달까지(이전 달이 메워준 경우) 또는 이후 달
    let settleAt = m.cum === 0 ? i : withDiff.findIndex((x, j) => j > i && x.cum === 0);
    if (settleAt < 0) settleAt = null;

    // 상쇄에 관여하는 달들을 그대로 보여준다 (판단은 원장이 한다)
    const span = withDiff
      .slice(0, settleAt === null ? withDiff.length : settleAt + 1)
      .filter((x) => x.base && x.diff !== 0)
      .map((x) => `${mLabel(x.ym)} ${x.live.length}회(${x.diff > 0 ? "+" : ""}${x.diff})`)
      .join(" · ");

    const many = m.diff > 0;
    const head = many
      ? `${m.live.length}회 — 기준 ${m.base}회보다 ${m.diff}회 많습니다.`
      : `${m.live.length}회 — 기준 ${m.base}회보다 ${-m.diff}회 적습니다.`;

    let advice;
    if (settleAt !== null) {
      const until = mLabel(withDiff[settleAt].ym);
      advice =
        `${span} → ${until}까지 합치면 기준과 정확히 맞습니다. ` +
        `보강도 휴강도 하지 말고 ${until}까지 그대로 수업하면 됩니다.`;
    } else if (horizonTotal === 0) {
      advice = `${span} → 3개월 합계는 맞습니다. 그대로 진행하세요.`;
    } else {
      const rest = horizonTotal > 0 ? `${horizonTotal}회 많음` : `${-horizonTotal}회 부족`;
      advice =
        `${span} → 3개월을 다 합쳐도 ${rest}. ` +
        (horizonTotal > 0
          ? "그냥 하면 서비스, 쉬려면 아래에서 휴강으로 지정하세요."
          : "보강이 필요합니다.");
    }

    return {
      ...m,
      settled: settleAt !== null,
      alerts: [
        {
          kind: many ? "over" : "short",
          text: head,
          advice,
          settled: settleAt !== null,
          extra: Math.abs(m.diff),
          // 상쇄 구간의 첫 달에만 표시 — 대시보드에서 같은 말이 여러 번 뜨지 않게
          primary: i === 0 || withDiff[i - 1].cum === 0,
        },
        ...m.alerts,
      ],
    };
  });
}
