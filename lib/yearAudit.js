/**
 * **연도 점검** — 24·25·26년이 섞여 들어가지 않았나.
 *
 * 원장님 (2026-08-06) — 「노션자료에서 24,25,26년이 서로 구별되지 않게
 * 적혀서 혼용된 거 없나 싹 확인해줘」
 *
 * ── 왜 섞이나 ────────────────────────────────────────────
 *
 * 노션은 날짜를 **「12/30」 처럼 연도 없이** 적어둔 것이 많다 — 특히 제목이
 * 그렇다 (`07/20/월 김서은 DP`). 옮길 때 그런 줄에는 **옮기기 화면의 연도
 * 칸** 값을 붙인다. 그 칸의 기본값은 올해다.
 *
 * 그래서 2024년 자료를 그냥 올리면 **2024년 수업이 통째로 2026년이 된다.**
 * 오류가 안 나고, 화면에는 「141줄 옮겼습니다」 라고 멀쩡히 뜬다.
 *
 * ── 무엇으로 알아채나 ────────────────────────────────────
 *
 * 이미 들어간 자료에는 「이 줄은 짐작이었다」 는 표시가 없다. 그래서 **모양**
 * 으로 찾는다. 셋 다 사람 눈에는 안 보이고 셈으로는 뚜렷하다.
 *
 *   1. **미래에 있는 수업 기록** — 수업은 미래일 수 없다. 지난 12월 기록이
 *      올해로 붙으면 곧바로 미래가 된다. 제일 확실한 증거다.
 *   2. **한 해에 몰려 있는 것** — 2년치를 옮겼는데 한 해에만 쌓여 있으면
 *      나머지 해가 그 해로 흡수된 것이다.
 *   3. **같은 학생·같은 월일이 여러 해에** — 「3월 4일」 이 24·25·26년에
 *      다 있으면 진짜 그럴 수도 있지만, 한쪽만 잔뜩이면 옮기다 눌린 것이다.
 *
 * 여기에는 **계산만** 둔다. 고치는 것은 사람이 한다 — 어느 해가 맞는지는
 * 원장님만 아신다.
 */

/** 연도별 건수 — { "2024": 12, "2025": 88, "2026": 305 } */
export function byYear(rows = [], dateOf = (r) => r.date) {
  const bag = {};
  rows.forEach((r) => {
    const y = (dateOf(r) || "").slice(0, 4);
    if (!/^\d{4}$/.test(y)) return;
    bag[y] = (bag[y] || 0) + 1;
  });
  return bag;
}

/**
 * **미래에 있는 것** — 지난 일을 적은 기록이 미래에 있으면 연도가 잘못됐다.
 *
 * 오늘도 미래가 아니다. 앞으로 잡아둔 일정(tasks)에는 이 검사를 쓰지 않는다.
 */
export function futureRows(rows = [], today, dateOf = (r) => r.date) {
  return rows.filter((r) => {
    const d = dateOf(r);
    return d && d > today;
  });
}

/**
 * **같은 월·일이 여러 해에 걸쳐 있는 학생** — 옮기다 눌린 자국.
 *
 * 한쪽 해에만 쌓여 있으면 그 해로 흡수된 것이다.
 */
export function sameDayAcrossYears(rows = [], keyOf = (r) => r.student_id, dateOf = (r) => r.date) {
  const bag = new Map();
  rows.forEach((r) => {
    const d = dateOf(r) || "";
    if (d.length < 10) return;
    const k = `${keyOf(r)}|${d.slice(5)}`;      // 학생 + 월-일
    if (!bag.has(k)) bag.set(k, new Set());
    bag.get(k).add(d.slice(0, 4));
  });
  return [...bag.entries()]
    .filter(([, years]) => years.size > 1)
    .map(([k, years]) => ({ key: k, years: [...years].sort() }));
}

/**
 * 한 자료 묶음을 점검한다.
 *
 * @param label   화면에 적을 이름 (「수업 기록」)
 * @param rows    그 표의 줄들
 * @param today   오늘 (YYYY-MM-DD)
 * @param opts    { dateOf, keyOf, future: 미래를 문제로 볼까 }
 */
export function auditRows(label, rows = [], today, opts = {}) {
  const dateOf = opts.dateOf || ((r) => r.date);
  const keyOf = opts.keyOf || ((r) => r.student_id);
  const years = byYear(rows, dateOf);
  const future = opts.future === false ? [] : futureRows(rows, today, dateOf);
  const crossed = sameDayAcrossYears(rows, keyOf, dateOf);

  const notes = [];
  if (future.length > 0) {
    // **제일 확실한 증거다.** 지난 일이 미래에 있을 수는 없다
    notes.push({
      tone: "bad",
      text: `앞으로의 날짜에 ${future.length}건이 있습니다 — 지난 기록이라면 연도가 잘못 붙은 것입니다.`,
      sample: future.slice(0, 5).map(dateOf),
    });
  }
  const keys = Object.keys(years).sort();
  if (keys.length === 1 && rows.length >= 30) {
    notes.push({
      tone: "warn",
      text: `${keys[0]}년 한 해에만 ${rows.length}건이 몰려 있습니다. 여러 해를 옮기셨다면 한 해로 눌린 것일 수 있습니다.`,
    });
  }
  if (crossed.length > 0) {
    notes.push({
      tone: "muted",
      text: `같은 학생·같은 월일이 여러 해에 걸친 것이 ${crossed.length}건 있습니다 (해가 제대로 갈렸다는 뜻이기도 합니다).`,
    });
  }

  return { label, total: rows.length, years, future: future.length, crossed: crossed.length, notes };
}

/** 화면 맨 위에 한 줄로 — 「걸리는 것 2가지」 */
export function summarize(audits = []) {
  const bad = audits.flatMap((a) => a.notes.filter((n) => n.tone === "bad"));
  const warn = audits.flatMap((a) => a.notes.filter((n) => n.tone === "warn"));
  const years = {};
  audits.forEach((a) =>
    Object.entries(a.years).forEach(([y, n]) => (years[y] = (years[y] || 0) + n))
  );
  return { bad: bad.length, warn: warn.length, years };
}
