/** 교재 · 단원 판단 한 벌(순수, 목업 15 · 15b) — 목록 줄(단원 수 · 쓰는 아이 · 단원 없음 · 영역 없음) · 활동 차례(엑셀 줄 순서에서 저절로) · 엑셀 읽기(열 이름 후보 · 문항범위 → 개수 · 엑셀이 날짜로 바꾼 것 짚기) ·
 *  교재 맞추기(교재ID › 이름 › 다른 이름 › 다듬은 열쇠 — 옛 앱 lib/bookName 의 열쇠 그대로) · 올리면 이렇게 됩니다(새로 생김 · 바뀜 · 손대지 않음 · 파일에 없는 기존 줄 · 보류) · 엑셀로 내보낼 줄. 세는 것은 세어 나온다(원칙-5) */
import { AREAS } from "./routine-plan.js";
export const AREA_NAMES = AREAS.map(([a]) => a);
export const CHUNK = Object.freeze([["chapter", "대단원"], ["mid", "중단원"], ["sub", "소단원"]]);
export const BASIS = Object.freeze([["chapter", "대단원 기준"], ["sub", "소단원 기준"]]);
export const MODES = Object.freeze([["overwrite", "덮어쓰기"], ["replace", "지우고 새로 올리기"], ["skip", "이 교재는 건너뛰기"]]);
// ── 같은 교재인지 알아보는 열쇠(옛 앱 lib/bookName.js 그대로) — 판·연도·기호만 없앤다, 숫자와 글자는 절대 안 지운다
const EDITION = /(개정판|개정증보판|개정|증보판|신판|전면개정|리뉴얼|new\s*edition|revised)/gi;
const YEAR_EDGE = /(^\s*(19|20)\d{2}\s*(년|년도)?\s*|\s*(19|20)\d{2}\s*(년|년도)?\s*$)/g;
const PUNCT = /[\s·・.,\-–—_/\\()[\]{}'"“”‘’!?~]/g;
export function bookKey(name) { const raw = String(name ?? "").trim(); if (!raw) return ""; let s = raw.toLowerCase().replace(EDITION, " ").replace(YEAR_EDGE, " ").replace(PUNCT, ""); return s || raw.toLowerCase(); }
/** 활동 차례 — 단원 줄의 차례(sort)에서 활동명이 처음 나오는 순서. 엑셀 줄 순서에서 저절로 나온다 */
export function activityOrder(units = []) { const seen = []; for (const u of [...units].sort((a, b) => a.sort - b.sort)) { const a = u.activity ?? "본책"; if (!seen.includes(a)) seen.push(a); } return seen; }
/** 목록 줄 — 영역으로 거르고 · 단원 없음 · 영역 없음 표시 */
export function listRows(books = [], area = null) {
  return books.filter((b) => !area || b.area === area).map((b) => ({ ...b, units: Number(b.units ?? 0), students: Number(b.students ?? 0), noUnits: Number(b.units ?? 0) === 0, noArea: !b.area, sub: [b.code ?? "—", b.area ?? null, b.level ?? null].filter((x) => x !== null).join(" · ") }));
}
export function counts(books = []) { const active = books.filter((b) => b.state === "active"); return { total: active.length, noUnits: active.filter((b) => Number(b.units ?? 0) === 0).length, noArea: active.filter((b) => !b.area).length, byArea: Object.fromEntries(AREA_NAMES.map((a) => [a, active.filter((b) => b.area === a).length])) }; }
// ── 엑셀 읽기 — 열 이름을 정확히 맞추라고 안 한다(옛 앱 importUnit 의 후보 그대로)
const COLS = Object.freeze([
  ["book", ["교재명", "교재", "책"]], ["code", ["교재id", "교재코드", "코드", "id"]], ["chapter", ["대단원"]], ["mid", ["중단원"]], ["sub", ["소단원", "단원명", "단원"]], ["activity", ["활동명", "활동"]],
  ["page_start", ["시작페이지", "시작p", "시작쪽", "시작"]], ["page_end", ["끝페이지", "끝p", "끝쪽", "종료페이지", "끝"]], ["q_count", ["문항수", "문제수", "문항개수", "문제개수", "문항"]], ["q_range", ["문항범위", "문제범위", "범위"]], ["gist", ["핵심내용", "학습내용", "내용", "요약"]], ["workbook", ["워크북", "갈래"]],
]);
const norm = (k) => String(k ?? "").replace(/\s/g, "").toLowerCase();
/** 머리줄 → 우리 이름 — 완전히 같은 것을 먼저, 그다음 포함(「전체인원」이 「전체」에 안 뺏기게) */
export function mapHeaders(headers = []) {
  const ks = headers.map(norm), out = new Array(headers.length).fill(null), taken = new Set();
  for (const [field, names] of COLS) for (let i = 0; i < ks.length; i++) if (!out[i] && !taken.has(field) && names.some((n) => ks[i] === norm(n))) { out[i] = field; taken.add(field); }
  for (const [field, names] of COLS) for (let i = 0; i < ks.length; i++) if (!out[i] && !taken.has(field) && names.some((n) => ks[i].includes(norm(n)))) { out[i] = field; taken.add(field); }
  return out;
}
const num = (v) => { const d = String(v ?? "").replace(/[^\d]/g, ""); return d ? parseInt(d, 10) : null; };
/** 엑셀이 문항범위를 날짜로 바꿔놨나(옛 앱 2026-08-06) — 「1-25」 → 2026-01-25 · 45678. 오류는 안 나고 분량만 영영 틀린다 → 미리보기에서 짚는다 */
export function rangeMangled(v) { const s = String(v ?? "").trim(); if (!s) return false; return /\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(s) || /\d{1,2}[-./]\d{1,2}[-./]\d{4}/.test(s) || /^\d{5,}$/.test(s); }
/** 「01-06」 · 「1~25」 · 「3,5,7」 → 문항 개수 */
export function countRange(v) { const s = String(v ?? "").trim(); if (!s) return null; let n = 0; for (const part of s.split(/[,·\s]+/).filter(Boolean)) { const m = part.match(/^(\d+)\s*[-~–]\s*(\d+)$/); if (m) { const a = Number(m[1]), b = Number(m[2]); if (b >= a) n += b - a + 1; continue; } if (/^\d+$/.test(part)) n += 1; } return n || null; }
/** 시트 줄들(sheet_to_json 의 객체) → 단원 줄들. 교재명이 비면 위 줄의 교재를 잇는다(엑셀에서 흔히 비운다) · 이름이 될 값이 하나도 없으면 버린다 */
export function parseUnitRows(sheetRows = []) {
  const headers = sheetRows.length ? Object.keys(sheetRows[0]) : [], fields = mapHeaders(headers);
  const rows = [], mangled = []; let lastBook = "", lastChapter = "";
  sheetRows.forEach((r, i) => {
    const o = {}; fields.forEach((f, j) => { if (f) o[f] = String(r[headers[j]] ?? "").trim(); });
    const own = [o.chapter, o.mid, o.sub].some((v) => v);   // 이 줄 제 것으로 이름 될 값이 있어야 한다 — 빈 줄은 이어받아도 줄이 아니다
    if (o.book) lastBook = o.book; else o.book = lastBook;
    if (o.chapter) lastChapter = o.chapter; else o.chapter = lastChapter;
    if (!o.book || !own || !o.chapter) return;
    const row = { line: i + 2, book: o.book, code: o.code || null, chapter: o.chapter, mid: o.mid || null, sub: o.sub || null, activity: o.activity || "본책",
                  is_workbook: /워크|workbook/i.test(o.activity ?? "") || /^(y|yes|o|true|1|워크북)$/i.test(o.workbook ?? ""),
                  page_start: num(o.page_start), page_end: num(o.page_end), q_count: num(o.q_count), q_range: o.q_range || null, gist: o.gist || null };
    if (!row.q_count && row.q_range && !rangeMangled(row.q_range)) row.q_count = countRange(row.q_range);
    if (rangeMangled(row.q_range)) mangled.push(row.line);
    rows.push(row);
  });
  return { rows, mangled, fields: fields.filter(Boolean), unknown: headers.filter((h, i) => !fields[i]) };
}
const unitKey = (u) => `${u.chapter}|${u.mid ?? ""}|${u.sub ?? ""}|${u.activity ?? "본책"}`;
const sameUnit = (a, b) => ["is_workbook", "page_start", "page_end", "q_count", "q_range", "gist"].every((k) => (a[k] ?? null) === (b[k] ?? null));
/** 파일의 교재 이름 → 앱의 교재 — 교재ID › 이름 그대로 › 다른 이름 › 다듬은 열쇠. 후보가 둘이면 못 고른다(보류) */
export function matchBooks(rows = [], books = []) {
  const byName = new Map();
  for (const r of rows) { const k = r.book.replace(/\s+/g, " ").trim(); if (!byName.has(k)) byName.set(k, { name: k, code: r.code, rows: [] }); byName.get(k).rows.push(r); }
  return [...byName.values()].map((g) => {
    const key = bookKey(g.name), nm = norm(g.name);
    const byCode = g.code ? books.filter((b) => b.code && norm(b.code) === norm(g.code)) : [];
    const exact = books.filter((b) => norm(b.name) === nm), alias = books.filter((b) => (b.aliases ?? []).some((a) => norm(a) === nm)), fuzzy = books.filter((b) => bookKey(b.name) === key || (b.aliases ?? []).some((a) => bookKey(a) === key));
    const hits = byCode.length ? byCode : exact.length ? exact : alias.length ? alias : fuzzy;
    const uniq = [...new Map(hits.map((b) => [b.id, b])).values()];
    return { ...g, key, book: uniq.length === 1 ? uniq[0] : null, candidates: uniq.length > 1 ? uniq : [], how: uniq.length !== 1 ? null : byCode.length ? "교재ID" : exact.length ? "이름" : alias.length ? "다른 이름" : "비슷한 이름" };
  });
}
/** 단원 줄의 묶음 — 이 교재의 기존 줄이 이관(import)이면 새 줄도 이관으로 적어 한 교재에 두 출처가 섞이지 않게(검사-⑰) · 없으면 excel */
export const batchFor = (existing = []) => { const b = existing.find((u) => u.batch ?? u.import_batch)?.batch ?? existing.find((u) => u.import_batch)?.import_batch ?? null; return b === "import" ? "import" : "excel"; };
/** 덮어쓰기의 차례 — 기존 줄의 차례를 지키고 파일 줄을 끼운다: 있는 줄은 제자리에서 내용만 · 새 줄은 같은 대단원의 마지막 뒤 · 새 대단원은 끝. 전체에 차례를 다시 매긴다(파일에 없는 기존 줄은 내용 그대로) */
export function mergeOrder(existing = [], fileRows = []) {
  const out = [...existing].sort((a, b) => a.sort - b.sort).map((u) => ({ chapter: u.chapter, mid: u.mid ?? null, sub: u.sub ?? null, activity: u.activity ?? "본책", is_workbook: Boolean(u.is_workbook), page_start: u.page_start ?? null, page_end: u.page_end ?? null, q_count: u.q_count ?? null, q_range: u.q_range ?? null, gist: u.gist ?? null, id: u.id ?? null, line: null }));
  for (const r of fileRows) {
    const k = unitKey(r), at = out.findIndex((u) => unitKey(u) === k);
    const row = { chapter: r.chapter, mid: r.mid ?? null, sub: r.sub ?? null, activity: r.activity ?? "본책", is_workbook: Boolean(r.is_workbook), page_start: r.page_start ?? null, page_end: r.page_end ?? null, q_count: r.q_count ?? null, q_range: r.q_range ?? null, gist: r.gist ?? null, line: r.line ?? null };
    if (at >= 0) { out[at] = { ...row, id: out[at].id }; continue; }
    let last = -1; out.forEach((u, i) => { if (u.chapter === r.chapter) last = i; });
    if (last >= 0) out.splice(last + 1, 0, { ...row, id: null }); else out.push({ ...row, id: null });
  }
  return out.map((u, i) => ({ ...u, sort: (i + 1) * 10 }));
}
/** 올리면 이렇게 됩니다 — 맞은 교재마다(덮어쓰기: 파일 줄만 · 파일에 없는 기존 줄은 그대로 / 지우고 새로 / 건너뛰기) 새로 생김 · 바뀜 · 손대지 않음 · 파일에 없는 기존 줄 · 보류(못 맞춘 교재) */
export function planUpload(groups = [], unitsByBook = {}, modes = {}) {
  const perBook = [], holds = [];
  for (const g of groups) {
    if (!g.book) { holds.push({ name: g.name, key: g.key, lines: g.rows.length, first: g.rows[0]?.line ?? null, candidates: g.candidates }); continue; }
    const mode = modes[g.book.id] ?? "overwrite", existing = unitsByBook[g.book.id] ?? [], byKey = new Map(existing.map((u) => [unitKey(u), u]));
    const seen = new Set(); let added = 0, changed = 0, same = 0;
    for (const r of g.rows) { const k = unitKey(r); const ex = byKey.get(k); seen.add(k); if (!ex) added++; else if (sameUnit(ex, r)) same++; else changed++; }
    const untouched = existing.filter((u) => !seen.has(unitKey(u))).length;
    perBook.push({ book_id: g.book.id, name: g.book.name, file_name: g.name, how: g.how, mode, batch: batchFor(existing), added, changed, same, untouched, rows: mode === "skip" ? [] : mode === "replace" ? g.rows.map((r, i) => ({ ...r, sort: (i + 1) * 10, id: null })) : mergeOrder(existing, g.rows), existing: existing.length });
  }
  const live = perBook.filter((p) => p.mode !== "skip");
  return { perBook, holds, totals: { added: live.reduce((n, p) => n + p.added, 0), changed: live.reduce((n, p) => n + p.changed, 0), same: live.reduce((n, p) => n + p.same, 0), untouched: live.reduce((n, p) => n + (p.mode === "overwrite" ? p.untouched : 0), 0), holds: holds.reduce((n, h) => n + h.lines, 0), books: live.length } };
}
/** 엑셀로 내보낼 줄 — 올리기 양식과 같은 열 */
export const UNIT_HEADERS = Object.freeze(["교재명", "교재ID", "대단원", "중단원", "소단원", "활동명", "워크북", "시작페이지", "끝페이지", "문항수", "문항범위", "핵심내용"]);
export const exportRows = (units = [], book = {}) => [...units].sort((a, b) => a.sort - b.sort).map((u) => ({ 교재명: book.name ?? "", 교재ID: book.code ?? "", 대단원: u.chapter ?? "", 중단원: u.mid ?? "", 소단원: u.sub ?? "", 활동명: u.activity ?? "", 워크북: u.is_workbook ? "Y" : "", 시작페이지: u.page_start ?? "", 끝페이지: u.page_end ?? "", 문항수: u.q_count ?? "", 문항범위: u.q_range ?? "", 핵심내용: u.gist ?? "" }));
/** 단원 표 한 줄 — 학습유형은 워크북/본책, 쪽 「p.96-101」 */
export const pagesText = (u) => (u.page_start ? `p.${u.page_start}${u.page_end && u.page_end !== u.page_start ? `-${u.page_end}` : ""}` : "");
