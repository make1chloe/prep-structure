import { DOW as DOWN } from "./day.js";
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
export function futureRows(rows = [], today, dateOf = (r) => r.date, okAhead = null) {
  return rows.filter((r) => {
    const d = dateOf(r);
    if (!d || d <= today) return false;
    // **앞으로 잡아둔 것은 이상하지 않다** — 보강 예정일, 사전 연락 결석 (2026-08-06)
    return !(okAhead && okAhead(r));
  });
}

/**
 * **출결에서 미래여도 되는 줄** (2026-08-06).
 *
 * 원장님 화면에서 보강 4건이 빨갛게 떴다 — 2026-08-14 · 08-24 · 08-31.
 * 앞으로 잡아둔 **보강 예정일**이었다. 보강은 원래 미래에 잡는 것이고,
 * 시험 기간 결석도 미리 넣는다. 그것을 「연도가 잘못됐다」 고 하면
 * 안 그런 것을 고치게 만든다.
 */
export const attendanceAhead = (r) => r?.status === "makeup" || r?.planned === true;

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
  const future = opts.future === false ? [] : futureRows(rows, today, dateOf, opts.okAhead);
  const crossed = sameDayAcrossYears(rows, keyOf, dateOf);
  // 요일이 반과 안 맞는 것 — 연도가 밀렸다는 가장 확실한 자국
  const offDow = opts.daysOf ? dowMismatch(rows, opts.daysOf, { dateOf, keyOf }) : [];
  const shifted = offDow.filter((x) => x.fits);

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
  /**
   * **요일만으로는 단정하지 않는다** (2026-08-06, 원장님 화면에서 배운 것).
   *
   * 요일 검사는 처음에 큰일을 했다 — 미래에 있던 233건의 연도를 정확히
   * 짚어냈다. 그래서 「한 해 당기면 맞는다」 를 **빨간 확정**으로 적었다.
   *
   * 그런데 자료를 제대로 다시 올리신 뒤 **306건**이 걸렸다. 원본에는 2024년
   * 자료가 아예 없으니 그 306건은 밀린 것이 아니다. **반이 바뀐 아이들**이었다 —
   * 우리가 아는 반 요일은 **지금 것**이라, 작년에 월·수였다가 지금 화·목인
   * 아이의 옛 기록이 전부 걸린다.
   *
   * 그래서 규칙을 바꿨다. **미래인 줄이 함께 있을 때만** 강한 증거로 본다.
   * 미래가 없으면 「반이 바뀌었을 수 있다」 는 쪽이 훨씬 흔하다.
   * 확정을 남발하면, 정작 진짜일 때 안 믿게 된다.
   */
  if (offDow.length > 0) {
    const strong = future.length > 0 && shifted.length > 0;
    notes.push({
      tone: strong ? "bad" : "muted",
      text: strong
        ? `요일이 반과 안 맞는 기록이 ${shifted.length}건 있고, 한 해 앞으로 당기면 반 요일과 맞습니다 — 위의 미래 날짜와 같은 원인으로 보입니다.`
        : `요일이 지금 반과 안 맞는 기록이 ${offDow.length}건 있습니다. ` +
          `대개 **반이 바뀐 아이의 옛 기록**이거나 보강·특강입니다 — 반 요일은 지금 것으로만 견줄 수 있어서요. ` +
          `미래 날짜가 함께 나오지 않았다면 연도 문제는 아닙니다.`,
      sample: (strong ? shifted : offDow)
        .slice(0, 5)
        .map((x) => (strong ? `${x.date}(${x.dow}) → ${x.back}` : `${x.date}(${x.dow}) · 지금 반 ${x.days.join("·")}`)),
    });
  }
  if (crossed.length > 0) {
    notes.push({
      tone: "muted",
      text: `같은 학생·같은 월일이 여러 해에 걸친 것이 ${crossed.length}건 있습니다 (해가 제대로 갈렸다는 뜻이기도 합니다).`,
    });
  }

  return {
    label, total: rows.length, years,
    future: future.length, crossed: crossed.length,
    offDow: offDow.length, shifted: shifted.length,
    notes,
  };
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

/**
 * **요일이 반과 안 맞는 기록** — 연도가 밀렸다는 가장 확실한 자국.
 *
 * 2026-08-06 원장님 화면에서 이것으로 잡았다. 「앞으로의 날짜」 예시에
 * **2026-08-14 (금)** 와 **2026-08-21 (금)** 이 있었다. 이 학원은 월·수 /
 * 화·목이고 **금요일은 보강일**이다 — 정규 수업 기록이 금요일에 있을 수 없다.
 * 한 해 앞으로 당겨보니 2025-08-14 는 **목요일**, 화·목반과 정확히 맞았다.
 *
 * 까닭은 셈으로 나온다. **한 해는 365일 = 52주 + 1일**이라, 연도가 한 해
 * 밀리면 요일이 **정확히 하루** 밀린다. 그래서 월·수반 기록이 화·목에,
 * 화·목반 기록이 수·금에 놓인다. 눈으로는 안 보이지만 셈으로는 뚜렷하다.
 *
 * **반 배정은 지금 것**이라 옛 기록과 다를 수 있다 — 그래서 「틀렸다」 가
 * 아니라 「살펴볼 것」 으로 돌려준다. 판단은 원장님이 하신다.
 *
 * @param daysOf  student_id → ["월","수"]
 */
export function dowOfDate(d) {
  return DOWN[new Date(`${d}T00:00:00Z`).getUTCDay()];
}

export function dowMismatch(rows = [], daysOf = new Map(), opts = {}) {
  const dateOf = opts.dateOf || ((r) => r.date);
  const keyOf = opts.keyOf || ((r) => r.student_id);
  const out = [];
  rows.forEach((r) => {
    const d = dateOf(r);
    if (!d || d.length < 10) return;
    const days = daysOf.get(keyOf(r));
    // 반이 없거나 요일을 안 적어둔 반은 견줄 수가 없다
    if (!days || days.length === 0) return;
    const w = dowOfDate(d);
    if (days.includes(w)) return;
    // **한 해 앞으로 당기면 맞아떨어지나** — 맞으면 연도가 밀린 것이다
    const back = `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
    out.push({ date: d, dow: w, days, fits: days.includes(dowOfDate(back)), back });
  });
  return out;
}
