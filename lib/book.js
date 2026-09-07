/** 교재 · 단원 15 · 엑셀 15b 의 손 — 판 읽기(한 벌 book_board) · + 교재 · 교재 고치기(교재ID · 영역 · 배정 겹 · 차례 기준 · 단원평가 · 상태) · 다른 이름 · 문법 분류 잇기(한 곳 set_unit_topics) · 분류 더하기 ·
 *  엑셀 미리보기(읽기 → 교재 맞추기 → 올리면 이렇게 됩니다) · 저장(덮어쓰기 = 파일 줄만 upsert · 지우고 새로 = 한 곳 replace_book_units · 건너뛰기 · 보류는 다른 이름 등록/새 교재/건너뛰기). 지우지 않는다(대전제-6) · 판단은 lib/book-plan.js(순수) */
import { db } from "./supabase.js";
import { AREA_NAMES, parseUnitRows, matchBooks, planUpload, parseUnitEdit } from "./book-plan.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
export async function bookBoard(sb, date, bookId = null) {
  const { data, error } = await db(sb).rpc("book_board", { p_on: date, p_book: bookId || null });
  if (error) throw new Error(`교재 판을 못 읽음: ${error.message}`);
  if (!data) throw new Error("교재는 학원 사람의 화면입니다");
  return data;
}
const cleanCode = (c) => { const s = String(c ?? "").trim().toUpperCase(); return s || null; };
/** + 교재 — 이름 · 영역 · 교재ID(비면 없음) · 배정 겹 · 차례 기준 */
export async function addBook(sb, { name, area = null, code = null, chunkDepth = "sub", orderBasis = "sub" }) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("교재 이름을 적으세요");
  if (area && !AREA_NAMES.includes(area)) throw new Error(`영역이 아닙니다: ${area}`);
  if (!["chapter", "mid", "sub"].includes(chunkDepth)) throw new Error("배정 겹이 아닙니다"); if (!["chapter", "sub"].includes(orderBasis)) throw new Error("차례 기준이 아닙니다");
  const dup = row(await db(sb).from("books").select("id").eq("name", nm).maybeSingle(), "교재를 못 읽음"); if (dup) throw new Error("같은 이름의 교재가 이미 있습니다 — 다른 이름이면 「다른 이름」으로 이으세요");
  const ins = row(await db(sb).from("books").insert({ name: nm, area, code: cleanCode(code), chunk_depth: chunkDepth, order_basis: orderBasis, state: "active", import_batch: "excel" }).select("id").single(), "교재를 못 넣음");
  return ins.id;
}
/** 교재 고치기 — 온 칸만 */
export async function setBook(sb, bookId, patch = {}) {
  const p = {};
  if ("code" in patch) p.code = cleanCode(patch.code);
  if ("area" in patch) { if (patch.area && !AREA_NAMES.includes(patch.area)) throw new Error(`영역이 아닙니다: ${patch.area}`); p.area = patch.area || null; }
  if ("chunk_depth" in patch) { if (!["chapter", "mid", "sub"].includes(patch.chunk_depth)) throw new Error("배정 겹이 아닙니다"); p.chunk_depth = patch.chunk_depth; }
  if ("order_basis" in patch) { if (!["chapter", "sub"].includes(patch.order_basis)) throw new Error("차례 기준이 아닙니다"); p.order_basis = patch.order_basis; }
  if ("unit_test" in patch) p.unit_test = Boolean(patch.unit_test);
  if ("state" in patch) { if (!["active", "paused", "stopped"].includes(patch.state)) throw new Error("상태가 아닙니다"); p.state = patch.state; }
  if (!Object.keys(p).length) throw new Error("고칠 것이 없습니다");
  const r = row(await db(sb).from("books").update(p).eq("id", bookId).select("id"), "교재를 못 고침") ?? [];
  if (!r.length) throw new Error("교재가 없습니다");
}
/** 다른 이름 — 어느 이름도 다른 이름을 덮지 않는다(0007) · 이미 다른 교재의 이름이면 막는다 */
export async function addAlias(sb, bookId, alias, source = "app") {
  const a = String(alias ?? "").trim(); if (!a) throw new Error("이름을 적으세요");
  const other = row(await db(sb).from("book_alias").select("book_id").eq("alias", a).maybeSingle(), "다른 이름을 못 읽음");
  if (other && other.book_id !== bookId) throw new Error("이미 다른 교재의 이름입니다");
  if (other) return false;
  row(await db(sb).from("book_alias").insert({ book_id: bookId, alias: a, source }).select("alias"), "다른 이름을 못 더함");
  return true;
}
export async function setUnitTopics(sb, unitId, topicIds = []) { return Number(row(await db(sb).rpc("set_unit_topics", { p_unit: unitId, p_topics: topicIds.filter(Boolean) }), "문법 분류를 못 이음") ?? 0); }
export async function addTopic(sb, name) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("분류 이름을 적으세요");
  const ex = row(await db(sb).from("grammar_topics").select("id").eq("name", nm).maybeSingle(), "분류를 못 읽음"); if (ex) return ex.id;
  return row(await db(sb).from("grammar_topics").insert({ name: nm }).select("id").single(), "분류를 못 더함").id;
}
/** 미리보기 — 시트 줄 → 단원 줄 → 교재 맞추기 → 맞은 교재의 기존 단원과 견줘 「올리면 이렇게 됩니다」. 저장은 안 한다 */
export async function previewUpload(sb, sheetRows = [], date, modes = {}) {
  const parsed = parseUnitRows(sheetRows);
  if (!parsed.rows.length) throw new Error("읽을 줄이 없습니다 — 교재명과 대단원(또는 중·소단원) 열이 있어야 합니다");
  const books = row(await db(sb).from("books").select("id,code,name,area,state,book_alias(alias)"), "교재를 못 읽음") ?? [];
  const groups = matchBooks(parsed.rows, books.map((b) => ({ ...b, aliases: (b.book_alias ?? []).map((a) => a.alias) })));
  const ids = groups.filter((g) => g.book).map((g) => g.book.id);
  const units = ids.length ? row(await db(sb).from("units").select("id,book_id,chapter,mid,sub,activity,is_workbook,sort,page_start,page_end,q_count,q_range,gist,import_batch").in("book_id", ids), "단원을 못 읽음") ?? [] : [];
  const byBook = {}; for (const u of units) (byBook[u.book_id] ??= []).push(u);
  const plan = planUpload(groups, byBook, modes);
  const usage = {}; for (const p of plan.perBook) usage[p.book_id] = row(await db(sb).rpc("book_usage", { p_book: p.book_id, p_on: date }), "쓰임을 못 읽음");   // ②를 고르면 같이 사라질 것 — 맞은 교재마다(모달에서 고를 때 바로 보이게)
  return { ...plan, mangled: parsed.mangled, unknown: parsed.unknown, lines: parsed.rows.length, usage, rows: parsed.rows, books: books.filter((b) => b.state === "active").map((b) => ({ id: b.id, name: b.name })) };
}
/** 저장 — 보류(못 맞춘 교재)는 해결(다른 이름 등록 · 새 교재 · 건너뛰기)한 것만. 덮어쓰기는 파일 줄만 upsert(파일에 없는 기존 줄은 그대로) · 지우고 새로는 한 곳(표가 막으면 그 교재는 통째로 실패) */
export async function applyUpload(sb, rows = [], date, { modes = {}, holds = {} } = {}) {
  const books = row(await db(sb).from("books").select("id,code,name,area,state,book_alias(alias)"), "교재를 못 읽음") ?? [];
  const list = books.map((b) => ({ ...b, aliases: (b.book_alias ?? []).map((a) => a.alias) }));
  // 보류 해결 — 다른 이름으로 등록 · 새 교재로 · 건너뛰기
  for (const g of matchBooks(rows, list)) {
    if (g.book) continue; const h = holds[g.key] ?? holds[g.name]; if (!h || h.act === "skip") continue;
    if (h.act === "alias") { if (!h.book_id) throw new Error(`「${g.name}」 — 어느 교재의 다른 이름인지 고르세요`); await addAlias(sb, h.book_id, g.name, "excel"); const b = list.find((x) => x.id === h.book_id); if (b) b.aliases = [...(b.aliases ?? []), g.name]; }
    else if (h.act === "new") { const id = await addBook(sb, { name: g.name, area: h.area ?? null, code: g.code ?? null }); list.push({ id, code: g.code ?? null, name: g.name, area: h.area ?? null, state: "active", aliases: [] }); }
  }
  const groups = matchBooks(rows, list), ids = groups.filter((g) => g.book).map((g) => g.book.id);
  const units = ids.length ? row(await db(sb).from("units").select("id,book_id,chapter,mid,sub,activity,is_workbook,sort,page_start,page_end,q_count,q_range,gist,import_batch").in("book_id", ids), "단원을 못 읽음") ?? [] : [];
  const byBook = {}; for (const u of units) (byBook[u.book_id] ??= []).push(u);
  const plan = planUpload(groups, byBook, modes);
  let put = 0, replaced = 0, skipped = 0; const failed = [];
  for (const p of plan.perBook) {
    if (p.mode === "skip") { skipped++; continue; }
    const body = p.rows.map((r) => ({ book_id: p.book_id, chapter: r.chapter, mid: r.mid, sub: r.sub, activity: r.activity, is_workbook: r.is_workbook, sort: r.sort, page_start: r.page_start, page_end: r.page_end, q_count: r.q_count, q_range: r.q_range, gist: r.gist, state: "active", import_batch: p.batch }));
    try {
      if (p.mode === "replace") { replaced += Number(row(await db(sb).rpc("replace_book_units", { p_book: p.book_id, p_rows: body, p_batch: p.batch }), "단원을 못 새로 올림") ?? 0); }
      else { const r = row(await db(sb).from("units").upsert(body, { onConflict: "book_id,chapter,mid,sub,activity" }).select("id"), "단원을 못 올림") ?? []; put += r.length; }
    } catch (e) { failed.push(`${p.name}: ${String(e?.message ?? e).replace(/^[^:]*: /, "")}`); }
  }
  return { books: plan.perBook.length - skipped, put, replaced, skipped, holds: plan.holds.length, failed };
}

/** 단원 한 줄 손으로 고치기(쪽 · 문항 · 요지 — 엑셀 없이 · 4단계-4). 이름·차례는 엑셀로 */
export async function setUnit(sb, unitId, f) {
  const p = parseUnitEdit(f);
  const r = row(await db(sb).from("units").update(p).eq("id", unitId).select("id"), "단원을 못 고침"); if (!r?.length) throw new Error("단원이 없습니다");
}
/** 단원 숨김·되살리기(state — 지우지 않는다 · 숨긴 단원은 깔기·회차·범위에서 빠진다) */
export async function setUnitState(sb, unitId, state) {
  if (!["active", "hidden"].includes(state)) throw new Error(`상태가 아닙니다: ${state}`);
  const r = row(await db(sb).from("units").update({ state }).eq("id", unitId).select("id"), "단원 상태를 못 고침"); if (!r?.length) throw new Error("단원이 없습니다");
}
