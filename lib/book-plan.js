/** 교재 · 단원 판단 한 벌(순수, 목업 15 · 15b) — 목록 줄(단원 수 · 쓰는 아이 · 단원 없음 · 영역 없음) · 활동 차례(엑셀 줄 순서에서 저절로) · 엑셀 읽기(열 이름 후보 · 문항범위 → 개수 · 엑셀이 날짜로 바꾼 것 짚기) ·
 *  교재 맞추기(교재ID › 이름 › 다른 이름 › 다듬은 열쇠 — 옛 앱 lib/bookName 의 열쇠 그대로) · 올리면 이렇게 됩니다(새로 생김 · 바뀜 · 손대지 않음 · 파일에 없는 기존 줄 · 보류) · 엑셀로 내보낼 줄 ·
 *  시트 갈래(단원/교재 — 첫 줄 열 이름으로) · 교재 시트 읽기·계획(새로 · 고침 · 같음 · 보류 · 고칠 줄 — 옛 앱 importTextbook 의 열) · 묶음(덮어쓰기가 적을 것 · 묶음 글 · 📦 줄 · 되돌린 글 — 0057·0142, 5단계-④). 세는 것은 세어 나온다(원칙-5) */
import { AREAS } from "./routine-plan.js";
import { seoulDate } from "./dash-plan.js";
import { seoulTime } from "./day-plan.js";
export const AREA_NAMES = AREAS.map(([a]) => a);
export const CHUNK = Object.freeze([["chapter", "대단원"], ["mid", "중단원"], ["sub", "소단원"]]);
export const BASIS = Object.freeze([["chapter", "대단원 기준"], ["sub", "소단원 기준"]]);
export const MODES = Object.freeze([["overwrite", "덮어쓰기"], ["replace", "지우고 새로 올리기"], ["skip", "이 교재는 건너뛰기"]]);
// ── 같은 교재인지 알아보는 열쇠(옛 앱 lib/bookName.js 그대로) — 판·연도·기호만 없앤다, 숫자와 글자는 절대 안 지운다
const EDITION = /(개정판|개정증보판|개정|증보판|신판|전면개정|리뉴얼|new\s*edition|revised)/gi;
const YEAR_EDGE = /(^\s*(19|20)\d{2}\s*(년|년도)?\s*|\s*(19|20)\d{2}\s*(년|년도)?\s*$)/g;
const PUNCT = /[\s·・.,\-–—_/\\()[\]{}'"“”‘’!?~]/g;
export function bookKey(name) { const raw = String(name ?? "").trim(); if (!raw) return ""; let s = raw.toLowerCase().replace(EDITION, " ").replace(YEAR_EDGE, " ").replace(PUNCT, ""); return s || raw.toLowerCase(); }
/** 활동 차례 — 대단원마다 활동명이 나오는 차례(sort)를 **앞뒤를 지키며 합친 것**(어느 대단원에서도 앞에 남은 활동이 없는 것부터 · 같으면 먼저 나온 것). 엑셀 줄 순서에서 저절로 나온다 — 칸이 따로 없다.
 *  대단원끼리 어긋난 자료(1과 본책→문제 · 2과 문제→본책)면 먼저 나온 것부터. ◀ ▶(reorderByActivity)로 줄을 세우면 이 차례가 곧 바뀐다 */
export function activityOrder(units = []) {
  const sorted = [...units].sort((a, b) => a.sort - b.sort), name = (u) => u.activity ?? "본책";
  const first = []; for (const u of sorted) if (!first.includes(name(u))) first.push(name(u));   // 처음 나온 차례 — 동률·어긋남의 기준
  const seqs = [...new Set(sorted.map((u) => u.chapter))].map((ch) => { const s = []; for (const u of sorted) if (u.chapter === ch && !s.includes(name(u))) s.push(name(u)); return s; });
  const out = [], left = new Set(first);
  while (left.size) {
    const head = first.find((a) => left.has(a) && seqs.every((s) => { const i = s.indexOf(a); return i < 0 || s.slice(0, i).every((x) => !left.has(x)); })) ?? first.find((a) => left.has(a));
    out.push(head); left.delete(head);
  }
  return out;
}
/** 활동 차례 바꾸기((가)-②) — 대단원 안에서 새 차례대로 단원 줄을 다시 세운다(대단원 차례 그대로 · 같은 활동끼리는 지금 차례 그대로 · 차례에 없는 활동은 뒤로) → 바뀐 줄만 [{id, sort}](10씩).
 *  활동 차례는 칸이 아니라 줄 차례에서 나오므로 줄을 세우면 곧 차례가 바뀐다 — 01 학습·숙제 깔기(todo_units) · 02b · 08 · 04 범위도 같은 줄 차례를 쓴다(엑셀을 다시 올린 것과 같다) */
export function reorderByActivity(units = [], order = []) {
  const rank = (u) => { const i = order.indexOf(u.activity ?? "본책"); return i < 0 ? order.length : i; };
  const sorted = [...units].sort((a, b) => a.sort - b.sort);
  const out = [...new Set(sorted.map((u) => u.chapter))].flatMap((ch) => sorted.map((u, i) => ({ u, i })).filter((x) => x.u.chapter === ch).sort((x, y) => rank(x.u) - rank(y.u) || x.i - y.i).map((x) => x.u));
  return out.map((u, i) => ({ id: u.id, sort: (i + 1) * 10, was: u.sort })).filter((x) => x.was !== x.sort).map(({ id, sort }) => ({ id, sort }));
}
/** 활동 하나를 앞(left)·뒤(right)로 → 새 활동 차례. 끝이면 null · 없는 활동이면 던진다 */
export function moveActivity(units = [], activity, dir) {
  const order = activityOrder(units), i = order.indexOf(activity); if (i < 0) throw new Error(`없는 활동입니다: ${activity}`);
  const j = dir === "left" ? i - 1 : i + 1; if (j < 0 || j >= order.length) return null;
  [order[i], order[j]] = [order[j], order[i]]; return order;
}
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
function mapWith(cols, headers = []) {
  const ks = headers.map(norm), out = new Array(headers.length).fill(null), taken = new Set();
  for (const [field, names] of cols) for (let i = 0; i < ks.length; i++) if (!out[i] && !taken.has(field) && names.some((n) => ks[i] === norm(n))) { out[i] = field; taken.add(field); }
  for (const [field, names] of cols) for (let i = 0; i < ks.length; i++) if (!out[i] && !taken.has(field) && names.some((n) => ks[i].includes(norm(n)))) { out[i] = field; taken.add(field); }
  return out;
}
export const mapHeaders = (headers = []) => mapWith(COLS, headers);
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
export const unitKey = (u) => `${u.chapter}|${u.mid ?? ""}|${u.sub ?? ""}|${u.activity ?? "본책"}`;
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

/** 단원 한 줄 손으로 고치기 읽기(15 · 4단계-4) — 쪽 「10-12」/「10」(p. 는 떼고) · 문항(0 이상 정수) · 요지. 비우면 없앤다(null). 이름·차례는 엑셀로(전체 차례가 얽힌다) */
export function parseUnitEdit(f = {}) {
  const pages = String(f.pages ?? "").trim().replace(/^p\./i, "");
  let page_start = null, page_end = null;
  if (pages) { const m = /^(\d+)\s*(?:[-~]\s*(\d+))?$/.exec(pages); if (!m) throw new Error("쪽은 「10-12」처럼 적으세요"); page_start = Number(m[1]); page_end = m[2] ? Number(m[2]) : page_start; if (page_end < page_start) throw new Error("끝 쪽이 앞 쪽보다 작습니다"); }
  const q = String(f.qCount ?? "").trim(); const q_count = q === "" ? null : Number(q); if (q_count != null && (!Number.isInteger(q_count) || q_count < 0)) throw new Error("문항은 0 이상 정수로 적으세요");
  return { page_start, page_end, q_count, gist: String(f.gist ?? "").trim() || null };
}
export const UNIT_STATE = Object.freeze([["active", "쓰는 중"], ["hidden", "숨김"]]);

// ── 교재 시트(15b · 5단계-④) — 옛 앱 lib/importTextbook 의 열 후보 그대로(+ 교재ID · 출판사 · 연도). 첫 줄 열 이름으로 단원 시트와 가른다
const BOOK_COLS = Object.freeze([
  ["name", ["교재명", "교재", "책", "이름"]], ["code", ["교재id", "교재코드", "코드", "id"]], ["area", ["영역"]], ["publisher", ["출판사"]], ["pub_year", ["출판연도", "출판년도", "연도", "년도"]],
  ["level", ["레벨", "적정학년", "대상학년", "학년"]], ["price", ["교재비", "가격", "비용"]], ["buy_url", ["구매링크", "구입링크", "구매url", "링크"]], ["units", ["단원수"]],
]);
export const mapBookHeaders = (headers = []) => mapWith(BOOK_COLS, headers);
/** 시트 갈래 — 대단원·중단원이 있거나 「소단원/단원명/단원」 열이 그대로 있으면 단원 시트 · 교재명 + (영역·레벨·교재비·구매링크·출판사·연도·교재ID) 가 있으면 교재 시트 · 아니면 모름. 「단원수」(⬇ 교재 시트의 셈 열)는 단원 시트로 안 읽힌다 */
export function sheetKind(headers = []) {
  const uf = mapHeaders(headers), ks = headers.map(norm);
  if (uf.some((f, i) => f === "chapter" || f === "mid" || (f === "sub" && ["소단원", "단원명", "단원"].includes(ks[i])))) return "units";
  const bf = mapBookHeaders(headers);
  if (bf.includes("name") && bf.some((f) => f && f !== "name" && f !== "units")) return "books";
  return null;
}
const year = (v) => { const d = String(v ?? "").replace(/[^\d]/g, ""); return /^\d{4}$/.test(d) ? Number(d) : null; };
/** 교재 시트 줄 읽기 — 교재명 없는 줄은 버린다 · 영역 밖 · 링크 꼴 · 연도 꼴 · 같은 교재 두 줄(열쇠가 같으면)은 「고칠 줄」로 빼고 저장하지 않는다 · 값이 빈 칸은 「모름」(지우지 않는다) · 단원수는 셈 열이라 안 읽는다 */
export function parseBookRows(sheetRows = []) {
  const headers = sheetRows.length ? Object.keys(sheetRows[0]) : [], fields = mapBookHeaders(headers);
  const rows = [], bad = [], seen = new Map();
  sheetRows.forEach((r, i) => {
    const o = {}; fields.forEach((f, j) => { if (f) o[f] = String(r[headers[j]] ?? "").trim(); });
    const name = String(o.name ?? "").replace(/\s+/g, " ").trim(); if (!name) return;
    const line = i + 2, why = [], key = bookKey(name);
    if (o.area && !AREA_NAMES.includes(o.area)) why.push(`영역이 아닙니다: ${o.area}`);
    if (o.buy_url && !/^https?:\/\//i.test(o.buy_url)) why.push("구매링크는 http 로 시작해야 합니다");
    if (o.pub_year && year(o.pub_year) == null) why.push(`연도가 아닙니다: ${o.pub_year}`);
    if (seen.has(key)) why.push(`같은 교재가 위에 또 있습니다(${seen.get(key)}행)`);
    if (why.length) { bad.push({ line, name, why: why.join(" · ") }); return; }
    seen.set(key, line);
    rows.push({ line, name, code: o.code ? o.code.toUpperCase() : null, area: o.area || null, publisher: o.publisher || null, pub_year: o.pub_year ? year(o.pub_year) : null, level: o.level || null, price: o.price ? num(o.price) : null, buy_url: o.buy_url || null });
  });
  return { rows, bad, fields: fields.filter(Boolean), unknown: headers.filter((h, i) => !fields[i]) };
}
/** 교재 시트가 고칠 수 있는 칸(이름은 못 바꾼다 — 이름이 곧 열쇠) · 시트 값이 있고 지금 값과 다른 칸만(빈 칸은 지우지 않는다) */
export const BOOK_FIELDS = Object.freeze([["code", "교재ID"], ["area", "영역"], ["publisher", "출판사"], ["pub_year", "연도"], ["level", "레벨"], ["price", "교재비"], ["buy_url", "구매링크"]]);
export function bookPatch(r = {}, cur = {}) {
  const patch = {}, labels = [];
  for (const [k, nm] of BOOK_FIELDS) if (r[k] != null && r[k] !== "" && String(r[k]) !== String(cur[k] ?? "")) { patch[k] = r[k]; labels.push(nm); }
  return { patch, labels };
}
/** 올리면 이렇게 됩니다(교재 시트) — 줄마다 교재 맞추기(교재ID › 이름 › 다른 이름 › 비슷한 이름) → 새로 만듦 · 고침(어느 칸) · 같음 · 보류(후보 둘) */
export function planBookUpload(rows = [], books = []) {
  const groups = matchBooks(rows.map((r) => ({ book: r.name, code: r.code })), books);
  const perRow = rows.map((r) => {
    const g = groups.find((x) => x.name === r.name);
    if (!g?.book) return { ...r, book: null, how: null, act: g?.candidates?.length ? "hold" : "new", labels: [], candidates: g?.candidates ?? [] };
    const { labels } = bookPatch(r, g.book);
    return { ...r, book: { id: g.book.id, name: g.book.name }, how: g.how, act: labels.length ? "update" : "same", labels, candidates: [] };
  });
  const n = (a) => perRow.filter((p) => p.act === a).length;
  return { perRow, totals: { new: n("new"), update: n("update"), same: n("same"), hold: n("hold") } };
}
export const BOOK_HEADERS = Object.freeze(["교재명", "교재ID", "영역", "출판사", "연도", "레벨", "교재비", "구매링크", "단원수"]);
/** ⬇ 교재 시트 — 올리기 양식과 같은 열 · 이름 차례 · 단원수는 셈 열(올릴 때 무시 — 어느 교재에 단원이 없는지 파일만 보고도 보인다) */
export const exportBookRows = (books = []) => [...books].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""))).map((b) => ({ 교재명: b.name ?? "", 교재ID: b.code ?? "", 영역: b.area ?? "", 출판사: b.publisher ?? "", 연도: b.pub_year ?? "", 레벨: b.level ?? "", 교재비: b.price ?? "", 구매링크: b.buy_url ?? "", 단원수: b.units ?? "" }));

