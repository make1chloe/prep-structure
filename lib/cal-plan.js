/** 달력 판단 한 벌(순수, 목업 09b — 학생·학부모 맨 밑) — 달 범위(월요일부터 42칸) · 날마다 표시(휴강 – › 결석 ✕(보강 ↻) › 지각·늦귀가 ⏰ › 정시 ✓ › 보강 ↻ › 수업 예정 · / 숙제 📘 · 시험 📝) ·
 *  날 하나의 줄들(출 · 늦귀가 · 수업일지 · 숙제 · 시험 · 휴강). 전부 저장된 원재료에서 세어 나온다(원칙-5). 09 학부모 달력도 이 한 벌을 쓴다 */
import { monthGrid, nextYm, makeupText, monthLabel } from "./plan-plan.js";
import { weekdayName, seoulTime } from "./day-plan.js";
import { arrivalState } from "./arrival-plan.js";
import { hhmm } from "./late-plan.js";
import { KIND as QKIND } from "./quiz-plan.js";
export { nextYm, monthLabel };
export const ymOf = (date) => String(date).slice(0, 7);
export const dayTitle = (date, today) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 ${weekdayName(date)}${date === today ? " · 오늘" : ""}`;
/** 달 하나가 덮는 날짜 범위(앞뒤 달의 자투리까지) */
export function monthRange(ym) { const grid = monthGrid(ym); return { from: grid[0].date, to: grid[41].date, grid }; }
export const LEGEND = Object.freeze([["i-ok", "✓", "정시"], ["i-late", "⏰", "지각·늦귀가"], ["i-abs", "✕", "결석"], ["i-mk", "↻", "보강"], ["i-hw", "📘", "숙제"], ["i-due", "🚩", "내가 정한 마감"], ["i-cls", "·", "수업 예정"], ["i-ex", "📝", "시험"], ["i-off", "–", "휴강"]]);
const ATTEND_NAME = Object.freeze({ present: "왔음", late: "지각", absent: "결석", early: "조퇴", online: "온라인", makeup: "보강으로 옴", off: "휴강" });
const examOn = (e) => e.english_on ?? e.term_from ?? null;
/** 날 하나의 표시들 — 우선 하나 + 숙제·시험. 앞날은 예정만(수업 · · 결석 ✕ · 지각 ⏰ · 보강 ↻ · 시험 📝) */
export function dayMarks(date, { sheet = null, days = [], absences = [], lates = [], quizzes = [], exams = [], dues = [], today }) {
  const out = [];
  const d = days.filter((x) => x.date === date);
  const off = d.some((x) => x.kind === "off"), cls = d.some((x) => x.kind === "class"), mk = d.some((x) => x.kind === "makeup");
  const abs = absences.find((a) => a.of_date === date && a.state !== "cancelled");
  const late = lates.find((l) => l.date === date && !l.cancelled_at);
  if (off) out.push(["i-off", "–"]);
  else if (abs || sheet?.attend === "absent") { out.push(["i-abs", "✕"]); if (abs?.state === "set" && abs.on_date) out.push(["i-mk", "↻"]); }
  else if (sheet?.attend === "late" || sheet?.late?.until_at || (!sheet && late)) out.push(["i-late", "⏰"]);
  else if (sheet && ["present", "early", "online"].includes(sheet.attend)) out.push(["i-ok", "✓"]);
  else if (sheet?.attend === "makeup" || mk) out.push(["i-mk", "↻"]);
  else if (cls && date > today) out.push(["i-cls", "·"]);
  if ((sheet?.home_count ?? 0) > 0) out.push(["i-hw", "📘"]);
  if (quizzes.some((q) => q.taken_on === date) || exams.some((e) => examOn(e) === date)) out.push(["i-ex", "📝"]);
  if (dues.some((g) => g.due_on === date && g.stage !== "done")) out.push(["i-due", "🚩"]);   // 내가 정한 마감(받을 학습지) — 끝낸 것은 안 뜬다
  return out;
}
export const isExamDay = (date, exams = []) => exams.some((e) => examOn(e) === date);
/** 날 하나의 줄들 — 목업 09b 아래 카드. n 은 앞 글자(출·수·숙·시·휴) */
export function dayDetail(date, { sheet = null, days = [], absences = [], lates = [], arrival = [], quizzes = [], exams = [], holidays = [], dues = [], today }) {
  const rows = [];
  const d = days.filter((x) => x.date === date);
  const off = d.some((x) => x.kind === "off"), cls = d.some((x) => x.kind === "class" || x.kind === "makeup");
  const abs = absences.find((a) => a.of_date === date && a.state !== "cancelled");
  const late = lates.find((l) => l.date === date && !l.cancelled_at);
  const ar = arrivalState(arrival.filter((r) => r.date === date));
  if (off) { const h = holidays.find((x) => x.date === date); rows.push({ n: "휴", b: "휴강", small: h?.reason || "이날은 수업이 없어요" }); }
  else if (abs) rows.push({ n: "출", b: `결석 · ${makeupText(abs)}`, small: [abs.reason, abs.notified_at ? "미리 알려 주셨습니다" : null].filter(Boolean).join(" — ") || (date > today ? "결석 예정" : "") });
  else if (ar.arrived) rows.push({ n: "출", b: `${seoulTime(ar.arrivedAt)} 등원${ar.left ? ` · ${seoulTime(ar.leftAt)} 하원` : sheet?.late?.until_at ? ` · ${hhmm(sheet.late.until_at)} 예정` : ""}`, small: sheet?.late?.reason || (sheet?.attend === "late" ? "지각" : late ? `${late.minutes}분 지각 예정` : "") });
  else if (sheet) rows.push({ n: "출", b: ATTEND_NAME[sheet.attend] ?? sheet.attend ?? "", small: sheet.late?.until_at ? `${hhmm(sheet.late.until_at)} 예정 · ${sheet.late.reason ?? ""}` : "" });
  else if (late) rows.push({ n: "출", b: `${late.minutes}분 지각 예정`, small: late.reason ?? "" });
  else if (cls && date > today) rows.push({ n: "수", b: `수업 예정${d[0]?.start_time ? ` ${String(d[0].start_time).slice(0, 5)}` : ""}`, small: "" });
  if (sheet) {
    rows.push(sheet.closed_at ? { n: "수", b: "수업일지", small: sheet.comment || "(글 없음)" } : { n: "수", b: "수업일지", small: "아직 마감 전이에요" });
    if ((sheet.home_count ?? 0) > 0) rows.push({ n: "숙", b: `숙제 ${sheet.home_count}개`, small: (sheet.home_names ?? []).join(" · ") });
  } else if (!off && cls && date <= today) rows.push({ n: "수", b: "수업일지 없음", small: abs || date < today ? "결석한 날은 일지가 안 생깁니다" : "아직 판이 없어요" });
  for (const q of quizzes.filter((q) => q.taken_on === date)) rows.push({ n: "시", b: `${QKIND.find(([k]) => k === q.kind)?.[1] ?? q.kind} 시험 ${q.total ? `${q.total - (q.wrong ?? 0)}/${q.total}` : ""}`.trim(), small: q.pct != null ? `${q.pct}% · ${q.passed ? "통과" : "못 넘음"}` : "" });
  for (const e of exams.filter((e) => examOn(e) === date)) rows.push({ n: "시", b: `시험 — ${e.schools?.name ?? ""} ${e.name}`.trim(), small: e.english_on ? "영어 시험일" : "시험 기간 시작" });
  for (const g of dues.filter((g) => g.due_on === date && g.stage !== "done")) rows.push({ n: "마", b: `🚩 내가 정한 마감 — ${g.material?.title ?? ""}`.trim(), small: "선생님 달력에도 떠 있어요" });
  return { title: dayTitle(date, today), rows };
}
