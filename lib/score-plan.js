/** 성적 판단 한 벌(순수, 목업 16 · 07·09 📈) — 등급은 회차의 등급컷으로 세어 나온다(대전제-5 · 중학교는 절대평가 A~E) · 문항표 글 ↔ 줄 · 틀린 번호 ↔ 영역 셈 · 그 회차의 줄(없음 · 기다림 · 확인됨) · 아이·학부모 카드 한 줄 · 아이가 넣을 회차 · 엑셀 한 줄 읽기 ·
 *  문항표 엑셀(읽기 · ⬇ 열) · 모의고사 표준 문항표(옛 앱 lib/examSpec 의 MOCK_SPEC 그대로 — 「모의고사는 앱이 알고, 내신은 시험지마다 적는다」) · 성적 양식 ⬇ · 성적 추이(같은 갈래 지난 회차 대비 ▲▼)(5단계-⑤) */
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
  const e = board?.exam ?? null, cuts = cutsFor(e), qs = questionsFor(e);
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
  const sum = wrongSummary(wrongs, questionsFor(exam));
  return { id: s.id, exam_id: s.exam_id ?? exam?.id ?? null, pending: !s.confirmed, raw: s.raw ?? null, full: Number(s.full_score ?? 100) || 100, kind: exam?.scope === "national" ? "mock" : "school", on: s.taken_on ?? examOn(exam) ?? null,
           title: `${examShort(exam)} ${s.raw ?? "—"}${s.full_score && Number(s.full_score) !== 100 ? `/${s.full_score}` : ""}${g ? ` · ${gradeText(exam?.level, g)}` : ""}`.trim(),
           small: [s.confirmed ? "" : "확인 기다리는 중", sum.length ? summaryText(sum) : "", exam?.school ?? ""].filter(Boolean).join(" · ") };
}
/** 아이가 넣을 수 있는 회차 — 그날이 지났고(오늘까지) days 일 안 · 아직 성적이 없는 것 · 가까운 것부터 */
export function examsForEntry(exams = [], scores = [], today, days = 60) { const has = new Set(scores.map((s) => s.exam_id)); return exams.filter((e) => { const on = examOn(e); return on && on <= today && daysBetween(on, today) <= days && !has.has(e.id); }).sort((a, b) => String(examOn(b)).localeCompare(String(examOn(a)))); }
// ── 엑셀 한 줄 — 열 이름을 정확히 맞추라고 안 한다
const pick = (row, keys) => { for (const k of Object.keys(row)) { const key = String(k).replace(/\s/g, ""); if (keys.some((c) => key === c || key.includes(c))) { const v = row[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); } } return ""; };
const num = (v) => { const s = String(v ?? "").replace(/[^\d.]/g, ""); return s ? Number(s) : null; };
/** 엑셀 「등급」 열 읽기((가)-⑩ · 남긴 것 16 — 학교가 발표한 등급은 **엑셀로만**, 5단계-⑤ 뺀 것 그대로) — 중학교는 「A~E」(절대평가 · 1~5 로 적는다 · 소문자도) · 숫자 1~9 · 「2등급」 · 빈 것은 없음(컷으로 센다) · 그 밖은 막는다(고등 「A」 · 「F」 · 0 · 중학교 6) */
export function parseGrade(v, level = null) {
  const t = String(v ?? "").trim().toUpperCase(); if (t === "") return null;
  if (/^[A-E]$/.test(t)) { if (level !== "middle") throw new Error(`등급이 이상합니다: ${v}(A~E 는 중학교만)`); return t.charCodeAt(0) - 64; }
  const n = Number(t.replace(/등급$/, "").trim());
  if (!Number.isInteger(n) || n < 1 || n > (level === "middle" ? 5 : 9)) throw new Error(`등급이 이상합니다: ${v}`);
  return n;
}
export function parseScoreRow(row, level = null) {
  const name = pick(row, ["학생명", "학생이름", "이름", "성명", "학생"]);
  return { name, raw: num(pick(row, ["원점수", "점수", "득점"])), full: num(pick(row, ["만점", "총점", "배점"])) ?? 100, grade: parseGrade(pick(row, ["등급"]), level), wrongs: parseWrong(pick(row, ["틀린문항", "틀린번호", "오답", "틀린"])), note: pick(row, ["메모", "비고"]) || null };
}
export const parseSheet = (rows = [], level = null) => rows.map((r) => parseScoreRow(r, level)).filter((r) => r.name && r.raw != null);

/** 모의고사 백분위 읽기(4단계-4) — 0~100 정수 · 비우면 null · 내신엔 없다(내신과 섞어 평균 내지 않는다 — 남긴 것 19) */
export function parsePercentile(v) { const t = String(v ?? "").trim(); if (t === "") return null; const n = Number(t); if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`백분위가 이상합니다: ${v}`); return n; }

