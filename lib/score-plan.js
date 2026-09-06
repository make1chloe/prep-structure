/** 성적 판단 한 벌(순수, 목업 16 · 07·09 📈) — 등급은 회차의 등급컷으로 세어 나온다(대전제-5 · 중학교는 절대평가 A~E) · 문항표 글 ↔ 줄 · 틀린 번호 ↔ 영역 셈 · 그 회차의 줄(없음 · 기다림 · 확인됨) · 아이·학부모 카드 한 줄 · 아이가 넣을 회차 · 엑셀 한 줄 읽기 */
import { daysBetween } from "./dash-plan.js";
import { examOn } from "./exam-plan.js";
export const KIND_LABEL = Object.freeze({ school: "내신", mock: "모의고사", unit: "단원평가" });
export const SHOW = Object.freeze([["staff", "원장만"], ["student", "학생"], ["parent", "학부모"], ["both", "학생·학부모"]]);
export const showText = (s) => (s === "both" ? "학생 ✓ · 학부모 ✓" : s === "student" ? "학생 ✓ · 학부모 ✕" : s === "parent" ? "학생 ✕ · 학부모 ✓" : "원장만");
export const MIDDLE_CUTS = Object.freeze([90, 80, 70, 60]);   // 중학교 절대평가 A~E — 90점 이상 A(영어시험-특징 §4)
export const QKINDS = Object.freeze(["듣기", "독해", "어법", "어휘", "서술형", "기타"]);
/** 이 회차의 컷 — 적힌 것 › 중학교면 절대평가 › 없음 */
export const cutsFor = (exam) => (exam?.cuts?.length ? exam.cuts.map(Number).filter(Number.isFinite) : exam?.level === "middle" ? [...MIDDLE_CUTS] : []);
/** 컷은 1등급컷부터 — [90, 84, 77] 이면 90 이상 1 · 84 이상 2 · 77 이상 3 · 그 밑은 4(옛 앱 lib/scores.js 그대로) */
export function gradeByCuts(raw, cuts = []) { const n = Number(raw), list = (cuts ?? []).map(Number).filter(Number.isFinite); if (raw == null || raw === "" || !Number.isFinite(n) || !list.length) return null; for (let i = 0; i < list.length; i++) if (n >= list[i]) return i + 1; return list.length + 1; }
export const gradeText = (level, g) => (g == null ? "" : level === "middle" ? ("ABCDE"[g - 1] ?? "E") : `${g}등급`);
/** 다음 등급까지 몇 점 — 「3점만 더」. 이미 1등급이면 null */
export function toNextGrade(raw, cuts = []) { const n = Number(raw), list = (cuts ?? []).map(Number).filter(Number.isFinite); const g = gradeByCuts(raw, list); if (!g || g <= 1) return null; const need = list[g - 2]; return Number.isFinite(need) ? Math.round((need - n) * 10) / 10 : null; }
/** 「90, 84, 77」 → [90, 84, 77] — 빈 칸을 먼저 버린다(Number("") 는 0 이라 1등급컷 0점이 된다) · 높은 순 */
export const parseCuts = (text) => [...new Set(String(text ?? "").split(/[,\s/·]+/).filter((x) => x.trim() !== "").map(Number).filter((x) => Number.isFinite(x) && x >= 0 && x <= 100))].sort((a, b) => b - a);
export const cutsText = (exam) => { const c = cutsFor(exam); return c.map((v, i) => `${exam?.level === "middle" ? ("ABCDE"[i] ?? "E") : `${i + 1}등급`} ${v}`).join(" · "); };
/** 문항표 글 → 줄들 — 「1-5 듣기, 6-20 독해, 21 어법」. 겹치면 뒤의 것 */
export function parseQuestions(text) {
  const out = new Map();
  for (const part of String(text ?? "").split(/[,\n·;]+/)) { const m = part.trim().match(/^(\d+)(?:\s*[-~]\s*(\d+))?\s*(.+)$/); if (!m) continue; const a = Number(m[1]), b = m[2] ? Number(m[2]) : a, kind = m[3].trim(); if (!kind || a < 1 || b < a || b > 200) continue; for (let q = a; q <= b; q++) out.set(q, kind); }
  return [...out.entries()].sort((x, y) => x[0] - y[0]).map(([q_no, kind]) => ({ q_no, kind }));
}
/** 줄들 → 글 — 「1-5 듣기, 6-20 독해」 */
export function questionsText(rows = []) { const runs = []; for (const r of [...rows].sort((a, b) => a.q_no - b.q_no)) { const last = runs[runs.length - 1]; if (last && last.kind === r.kind && last.to === r.q_no - 1) last.to = r.q_no; else runs.push({ from: r.q_no, to: r.q_no, kind: r.kind }); } return runs.map((r) => `${r.from}${r.to !== r.from ? `-${r.to}` : ""} ${r.kind}`).join(", "); }
/** 「3, 7, 11」 → [3, 7, 11] — 눌러도 되고 적어도 된다, 같은 값 */
export const parseWrong = (text) => [...new Set(String(text ?? "").split(/[^\d]+/).filter(Boolean).map(Number).filter((n) => n > 0 && n <= 200))].sort((a, b) => a - b);
/** 틀린 번호 → 영역마다 몇 개(많은 것부터) — 문항표에 없는 번호는 「영역 모름」 */
export function wrongSummary(wrongs = [], questions = []) { const kindOf = new Map(questions.map((q) => [Number(q.q_no), q.kind])); const by = new Map(); for (const q of wrongs) { const k = kindOf.get(Number(q)) ?? "영역 모름"; by.set(k, (by.get(k) ?? 0) + 1); } return [...by.entries()].map(([kind, n]) => ({ kind, n })).sort((a, b) => b.n - a.n || a.kind.localeCompare(b.kind)); }
export const summaryText = (sum = []) => sum.map((s) => `${s.kind} ${s.n}`).join(" · ");
/** 그 회차 판의 줄 — 보는 아이마다: 성적 줄(있으면) · 등급(세어 나옴 · 학교가 준 등급이 있으면 그것) · 틀린 번호와 영역 · 상태 없음/기다림/확인됨 */
export function rowsOf(board) {
  const e = board?.exam ?? null, cuts = cutsFor(e), qs = e?.questions ?? [];
  return (board?.takers ?? []).map((t) => {
    const s = (board?.scores ?? []).find((x) => x.student_id === t.id) ?? null;
    const g = s ? (s.grade ?? gradeByCuts(s.raw, cuts)) : null, sum = s ? wrongSummary(s.wrongs ?? [], qs) : [];
    return { student_id: t.id, name: t.name, grade: t.grade, score_show: t.score_show, score: s, raw: s?.raw ?? null, full: s?.full_score ?? null, gradeN: g, gradeText: gradeText(e?.level, g),
             wrongs: s?.wrongs ?? [], wrongText: s ? (s.wrongs?.length ? s.wrongs.join(",") : "번호 안 넣음") : "", summary: sum, summaryText: summaryText(sum),
             state: !s ? "none" : s.confirmed ? "confirmed" : "pending", byWho: s?.by_who ?? null, at: s?.updated_at ?? s?.created_at ?? null, showText: s?.confirmed ? showText(s.show_to) : "—" };
  });
}
export const counts = (rows = []) => ({ unconfirmed: rows.filter((r) => r.state === "pending").length, missing: rows.filter((r) => r.state === "none").length, confirmed: rows.filter((r) => r.state === "confirmed").length });
/** 회차 짧은 이름 「26-2 중간」 — 이름에 학년도-학기가 있으면 그대로, 없으면 그날로 만들고 「N학기」 는 뺀다 */
export function examShort(e) { const nm = String(e?.name ?? "").trim(), on = examOn(e); if (!on || /\d{2}-\d/.test(nm)) return nm; const mm = Number(on.slice(5, 7)); return `${on.slice(2, 4)}-${mm >= 8 || mm <= 1 ? 2 : 1} ${nm.replace(/^\d학기\s*/, "")}`.trim(); }
/** 아이·학부모 카드 한 줄 — 「26-2 중간 88 · B」 + 「어법 3 · 독해 2」 · 확인 전이면 「확인 기다리는 중」 */
export function scoreLine(s, exam) {
  const cuts = cutsFor(exam), g = s.grade ?? gradeByCuts(s.raw, cuts);
  const wrongs = (s.score_wrong ?? s.wrongs ?? []).map((w) => (w && typeof w === "object" ? w.q_no : w));
  const sum = wrongSummary(wrongs, exam?.exam_question ?? exam?.questions ?? []);
  return { id: s.id, exam_id: s.exam_id ?? exam?.id ?? null, pending: !s.confirmed,
           title: `${examShort(exam)} ${s.raw ?? "—"}${s.full_score && Number(s.full_score) !== 100 ? `/${s.full_score}` : ""}${g ? ` · ${gradeText(exam?.level, g)}` : ""}`.trim(),
           small: [s.confirmed ? "" : "확인 기다리는 중", sum.length ? summaryText(sum) : "", exam?.school ?? ""].filter(Boolean).join(" · ") };
}
/** 아이가 넣을 수 있는 회차 — 그날이 지났고(오늘까지) days 일 안 · 아직 성적이 없는 것 · 가까운 것부터 */
export function examsForEntry(exams = [], scores = [], today, days = 60) { const has = new Set(scores.map((s) => s.exam_id)); return exams.filter((e) => { const on = examOn(e); return on && on <= today && daysBetween(on, today) <= days && !has.has(e.id); }).sort((a, b) => String(examOn(b)).localeCompare(String(examOn(a)))); }
// ── 엑셀 한 줄 — 열 이름을 정확히 맞추라고 안 한다
const pick = (row, keys) => { for (const k of Object.keys(row)) { const key = String(k).replace(/\s/g, ""); if (keys.some((c) => key === c || key.includes(c))) { const v = row[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); } } return ""; };
const num = (v) => { const s = String(v ?? "").replace(/[^\d.]/g, ""); return s ? Number(s) : null; };
export function parseScoreRow(row) {
  const name = pick(row, ["학생명", "학생이름", "이름", "성명", "학생"]);
  return { name, raw: num(pick(row, ["원점수", "점수", "득점"])), full: num(pick(row, ["만점", "총점", "배점"])) ?? 100, grade: num(pick(row, ["등급"])), wrongs: parseWrong(pick(row, ["틀린문항", "틀린번호", "오답", "틀린"])), note: pick(row, ["메모", "비고"]) || null };
}
export const parseSheet = (rows = []) => rows.map(parseScoreRow).filter((r) => r.name && r.raw != null);
