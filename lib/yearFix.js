/**
 * **연도 다시 맞추기** — 줄마다, 짐작이 아니라 따져서.
 *
 * 원장님 (2026-08-06) — 「올해인지 작년인지 재작년인지 모르는데 뭘 돌린다는거야」
 *
 * 맞는 말씀이다. 「2026-08-07 부터 12-31 까지 한 해 밀기」 는 **범위를 찍어
 * 통째로 미는 것**이고, 그 범위 안에 진짜 2026년 기록이 하나라도 있으면
 * 그것까지 망가진다. 그리고 1~7월에 숨은 것은 아예 못 잡는다.
 *
 * ── 그럼 무엇으로 정하나 ─────────────────────────────────
 *
 * 파일에 없는 연도를 만들어낼 수는 없다. 하지만 **후보를 지워나갈 수는 있다.**
 * 「08/14」 가 2024·2025·2026 중 하나라면, 아닌 것을 지우면 남는 것이 답이다.
 * 세 가지로 지운다 — 셋 다 이 앱이 이미 아는 것들이다.
 *
 * **1. 미래는 아니다.** 지난 일을 적은 기록이 앞으로의 날짜에 있을 수 없다.
 *
 * **2. 요일이 그 아이 반과 맞아야 한다.** 한 해는 52주 + 1일이라 연도가
 *    바뀌면 요일이 하루씩 밀린다. 월·수반 아이의 수업 기록이 금요일에 있을
 *    수는 없다. 이것이 제일 세게 지운다.
 *
 * **3. 그때 다니고 있어야 한다.** 2026년 3월에 등록한 아이에게 2025년
 *    수업 기록이 있을 수 없다 (`started_on` · `ended_on`).
 *
 * ── 남는 것이 하나일 때만 고친다 ─────────────────────────
 *
 * 후보가 하나로 좁혀지면 **그것이 답이다** — 짐작이 아니다.
 * 둘 이상 남으면 **손대지 않고 원장님께 보여드린다.** 반쯤 아는 것으로
 * 고치면, 지금 틀린 것보다 더 나쁜 상태가 된다 (어느 줄을 건드렸는지도
 * 모르게 된다).
 *
 * 여기에는 **계산만** 둔다.
 */

const DOWN = ["일", "월", "화", "수", "목", "금", "토"];
export const dowOf = (d) => DOWN[new Date(`${d}T00:00:00Z`).getUTCDay()];

/** 같은 월·일의 다른 해 (2026-08-14 · -1 → 2025-08-14) */
export function shiftYear(date, by) {
  const y = Number(date.slice(0, 4)) + by;
  return `${y}${date.slice(4)}`;
}

/** 그 날 실제로 있는 날인가 — 2024-02-29 는 있고 2025-02-29 는 없다 */
function real(d) {
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return false;
  return day <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * 이 줄이 될 수 있는 연도들.
 *
 * @param date      지금 들어가 있는 날짜
 * @param ctx {
 *   today      오늘
 *   classDays  그 아이 반 요일 (["월","수"]) — 없으면 요일로 안 지운다
 *   startedOn  등록일 · endedOn 퇴원일 — 없으면 안 지운다
 *   back       몇 해 전까지 볼까 (기본 2 — 재작년까지)
 * }
 * @returns [{ date, dow, ok, why }] 최근 해부터
 */
export function candidates(date, ctx = {}) {
  const { today, classDays, startedOn, endedOn, back = 2 } = ctx;
  const out = [];
  for (let i = 0; i >= -back; i--) {
    const d = shiftYear(date, i);
    if (!real(d)) continue;                       // 2월 29일이 없는 해
    const why = [];
    let ok = true;

    const isNow = d === date;                    // 지금 들어가 있는 값인가
    if (today && d > today) { ok = false; why.push("앞으로의 날짜"); }
    /**
     * **요일로 「지금 것」 을 지우지는 않는다** (2026-08-06).
     *
     * 반 요일은 **지금 것**만 알 수 있다. 작년에 월·수였다가 지금 화·목인
     * 아이의 옛 기록은 요일이 안 맞는 것이 당연하다 — 실제로 그렇게 306건이
     * 걸렸다. 요일로 지금 값을 지우면 **멀쩡한 기록을 옮기게 된다.**
     *
     * 그래서 요일은 **어느 해로 옮길지 고를 때**만 쓴다. 지금 값이 미래도
     * 아니고 재원 기간 안이라면, 요일이 안 맞아도 그대로 둔다.
     */
    if (classDays?.length && !isNow) {
      const w = dowOf(d);
      if (!classDays.includes(w)) { ok = false; why.push(`${w}요일 (반은 ${classDays.join("·")})`); }
    }
    // **다니기 전·그만둔 뒤는 아니다.** 날짜만 있고 시각이 없으므로 그날은 포함한다
    if (startedOn && d < startedOn) { ok = false; why.push(`등록(${startedOn}) 전`); }
    if (endedOn && d > endedOn) { ok = false; why.push(`퇴원(${endedOn}) 뒤`); }

    out.push({ date: d, dow: dowOf(d), ok, why });
  }
  return out;
}

/**
 * 한 줄을 어떻게 할까.
 *
 * @returns {
 *   verdict  "keep"    지금 그대로가 맞다
 *            "fix"     하나로 좁혀졌다 — 이 날짜로 고친다
 *            "ask"     둘 이상 남았다 — 원장님이 고르셔야 한다
 *            "none"    다 지워졌다 — 반 요일이 바뀌었거나 우리가 모르는 사정
 *   to       고칠 날짜 (fix 일 때)
 *   options  남은 후보들 (ask 일 때)
 * }
 */
export function decide(date, ctx = {}) {
  const list = candidates(date, ctx);
  const alive = list.filter((c) => c.ok);

  if (alive.length === 0) {
    return { verdict: "none", date, options: [], all: list };
  }
  if (alive.length === 1) {
    const only = alive[0];
    return only.date === date
      ? { verdict: "keep", date, to: date, options: alive, all: list }
      : { verdict: "fix", date, to: only.date, options: alive, all: list };
  }
  // 여럿 남았는데 **지금 것이 그중 하나**면 굳이 건드리지 않는다.
  // 확신 없이 옮기면 지금보다 나빠진다
  if (alive.some((c) => c.date === date)) {
    return { verdict: "keep", date, to: date, options: alive, all: list, shaky: true };
  }
  return { verdict: "ask", date, options: alive, all: list };
}

/**
 * 여러 줄을 한꺼번에 — 화면이 그대로 그릴 수 있게.
 *
 * @param rows  [{ id, date, student_id }]
 * @param ctxOf (row) => ctx
 */
export function plan(rows = [], ctxOf = () => ({})) {
  const out = { fix: [], ask: [], none: [], keep: 0, shaky: 0 };
  rows.forEach((r) => {
    const d = decide(r.date, ctxOf(r));
    if (d.verdict === "keep") {
      out.keep += 1;
      if (d.shaky) out.shaky += 1;
      return;
    }
    out[d.verdict].push({ ...r, ...d });
  });
  return out;
}

/** 화면에 한 줄로 — 「2026-08-14(금) → 2025-08-14(목)」 */
export function fixLine(x) {
  return `${x.date}(${dowOf(x.date)}) → ${x.to}(${dowOf(x.to)})`;
}
