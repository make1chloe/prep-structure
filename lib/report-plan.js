/** 📊 월간 리포트 판단(순수 · 4단계-2b) — 한 달 숫자(month_report — 마감한 판만)를 줄로 · 요약 알약 · 학부모 카드 · 보낼 수 있는 줄. 숫자는 세어 나오고(원칙-5) 보낼 때 굳힌다(monthly_report.frozen) */
import { md } from "./dash-plan.js";
const n0 = (v) => Number(v ?? 0) || 0;
export const isYm = (ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym ?? ""));
export const ymLabel = (ym) => (isYm(ym) ? `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월` : String(ym ?? ""));
export const pct = (a, b) => (n0(b) ? Math.round((n0(a) * 100) / n0(b)) : null);
/** 카드에 서는 줄 — 있는 것만(0 이면 안 쓴다 · 빈 말 금지). 출석은 늘 · 숙제는 검사가 있을 때 · 성적은 공개한 것만(SQL 이 걸렀다) */
export function reportLines(n = {}) {
  const out = [];
  out.push({ key: "att", text: `출석 ${n0(n.att_present)}/${n0(n.att_total)}회${n0(n.att_absent) ? ` · 결석 ${n0(n.att_absent)}` : ""}${n0(n.att_late) ? ` · 지각 ${n0(n.att_late)}` : ""}` });
  if (n0(n.hw_total)) out.push({ key: "hw", text: `숙제 ${n0(n.hw_done)}/${n0(n.hw_total)} (${pct(n.hw_done, n.hw_total)}%)` });
  if (n0(n.word_total)) out.push({ key: "word", text: `단어시험 통과 ${n0(n.word_pass)}/${n0(n.word_total)}` });
  if (n0(n.ut_total)) out.push({ key: "ut", text: `단원평가 통과 ${n0(n.ut_pass)}/${n0(n.ut_total)}` });
  if (n0(n.late_n)) out.push({ key: "late", text: `늦게 간 날 ${n0(n.late_n)}` });
  if (n0(n.warn_count)) out.push({ key: "warn", text: `경고 ${n0(n.warn_count)}회` });
  for (const s of n.scores ?? []) out.push({ key: `score:${s.exam}:${s.on}`, text: `${s.school ? `${s.school} ` : ""}${s.exam} ${s.raw ?? "?"}/${s.full ?? 100}${s.grade ? ` · ${s.grade}등급` : ""}` });
  return out;
}
/** 원장 판 줄의 요약 알약 — 「출석 8/8 · 숙제 92%」(숙제 검사가 없으면 출석만) */
export function reportSummary(n = {}) { const p = pct(n.hw_done, n.hw_total); return `출석 ${n0(n.att_present)}/${n0(n.att_total)}${p != null ? ` · 숙제 ${p}%` : ""}`; }
/** 학부모 카드 — 마지막으로 보낸 리포트(굳힌 숫자 · 한마디). 없으면 null(카드 안 뜸) */
export function reportCard(r) {
  if (!r?.sent_at) return null;
  return { ym: r.ym, title: `${ymLabel(r.ym)} 리포트`, pill: `${md(String(r.sent_at).slice(0, 10))} 받음`, lines: reportLines(r.frozen ?? {}), body: String(r.body ?? "").trim() };
}
/** 보낼 줄 — 아직 안 보낸 아이(마감한 날이 하루라도 있어야 숫자가 선다 · 학부모 계정이 없으면 ✕ 로 말한다) */
export function sendable(rows = []) { return (rows ?? []).filter((r) => !r.report?.sent_at && n0(r.numbers?.closed_days) > 0); }
export const sentText = (r) => (r?.report?.sent_at ? `보냄 ${md(String(r.report.sent_at).slice(0, 10))}` : n0(r?.numbers?.closed_days) ? "아직 안 보냄" : "마감한 날 없음");
