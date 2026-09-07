/** 🏫 반 판단(순수 · 4단계-3a) — 반 만들기 읽기 · 요일·시각 글 · 반 한 줄 · 단가 글 · 넣을 아이 후보 · 그 시각 아이 수 글(확정-㉔ 보여만 준다). 값을 두 번 적지 않는다 — 13·14·12 가 같은 표를 본다 */
import { W, classText } from "./schedule-plan.js";
import { won } from "./fee-plan.js";
export const KIND = Object.freeze([["regular", "정규"], ["special", "특강"]]);
export const kindName = (k) => KIND.find(([x]) => x === k)?.[1] ?? k;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t ?? ""));
/** 반 만들기·시간표 바꾸기 양식 읽기 — 이름 · 갈래 · 요일(0 일 ~ 6 토, 하나 이상) · 시각(끝이 뒤) · 이 날부터 */
export function parseClass(f = {}) {
  const nickname = String(f.nickname ?? "").trim(); if (!nickname) throw new Error("반 이름을 적으세요");
  const kind = String(f.kind ?? "regular"); if (!KIND.some(([k]) => k === kind)) throw new Error(`갈래가 아닙니다: ${kind}`);
  return { nickname, kind, ...parseSchedule(f) };
}
export function parseSchedule(f = {}) {
  const weekdays = [...new Set((f.weekdays ?? []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (!weekdays.length) throw new Error("요일을 하나 이상 고르세요");
  const start = String(f.start ?? "").trim(), end = String(f.end ?? "").trim();
  if (!isTime(start) || !isTime(end)) throw new Error("시각은 「16:00」처럼 적으세요");
  if (end <= start) throw new Error("끝나는 시각이 시작보다 뒤여야 합니다");
  const fromDate = String(f.fromDate ?? "").trim(); if (!isDate(fromDate)) throw new Error("언제부터인지(날짜)를 적으세요");
  return { weekdays, start, end, fromDate };
}
/** 반 단가 줄 양식 읽기 — 금액(원) · 회차제인가 · 이 날부터 */
export function parseClassFee(f = {}) {
  const amount = Number(String(f.amount ?? "").replace(/[^\d]/g, "")); if (!(amount > 0)) throw new Error("금액을 적으세요");
  const fromDate = String(f.fromDate ?? "").trim(); if (!isDate(fromDate)) throw new Error("언제부터인지(날짜)를 적으세요");
  return { amount, perSession: Boolean(f.perSession), fromDate };
}
export const weekdayText = (weekdays = []) => (weekdays ?? []).map((d) => W[d]).join("·") || "요일 없음";
export const timeText = (s) => (s?.start_time ? `${String(s.start_time).slice(0, 5)}~${String(s.end_time ?? "").slice(0, 5)}` : "");
/** 반 한 줄 — 「매일 5:00 리허설 · 정규 · 월·수 16:00~17:30 · 3명」 */
export function classLine(c) {
  const s = c?.schedule; return [c?.nickname ?? "(이름 없음)", kindName(c?.kind), s ? `${weekdayText(s.weekdays)} ${timeText(s)}` : "시간표 없음", `${(c?.members ?? []).length}명`].join(" · ");
}
export const feeText = (fee) => (fee?.amount == null ? "단가 없음(학년 기준·학생별 금액으로)" : `${won(fee.amount)}${fee.per_session ? " × 회차" : " / 달"} · ${String(fee.from_date).slice(0, 10)}부터`);
/** 넣을 아이 후보 — 재원생 중 이 반에 없는 아이 */
export const candidates = (students = [], members = []) => (students ?? []).filter((s) => !(members ?? []).some((m) => m.student_id === s.id));
/** 그 시각 아이 수 글 — 「그 시각 4명 — 매일 반 3 · 보강 1 · 막지 않습니다」 · 아무도 없으면 「그 시각 비어 있습니다」 */
export function slotText(sc) {
  if (!sc) return "";
  const classes = sc.classes ?? [], mk = Number(sc.makeups ?? 0), n = classes.reduce((a, c) => a + Number(c.n ?? 0), 0) + mk;
  if (!n) return "그 시각 비어 있습니다";
  return `그 시각 ${n}명 — ${[...classes.map((c) => `${c.nickname} ${c.n}`), mk ? `보강 ${mk}` : null].filter(Boolean).join(" · ")} · 막지 않습니다`;
}
export { classText };