// ── 묶음(0057 excel_run · excel_row — 0142 부터 15b 가 적는다 · 되돌리기는 SQL 한 곳 undo_excel_run)
const UNIT_CONTENT = ["chapter", "mid", "sub", "activity", "is_workbook", "page_start", "page_end", "q_count", "q_range", "gist"];
/** 덮어쓰기가 적을 것 — mergeOrder 의 줄마다: id 없으면 새 줄 · 내용이나 차례가 바뀌었으면 고침(before = 기존 줄 전체 — 되돌리기 자료) · 그대로면 안 적는다. 차례만 바뀐 것은 따로 센다(미리보기의 「바뀜」은 내용만 센다) */
export function splitUnitWrite(existing = [], rows = []) {
  const byId = new Map(existing.map((u) => [u.id, u])), inserts = [], updates = []; let sortOnly = 0;
  for (const r of rows) {
    const ex = r.id ? byId.get(r.id) : null;
    if (!ex) { inserts.push(r); continue; }
    const content = UNIT_CONTENT.some((k) => (k === "is_workbook" ? Boolean(ex[k]) !== Boolean(r[k]) : (ex[k] ?? null) !== (r[k] ?? null)));
    if (!content && Number(ex.sort) === Number(r.sort)) continue;
    if (!content) sortOnly++;
    updates.push({ id: r.id, before: ex, row: r });
  }
  return { inserts, updates, sortOnly };
}
/** 묶음 한 줄의 글(excel_run.note) — 저장이 끝나면 적는다 · 📦 카드가 그대로 보여준다 */
export const runNote = ({ books = 0, added = 0, changed = 0, sortOnly = 0, replaced = 0, skipped = 0 } = {}) => `교재 ${books}권 · 새로 ${added} · 바뀜 ${changed}${sortOnly ? ` · 차례만 ${sortOnly}` : ""}${replaced ? ` · 지우고 새로 ${replaced}줄` : ""}${skipped ? ` · 건너뜀 ${skipped}권` : ""}`;
export const bookRunNote = ({ created = 0, updated = 0, same = 0 } = {}) => `교재 시트 — 새로 ${created}권 · 고침 ${updated}권 · 같음 ${same}`;
export const RUN_TBL = Object.freeze({ units: "단원", books: "교재" });
const seoulAt = (ts) => (ts ? `${seoulDate(ts).slice(5)} ${seoulTime(ts)}` : "");
/** 📦 올린 묶음 한 줄 — 「#12 단원 · 파일」 · 「09-07 23:10 · 원장」 · 글(없으면 셈으로) · 상태(살아 있음 · 되돌림) · 되돌릴 수 있나는 SQL 이 준 대로(can_undo — 같은 표의 마지막 살아 있는 묶음만) */
export function runLine(r = {}) {
  return { id: r.id, title: `#${r.id} ${RUN_TBL[r.tbl] ?? r.tbl}${r.sheet ? ` · ${r.sheet}` : ""}`, when: [seoulAt(r.at), r.who].filter(Boolean).join(" · "),
           note: r.note ?? `새로 ${r.n_insert ?? 0} · 고침 ${r.n_update ?? 0}${r.n_delete ? ` · 지움 ${r.n_delete}` : ""}`, state: r.undone_at ? "undone" : "live", canUndo: Boolean(r.can_undo), undoneAt: r.undone_at ? seoulAt(r.undone_at) : null };
}
/** 되돌린 결과 글 — SQL undo_excel_run 이 준 셈 그대로(되살림 = 고침을 before 로 + 지운 줄 되살림) */
export const undoText = (x = {}) => `되돌렸습니다 — #${x.run} ${RUN_TBL[x.tbl] ?? ""} · 되살림 ${(x.restored ?? 0) + (x.revived ?? 0)} · 지움 ${x.removed ?? 0}${x.hidden ? ` · 숨김 ${x.hidden}(진도·배정·분류가 걸려 못 지웠습니다 — 지우지 않습니다)` : ""}`;