// ── 문항표 — 모의고사 표준(옛 앱 lib/examSpec.js MOCK_SPEC · 2026-08-06 원장님 「기본값을 세팅하되, 수정 가능하게」): 45문항 · 1~17 듣기 · 18~45 독해(29 어법 · 30 어휘). 이번 회차만 다르면 그 회차의 문항표가 이긴다
export const MOCK_SPEC = Object.freeze(Array.from({ length: 45 }, (_, i) => { const q = i + 1; return { q_no: q, kind: q <= 17 ? "듣기" : q === 29 ? "어법" : q === 30 ? "어휘" : "독해" }; }));
/** 이 회차의 문항표 — 적힌 것 › 모의고사면 표준 › 없음(내신은 시험지마다 적는다) */
export function questionsFor(exam) { const mine = exam?.questions?.length ? exam.questions : exam?.exam_question?.length ? exam.exam_question : []; if (mine.length) return mine; return exam?.scope === "national" ? [...MOCK_SPEC] : []; }
export const questionsFrom = (exam) => (exam?.questions?.length || exam?.exam_question?.length ? "exam" : exam?.scope === "national" ? "standard" : "none");
export const QUESTION_HEADERS = Object.freeze(["번호", "영역"]);
export const exportQuestionRows = (questions = []) => [...questions].sort((a, b) => a.q_no - b.q_no).map((q) => ({ 번호: q.q_no, 영역: q.kind }));
const KIND_ALIAS = Object.freeze({ 문법: "어법", 단어: "어휘", 서답형: "서술형", 리스닝: "듣기", 리딩: "독해", 독해력: "독해" });
/** 문항표 엑셀 줄(sheet_to_json) → 줄들 — 열 「번호」(문항·no) · 「영역」(유형·갈래·kind). 번호는 「1-17」 도 된다 · 영역 낱말 다듬기(문법 → 어법 · 단어 → 어휘 · 서답형 → 서술형) · 못 읽는 줄은 「고칠 줄」 */
export function parseQuestionSheet(sheetRows = []) {
  const out = new Map(), bad = [];
  sheetRows.forEach((r, i) => {
    const no = pick(r, ["번호", "문항", "no", "q"]), kind0 = pick(r, ["영역", "유형", "갈래", "kind", "분류"]);
    if (!no && !kind0) return;
    const m = String(no).trim().match(/^(\d+)(?:\s*[-~]\s*(\d+))?$/), kind = KIND_ALIAS[kind0] ?? kind0;
    if (!m || !kind) { bad.push({ line: i + 2, why: !m ? `번호가 아닙니다: ${no || "빈 칸"}` : "영역이 비었습니다" }); return; }
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a; if (a < 1 || b < a || b > 200) { bad.push({ line: i + 2, why: `번호 범위가 이상합니다: ${no}` }); return; }
    for (let q = a; q <= b; q++) out.set(q, kind);
  });
  return { rows: [...out.entries()].sort((x, y) => x[0] - y[0]).map(([q_no, kind]) => ({ q_no, kind })), bad };
}
// ── 성적 양식 ⬇ — 올리기(parseScoreRow)와 같은 열 · 보는 아이 이름을 채워 준다(있는 성적은 그대로)
export const SCORE_HEADERS = Object.freeze(["학생명", "원점수", "만점", "등급", "틀린문항", "메모"]);
/** 등급 열은 학교 것만 나간다(세어 나온 등급은 안 나간다 — 다시 올리면 학교 것이 되어 버린다 · 대전제-5) · 올리기가 읽는 꼴로(중 「B」 · 고 「2등급」 — gradeText 한 곳) */
export const exportScoreRows = (rows = [], level = null) => rows.map((r) => ({ 학생명: r.name ?? "", 원점수: r.raw ?? "", 만점: r.full ?? "", 등급: r.score?.grade != null ? gradeText(level, r.score.grade) : "", 틀린문항: (r.wrongs ?? []).join(","), 메모: r.score?.note ?? "" }));
// ── 성적 추이(07·09·14) — 같은 갈래(내신/모의고사)의 지난 회차와 견준다 · 만점이 다르면 100점 기준으로 · 확인 전 줄은 견주지도 않고 견줌의 상대도 안 된다 · 첫 회차는 없음
const pct100 = (raw, full) => (raw == null || raw === "" ? null : Math.round((Number(raw) / (Number(full) || 100)) * 1000) / 10);
export function withTrend(lines = []) {
  const done = lines.filter((l) => !l.pending && l.raw != null && l.on).slice().sort((a, b) => String(a.on).localeCompare(String(b.on)) || String(a.id).localeCompare(String(b.id)));
  const delta = new Map();
  for (let i = 0; i < done.length; i++) { const prev = done.slice(0, i).reverse().find((x) => x.kind === done[i].kind); const d = prev ? Math.round(pct100(done[i].raw, done[i].full) - pct100(prev.raw, prev.full)) : null; delta.set(done[i].id, d); }
  return lines.map((l) => { const d = delta.has(l.id) ? delta.get(l.id) : null; return { ...l, delta: d, deltaText: d == null ? "" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "＝" }; });
}
