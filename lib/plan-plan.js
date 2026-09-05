/** 결석·지각 예정(02c) 중 순수한 것 — 달력 칸 만들기 · 날마다 표시 · 얼마나 눈금. 화면과 lib/plan.js 가 같이 쓴다. 수업일 자체는 SQL(v2.student_days) 한 곳 */
export const LATE_PRESET = Object.freeze([[10, "10분"], [20, "20분"], [30, "30분"], [60, "1시간"]]);
export const KIND = Object.freeze([["absent", "결석"], ["late", "지각"], ["none", "없음"]]);
const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
/** 달 하나의 칸 — 월요일부터 6줄 42칸. ym '2026-10' */
export function monthGrid(ym) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;   // 월=0
  const start = new Date(Date.UTC(y, m - 1, 1 - offset));
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start.getTime() + i * 86400000); return { date: iso(d), day: d.getUTCDate(), out: d.getUTCMonth() !== m - 1 }; });
}
export const nextYm = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
/** 날마다 표시 — days: student_days 줄 · absences: makeup(of_date, state) · lates: late_plan. 우선: 휴강 > 결석 > 지각 > 보강 > 수업 */
export function markOf(date, { days = [], absences = [], lates = [] }) {
  const d = days.filter((x) => x.date === date);
  const off = d.some((x) => x.kind === "off"), cls = d.some((x) => x.kind === "class"), mk = d.some((x) => x.kind === "makeup");
  const abs = absences.find((a) => a.of_date === date && !["done", "cancelled"].includes(a.state));
  const late = lates.find((l) => l.date === date && !l.cancelled_at);
  if (off) return { kind: "off", pick: false };
  if (abs) return { kind: "absent", pick: true, plan: abs };
  if (late) return { kind: "late", pick: cls, plan: late };
  if (mk) return { kind: "makeup", pick: false };
  if (cls) return { kind: "class", pick: true };
  return { kind: "none", pick: false };
}
/** 보강 날짜 글 — 「10/18 14:00」 · 안 잡음 · 아직 */
export const makeupText = (a) => !a ? "" : a.state === "waived" ? "보강 안 잡음" : a.state === "set" && a.on_date ? `보강 ${Number(a.on_date.slice(5, 7))}/${Number(a.on_date.slice(8, 10))}${a.at_time ? " " + String(a.at_time).slice(0, 5) : ""}` : "보강 안 잡힘";
