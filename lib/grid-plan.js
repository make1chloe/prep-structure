/** 학교별 표 06c 판단 한 벌(순수, DB 없음 — 확정-56 · 원장님 9/3 「같은 줄」 · 9/5 ㉒ 보기 전환은 조회 0).
 *  표 = 줄 × 칸. 줄은 학교·학생·자유, 칸은 원장님이 만든다(종류 여섯 — 글 · 날짜 · 선택 · 예/아니오 · 체크 목록 · 앱에서 고르기). 보드는 「선택」 칸 하나로 묶어 본 것 — 카드 = 줄.
 *  값의 뜻(글 ↔ 값)은 여기 한 곳 — 화면과 손(lib/grid.js)과 검사가 같이 쓴다 */
import { md } from "./dash-plan.js";
export const COL_TYPES = Object.freeze([["text", "글"], ["date", "날짜"], ["select", "선택"], ["yn", "예/아니오"], ["checklist", "체크 목록"], ["pick", "앱에서 고르기"]]);
export const typeName = (t) => COL_TYPES.find(([k]) => k === t)?.[1] ?? t;
export const PICK_OF = Object.freeze([["book", "교재"], ["exam", "시험 회차"], ["unit", "단원"]]);
export const pickName = (of) => PICK_OF.find(([k]) => k === of)?.[1] ?? of;
export const ROW_KINDS = Object.freeze([["school", "학교"], ["student", "학생"], ["free", "자유"]]);
export const GRADES = Object.freeze(["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"]);
/** 표 여섯 본(목업 06c) — 이름 · 줄 · 칸 */
export const TEMPLATES = Object.freeze([
  { key: "scope", label: "학교별 시험범위", rows: "school", cols: [["학년", "select", GRADES], ["시험 회차", "pick", { of: "exam" }], ["교재", "pick", { of: "book" }], ["범위", "text"], ["영어 시험일", "date"], ["비고", "text"]] },
  { key: "progress", label: "학생별 개별 진도체크", rows: "student", cols: [["교재·진도", "checklist"], ["숙제·학습지", "checklist"], ["클래스카드(단어&문장)", "checklist"], ["이번 주 목표", "text"]] },
  { key: "calendar", label: "학교별 학사일정", rows: "school", cols: [["학년", "select", GRADES], ["중간고사", "date"], ["기말고사", "date"], ["방학", "date"], ["비고", "text"]] },
  { key: "books", label: "학교별 교재", rows: "school", cols: [["학년", "select", GRADES], ["교재", "pick", { of: "book" }], ["배부", "yn"], ["진행 상황", "select", ["만들기", "인쇄", "배부", "채점"]], ["마감", "date"]], board: "진행 상황" },
  { key: "notes", label: "학교별 특이사항", rows: "school", cols: [["담당", "text"], ["특이사항", "text"], ["최근 확인", "date"], ["처리", "yn"]] },
  { key: "blank", label: "빈 표", rows: "free", cols: [] },
].map(Object.freeze));
export const templateOf = (key) => TEMPLATES.find((t) => t.key === key) ?? null;
/** 본 → 새 표의 칸 줄들(sort 10 · 20 …) */
export function colsFromTemplate(t) { return (t?.cols ?? []).map(([label, type, options = null], i) => ({ label, type, options: options ?? (type === "select" ? [] : type === "pick" ? { of: "book" } : []), sort: (i + 1) * 10 })); }
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
/** 칸 이름·종류·선택지 읽기 — 이름 필수 · 종류 여섯 · 선택은 선택지(쉼표) · 고르기는 무엇을 고르나 */
export function parseCol({ label, type, options }) {
  const l = String(label ?? "").trim(); if (!l) throw new Error("칸 이름을 적으세요");
  if (!COL_TYPES.some(([k]) => k === type)) throw new Error(`칸 종류가 아닙니다: ${type}`);
  let opts = [];
  if (type === "select") { opts = Array.isArray(options) ? options : String(options ?? "").split(/[,\n·]/).map((s) => s.trim()).filter(Boolean); opts = [...new Set(opts)]; if (!opts.length) throw new Error("선택지를 쉼표로 적으세요(만들기, 인쇄, 배부)"); }
  else if (type === "pick") { const of = typeof options === "object" && options && !Array.isArray(options) ? options.of : String(options ?? "book"); if (!PICK_OF.some(([k]) => k === of)) throw new Error(`무엇을 고르나: ${of}`); opts = { of }; }
  return { label: l, type, options: opts };
}
/** 값 읽기 — 종류대로. 비면 null(지운 것이 아니라 「없음」) */
export function parseCell(col, raw) {
  if (raw == null || raw === "") return null;
  switch (col.type) {
    case "text": { const s = String(raw).trim(); return s || null; }
    case "date": { if (!isDate(raw)) throw new Error(`날짜가 아닙니다: ${raw}`); return String(raw); }
    case "select": { const s = String(raw); if (!(col.options ?? []).includes(s)) throw new Error(`선택지에 없습니다: ${s}`); return s; }
    case "yn": { if (raw === true || raw === "true" || raw === "yes" || raw === "예") return true; if (raw === false || raw === "false" || raw === "no" || raw === "아니오") return false; throw new Error(`예/아니오가 아닙니다: ${raw}`); }
    case "checklist": { const list = Array.isArray(raw) ? raw : String(raw).split(/\n/).map((s) => s.trim()).filter(Boolean).map((s) => ({ name: s.replace(/^[☐☑✓✔]\s*/, ""), done: /^[☑✓✔]/.test(s) })); const out = list.map((x) => ({ name: String(x.name ?? "").trim(), done: Boolean(x.done) })).filter((x) => x.name); return out.length ? out : null; }
    case "pick": { const v = typeof raw === "object" ? raw : { id: String(raw) }; if (!v.id) return null; return { of: col.options?.of ?? "book", id: String(v.id), ...(v.book_id ? { book_id: String(v.book_id) } : {}) }; }
    default: throw new Error(`칸 종류가 아닙니다: ${col.type}`);
  }
}
/** 값 → 글(표·보드·검사가 같이 쓴다). refs: {books, exams, units} 로 고른 것의 이름을 찾는다 */
export function cellText(col, value, refs = {}) {
  if (value == null) return "";
  const plain = typeof value === "string" || typeof value === "number";   // 종류를 바꾼 뒤 못 옮긴 값이 남아 있어도(5단계-⑥) 화면이 거짓말을 안 한다 — 종류에 안 맞는 값은 빈 글
  switch (col.type) {
    case "text": return plain ? String(value) : "";
    case "date": return isDate(value) ? md(value) : "";
    case "select": return plain ? String(value) : "";
    case "yn": return value === true ? "예" : value === false ? "아니오" : "";
    case "checklist": { const list = Array.isArray(value) ? value : []; const done = list.filter((x) => x.done).length; return list.length ? `${done}/${list.length} · ${list.map((x) => `${x.done ? "☑" : "☐"} ${x.name}`).join(" ")}` : ""; }
    case "pick": { if (typeof value !== "object" || Array.isArray(value)) return ""; const of = value.of ?? col.options?.of; const pool = of === "book" ? refs.books : of === "exam" ? refs.exams : refs.units; const hit = (pool ?? []).find((x) => x.id === value.id); return hit ? (of === "exam" ? `${hit.school ?? "전국"} ${hit.name}` : of === "unit" ? `${hit.chapter ?? ""} › ${hit.short ?? hit.label ?? ""}`.trim() : hit.name) : `(${pickName(of)} 하나 — 목록에 없음)`; }
    default: return plain ? String(value) : "";
  }
}
/** 체크 목록 손 — 하나 켜고 끄기 · 더하기 · 빼기(5단계-⑥) */
export const toggleItem = (list = [], i) => (list ?? []).map((x, j) => (j === i ? { ...x, done: !x.done } : x));
export const addItem = (list = [], name) => { const n = String(name ?? "").trim(); if (!n) return list ?? []; return [...(list ?? []), { name: n, done: false }]; };
export const removeItem = (list = [], i) => (list ?? []).filter((_, j) => j !== i);
// ── 칸 종류를 바꿀 때 값 옮겨 담기(5단계-⑥ · 남긴 것 22) — 되는 것만 옮기고 안 되는 것은 그대로 둔다(지우지 않는다 · 화면은 빈 글로 보이고 글로 되돌리면 되살아난다)
const YES = /^(예|y|yes|o|true|☑|✓)$/i, NO = /^(아니오|아니요|n|no|x|false|☐)$/i;
const asDate = (s) => { const m = String(s ?? "").trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null; };
/** 한 값 — {ok, value}: ok 면 새 종류의 값 · 아니면 그대로(value 는 옛 값) */
export function convertCell(from, to, value, refs = {}) {
  if (value == null) return { ok: true, value: null };
  const keep = { ok: false, value };
  const text = from.type === "pick" ? (() => { const t = cellText(from, value, refs); return t && !t.startsWith("(") ? t : null; })()
    : from.type === "checklist" ? (Array.isArray(value) ? value.map((x) => `${x.done ? "☑" : "☐"} ${x.name}`).join("\n") : null)
    : from.type === "yn" ? (value === true ? "예" : value === false ? "아니오" : null)
    : typeof value === "string" || typeof value === "number" ? String(value) : null;
  switch (to.type) {
    case "text": return text != null ? { ok: true, value: text } : keep;
    case "date": { const d = asDate(text); return d ? { ok: true, value: d } : keep; }
    case "select": { const s = String(text ?? "").trim(); return s && (to.options ?? []).includes(s) ? { ok: true, value: s } : keep; }
    case "yn": { if (typeof value === "boolean") return { ok: true, value }; const s = String(text ?? "").trim(); return YES.test(s) ? { ok: true, value: true } : NO.test(s) ? { ok: true, value: false } : keep; }
    case "checklist": { if (from.type === "checklist" && Array.isArray(value)) return { ok: true, value }; if (from.type === "text" || from.type === "select") { try { const v = parseCell(to, text); return v ? { ok: true, value: v } : keep; } catch { return keep; } } return keep; }
    case "pick": return from.type === "pick" && value && typeof value === "object" && !Array.isArray(value) && (value.of ?? from.options?.of) === to.options?.of ? { ok: true, value } : keep;
    default: return keep;
  }
}
/** 여럿 — 옮긴 것만 고친다 · 못 옮긴 줄 이름 · 빈 값은 안 센다 */
export function convertMany(from, to, cells = [], refs = {}) {
  const updates = [], unmoved = []; let moved = 0;
  for (const c of cells) { if (c.value == null) continue; const r = convertCell(from, to, c.value, refs); if (r.ok) { moved++; updates.push({ row_id: c.row_id, value: r.value }); } else unmoved.push(c.title ?? c.row_id); }
  return { updates, moved, unmoved };
}
export const checkText = (list = []) => { const l = list ?? []; return l.length ? `${l.filter((x) => x.done).length}/${l.length}` : "—"; };
/** 줄 이름 — 학교 · 학생(학교) · 자유 */
export function rowTitle(r) { return r.school ? r.school : r.student ? r.student : r.label || "(이름 없음)"; }
export function rowSub(r) { return r.school ? "" : r.student ? [r.student_school, r.grade != null ? `${r.grade}학년` : null].filter(Boolean).join(" · ") : ""; }
export const alive = (list = []) => (list ?? []).filter((x) => (x.state ?? "active") === "active");
/** 표 하나의 살아 있는 칸·줄 */
export function liveOf(g) { return { cols: alive(g?.cols), rows: alive(g?.rows_) }; }
/** 셈 — 표 N종(산 것) · 줄 N · 칸 N */
export function counts(grids = []) { const live = alive(grids); return { grids: live.length, rows: live.reduce((n, g) => n + alive(g.rows_).length, 0), cols: live.reduce((n, g) => n + alive(g.cols).length, 0), retired: grids.length - live.length }; }
/** 「칸으로 이동」 — 살아 있는 칸의 번호·이름 */
export const jumpTargets = (cols = []) => alive(cols).map((c, i) => ({ id: c.id, n: i + 1, label: c.label }));
/** 「앱에서 고르기 → 단원」 한 번에((가)-⑤ — 남긴 것 22) — 교재마다 묶은 단원 목록(optgroup) · 단원이 없는 교재는 안 보인다 · 교재 차례는 refs.books 그대로 */
export const unitGroups = (books = [], units = []) => (books ?? []).map((b) => ({ book: b, units: (units ?? []).filter((u) => u.book_id === b.id) })).filter((g) => g.units.length > 0);
/** 고른 단원 → 셀 값 {id, book_id} (교재는 단원에서 나온다 — 두 단을 한 번에) · 없으면 null */
export const unitPick = (units = [], unitId) => { const u = (units ?? []).find((x) => x.id === unitId); return u ? { id: u.id, book_id: u.book_id } : null; };
/** 「칸으로 이동」 ◀ ▶((가)-③ — 목업 06c 「넓은 표에서 한 칸씩 건너뜁니다」) — 지금 칸에서 앞·뒤 한 칸. 끝이면 null · 지금 칸을 모르면(없는 id) 첫 칸 */
export function jumpStep(jumps = [], currentId, dir) {
  const i = jumps.findIndex((j) => j.id === currentId); if (i < 0) return jumps[0] ?? null;
  const j = dir === "prev" ? i - 1 : i + 1; return j < 0 || j >= jumps.length ? null : jumps[j];
}
/** 차례 옮기기 — ▲▼◀▶(폰) · 같은 목록 안에서 하나 옮긴 뒤 sort 를 10씩 다시 매긴다 → [{id, sort}] */
export function moveIn(list = [], id, dir) {
  const ids = alive(list).sort((a, b) => a.sort - b.sort).map((x) => x.id); const i = ids.indexOf(id); if (i < 0) throw new Error("없는 줄입니다");
  const j = dir === "up" || dir === "left" ? i - 1 : i + 1; if (j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids.map((x, k) => ({ id: x, sort: (k + 1) * 10 }));
}
/** 보드 — 「선택」 칸 하나로 묶는다. 칸(선택지마다 + 값 없음은 숨긴 그룹) · 카드 = 줄 */
export function boardOf(g, colId = null) {
  const { cols, rows } = liveOf(g);
  const axis = cols.find((c) => c.id === (colId ?? g?.board_col) && c.type === "select") ?? cols.find((c) => c.type === "select") ?? null;
  if (!axis) return { axis: null, columns: [], none: rows, selects: cols.filter((c) => c.type === "select") };
  const columns = (axis.options ?? []).map((opt) => ({ key: opt, label: opt, cards: rows.filter((r) => r.cells?.[axis.id] === opt) }));
  const none = rows.filter((r) => !(axis.options ?? []).includes(r.cells?.[axis.id]));
  return { axis, columns, none, selects: cols.filter((c) => c.type === "select") };
}
/** 카드 옮기기 — 이웃 선택지로(◀ ▶). 값이 없으면 첫 선택지로 */
export function nextOption(axis, cur, dir) { const o = axis?.options ?? []; if (!o.length) return null; const i = o.indexOf(cur); if (i < 0) return o[0]; const j = dir === "left" ? i - 1 : i + 1; return j < 0 || j >= o.length ? null : o[j]; }
/** 카드 제목 — 첫 글·고르기 칸의 값, 없으면 줄 이름 */
export function cardTitle(g, r, refs = {}) { const { cols } = liveOf(g); const c = cols.find((x) => (x.type === "text" || x.type === "pick") && r.cells?.[x.id] != null); return c ? cellText(c, r.cells[c.id], refs) : rowTitle(r); }
/** 따로 챙길 아이들 — 적어 둔 것(메모 있는 줄) · 전체 */
export function watchSummary(watch = [], students = []) { const noted = (watch ?? []).filter((w) => String(w.note ?? "").trim()); return { noted: noted.length, total: (students ?? []).length, rows: noted }; }
/** 내 표 / 전체 표 — 원장은 전부, 강사·조교는 제 것만(created_by) 보되 「전체 표(원장)」 는 원장만 */
export function visibleGrids(grids = [], { me, principal, mine }) { const live = alive(grids); return mine || !principal ? live.filter((g) => g.created_by === me) : live; }
export { md };
