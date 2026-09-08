/** 시험 회차 판단 한 벌(순수, 목업 06b) — 이 회차를 보는 아이(학교 · 학년 · 「안 봄」 — SQL exam_takers 와 같은 판단) · 교재 멈춤 창(영어 시험일 − N주 ~ 시험 끝나는 날, 확정-⑬·㊺b) ·
 *  부모님께 글의 시험전·시험후(2차-7 남긴 것) · 범위 묶음(교재 × 대단원) · 알약 셈 · 머리 글자. 세는 것은 세어 나온다(원칙-5) — 저장하지 않는다 */
import { plusDays } from "./day-plan.js";
import { daysBetween, md } from "./dash-plan.js";
import { LEVEL_CHAR } from "./neis-plan.js";
import { schoolShort } from "./roster-plan.js";
export const LEVEL_NAME = Object.freeze({ high: "고등학교", middle: "중학교", elem: "초등학교" });
export const LEVELS = Object.freeze(["high", "middle", "elem"]);
export const WEEK_CHOICES = Object.freeze([3, 4, 6, 8]);
const levelOf = (st) => st?.level ?? st?.schools?.level ?? null;
/** 이 아이가 이 회차를 보나 — 학교 회차: 같은 학교(학년이 적혔으면 그 학년) · 전국: 고등 아이 전부(+학년) · 「안 봄」은 뺀다 · 재원생만. skips 는 exam.exam_skip(오늘 파도) 또는 따로 준 줄들 */
export function takes(student, exam, skips = exam?.exam_skip ?? exam?.skips ?? []) {
  if (!student || !exam || (exam.state ?? "active") !== "active" || exam.hidden) return false;
  if ((student.state ?? "active") !== "active" || !student.school_id) return false;
  if (exam.scope === "school" ? student.school_id !== exam.school_id : levelOf(student) !== "high") return false;
  if (exam.grade != null && exam.grade !== "" && Number(student.grade) !== Number(exam.grade)) return false;
  return !skips.some((k) => (k.exam_id == null || k.exam_id === exam.id) && k.student_id === student.id && k.skipped !== false);
}
/** 회차의 「그날」 — 영어 시험일, 없으면 기간 시작 · 끝나는 날 — 기간 끝·영어일·시작 중 가장 늦은 것 */
/** 「안 봄」 후보 — 보는 아이 가운데 아직 안 봄이 아닌 아이((가)-⑨ 「이 학년 안 봄 한 번에」도 이 목록을 통째로) */
export const skipCandidates = (students = [], takers = [], skips = []) => { const sk = new Set((skips ?? []).map((k) => k.student_id)); return (students ?? []).filter((s) => (takers ?? []).includes(s.id) && !sk.has(s.id)); };
export const examOn = (e) => e?.english_on ?? e?.term_from ?? null;
export const examEnd = (e) => [e?.term_to, e?.english_on, e?.term_from].filter(Boolean).sort().at(-1) ?? null;
/** 몇 주 전부터 — 아이 따로(students.stop_weeks) › 학교급 규칙(prep.stop_weeks.*). 규칙이 없으면 null — 던지지 않고 화면이 「규칙 줄 없음」을 말한다 */
export function weeksFor(level, rules = {}, student = null) {
  if (student?.stop_weeks != null && student.stop_weeks !== "") return Number(student.stop_weeks);
  const v = rules?.[`prep.stop_weeks.${level}`]; return v == null || v === "" ? null : Number(v);
}
/** 멈춤 창 — 영어 시험일 − N주 부터 시험 끝나는 날까지. 영어일이 없으면 null(⚠️ 모르면 루틴을 안 세운다 — 기간 끝으로 잡으면 배부가 사흘 늦는다, 목업 06) */
export function stopWindow(exam, weeks) {
  if (!exam?.english_on || weeks == null || !(weeks >= 0)) return null;
  return { from: plusDays(exam.english_on, -7 * weeks), until: examEnd(exam) };
}
/** 부모님께 글의 갈래 — 「그날」이 앞으로 before 일 안이면 시험전 · 그날부터 after 일 안이면 시험후 · 아니면 null. 여러 회차면 가까운 것 */
export function examPhase(exams = [], date, { before = 7, after = 3 } = {}) {
  let best = null;
  for (const e of exams) {
    const on = examOn(e); if (!on) continue;
    const d = daysBetween(date, on);   // 양수 = 앞으로
    const ph = d > 0 && d <= before ? "before" : d <= 0 && -d <= after ? "after" : null; if (!ph) continue;
    if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, ph };
  }
  return best?.ph ?? null;
}
/** 범위 묶음 — 교재 × 대단원마다 칩 하나(산 소단원 수 · 뺀 수) · 글로 적은 것은 한 줄씩. 처음 적은 날 뒤에 더한 것은 「더함」 · 다 빠졌으면 「학교가 뺌」 */
export function groupScopes(scopes = [], today = null) {
  const first = scopes.map((s) => s.added_on).filter(Boolean).sort()[0] ?? null;
  const by = new Map();
  for (const s of scopes) {
    const key = s.unit_id ? `${s.book_id}|${s.chapter}` : `free|${s.id}`;
    if (!by.has(key)) by.set(key, { key, book: s.book ?? null, book_id: s.book_id ?? null, chapter: s.chapter ?? null, free: s.free_note ?? null, ids: [], liveIds: [], alive: 0, removed: 0, added_on: s.added_on ?? null, removed_on: null, shorts: [] });
    const g = by.get(key); g.ids.push(s.id);
    if (s.removed_on) { g.removed++; if (!g.removed_on || g.removed_on < s.removed_on) g.removed_on = s.removed_on; } else { g.alive++; g.liveIds.push(s.id); if (s.short) g.shorts.push(s.short); }
    if (s.added_on && (!g.added_on || s.added_on < g.added_on)) g.added_on = s.added_on;
  }
  return [...by.values()].map((g) => {
    const state = g.alive ? (first && g.added_on > first ? "add" : "on") : "del";
    const title = g.free ?? `${g.book ?? ""} ${g.chapter ?? ""}`.trim();
    const sub = state === "del" ? `${md(g.removed_on)} 학교가 뺌` : `${g.free ? "글로 적음" : `소단원 ${g.alive}`}${g.removed ? ` · 뺌 ${g.removed}` : ""}${state === "add" ? ` · ${md(g.added_on)} 더함` : ""}`;
    return { ...g, state, title, sub };
  });
}
/** 알약 — 회차 N(숨긴 것 빼고) · 숨김 N · 범위 줄 N(산 것) · 영어일 없음 N(학교 회차 · 아직 안 끝난 것) */
export function counts(exams = [], today) {
  const live = exams.filter((e) => !e.hidden);
  const missing = live.filter((e) => e.scope === "school" && !e.english_on && (!examEnd(e) || examEnd(e) >= today));
  return { exams: live.length, hidden: exams.length - live.length, scopes: live.reduce((n, e) => n + (e.scopes ?? []).filter((s) => !s.removed_on).length, 0), missing: missing.length, missingIds: missing.map((e) => e.id) };
}
/** 회차 머리 「신정중 · 중2」 · 「신정중 · 전 학년」 · 전국은 이름 그대로 */
export const examHead = (e) => (e.scope === "national" ? e.name : `${schoolShort(e.school)} · ${e.grade != null && e.grade !== "" ? `${LEVEL_CHAR[e.level] ?? ""}${e.grade}` : "전 학년"}`);
export const mdDot = (d) => (d ? `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}` : "");
export const SOURCE_TEXT = Object.freeze({ neis: "나이스에서 받음", site: "홈페이지에서 받음", manual: "손으로 넣음" });
/** 멈춤 상태 글 — 창이 있으면 아직/중/지남 */
export function stopText(win, today) {
  if (!win) return null;
  if (today < win.from) return { state: "soon", text: `${md(win.from)}부터 멈춤 · ${md(win.until)}에 저절로 풀림` };
  if (today <= win.until) return { state: "on", text: `멈춤 중 · ${md(win.until)}에 저절로 풀림` };
  return { state: "past", text: `${md(win.until)}에 풀림` };
}
/** 손으로 넣은 회차의 출처 열쇠 — exams 는 (source, source_key) 가 nulls not distinct 유일이라 손으로 넣은 둘째 회차가 안 들어가던 사고(2026-09-06). 같은 학교·학년·이름·시작날이면 같은 회차다 */
export const manualKey = ({ scope, schoolId = null, grade = null, name, termFrom }) => `manual:${scope}:${schoolId ?? "all"}:${grade ?? "all"}:${String(name ?? "").trim()}:${termFrom}`;
/** 단원 고르기 — 대단원마다 묶는다 */
export function unitsByChapter(units = []) { const by = new Map(); for (const u of units) { if (!by.has(u.chapter)) by.set(u.chapter, { chapter: u.chapter, units: [] }); by.get(u.chapter).units.push(u); } return [...by.values()]; }
