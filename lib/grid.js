/** 학교별 표 06c 의 손 — 판 읽기(한 벌 grid_board) · + 새 표(본에서) · 표 내리기 · 칸(더하기 · 고치기 · 차례 · 내리기 · 보드 축) · 줄(더하기 · 차례 · 내리기) · 셀(손 떼면 저장 — 값은 lib/grid-plan parseCell 한 곳) · 따로 챙길 아이 메모.
 *  지우지 않는다(대전제-6): 표·칸·줄의 ✕ 는 retired. 판단은 lib/grid-plan.js(순수) */
import { db } from "./supabase.js";
import { templateOf, colsFromTemplate, parseCol, parseCell, moveIn, alive, convertMany, rowTitle } from "./grid-plan.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
export async function gridBoard(sb, date) {
  const { data, error } = await db(sb).rpc("grid_board", { p_on: date });
  if (error) throw new Error(`학교별 표를 못 읽음: ${error.message}`);
  if (!data) throw new Error("학교별 표는 학원 사람의 화면입니다");
  return data;
}
/** + 새 표 — 본 하나(이름을 바꿔도 된다). 본의 칸을 같이 세우고, 「진행 상황」 같은 보드 축이 있으면 붙인다 */
export async function addGrid(sb, { template, label = null }, by = null) {
  const t = templateOf(template); if (!t) throw new Error(`본이 없습니다: ${template}`);
  const nm = String(label ?? "").trim() || t.label;
  const g = row(await db(sb).from("grid").insert({ label: nm, rows: t.rows, template: t.key, created_by: by }).select("id").single(), "표를 못 세움");
  const cols = colsFromTemplate(t);
  let made = [];
  if (cols.length) made = row(await db(sb).from("grid_col").insert(cols.map((c) => ({ grid_id: g.id, ...c }))).select("id,label,type"), "칸을 못 세움") ?? [];
  const axis = t.board ? made.find((c) => c.label === t.board && c.type === "select") : null;
  if (axis) row(await db(sb).from("grid").update({ board_col: axis.id }).eq("id", g.id).select("id"), "보드 축을 못 붙임");
  return { id: g.id, cols: made.length, board: Boolean(axis) };
}
export async function retireGrid(sb, gridId) { const r = row(await db(sb).from("grid").update({ state: "retired" }).eq("id", gridId).eq("state", "active").select("id"), "표를 못 내림"); if (!r?.length) throw new Error("이미 내린 표입니다"); }
export async function reviveGrid(sb, gridId) { const r = row(await db(sb).from("grid").update({ state: "active" }).eq("id", gridId).eq("state", "retired").select("id"), "표를 못 되살림"); if (!r?.length) throw new Error("살아 있는 표입니다"); }
export async function renameGrid(sb, gridId, label) { const nm = String(label ?? "").trim(); if (!nm) throw new Error("표 이름을 적으세요"); row(await db(sb).from("grid").update({ label: nm }).eq("id", gridId).select("id"), "표 이름을 못 바꿈"); }
/** 표 차례(5단계-⑥) — 살아 있는 표 사이에서 ◀ ▶ · sort 를 10씩 다시 매긴다(판은 sort · created_at 차례로 준다) */
export async function moveGrid(sb, gridId, dir) {
  const list = row(await db(sb).from("grid").select("id,sort,state,created_at").eq("state", "active").order("sort").order("created_at"), "표를 못 읽음") ?? [];
  const order = moveIn(list, gridId, dir); if (!order) return { moved: false };
  for (const o of order) row(await db(sb).from("grid").update({ sort: o.sort }).eq("id", o.id).select("id"), "표 차례를 못 바꿈");
  return { moved: true };
}
/** 칸 — 더하기(끝에) · 고치기(이름·종류·선택지 — 종류나 선택지가 바뀌면 값을 옮겨 담는다: 되는 것만 · 안 되는 것은 그대로 두고 알린다 · 5단계-⑥) · 차례 · 내리기 · 보드 축 */
async function colsOf(sb, gridId) { return row(await db(sb).from("grid_col").select("id,sort,state,type").eq("grid_id", gridId), "칸을 못 읽음") ?? []; }
export async function addCol(sb, gridId, f) {
  const c = parseCol(f); const have = alive(await colsOf(sb, gridId)); const sort = (Math.max(0, ...have.map((x) => x.sort)) + 10);
  const ins = row(await db(sb).from("grid_col").insert({ grid_id: gridId, ...c, sort }).select("id").single(), "칸을 못 더함"); return ins.id;
}
export async function setCol(sb, colId, f) {
  const c = parseCol(f);
  const cur = row(await db(sb).from("grid_col").select("id,type,options").eq("id", colId).maybeSingle(), "칸을 못 읽음"); if (!cur) throw new Error("칸이 없습니다");
  const r = row(await db(sb).from("grid_col").update(c).eq("id", colId).select("id"), "칸을 못 고침"); if (!r?.length) throw new Error("고쳐진 칸이 없습니다");
  if (cur.type === c.type && JSON.stringify(cur.options ?? null) === JSON.stringify(c.options ?? null)) return { moved: 0, unmoved: 0, unmovedRows: [] };
  // 종류(선택지)가 바뀌었다 — 이 칸의 값을 옮겨 담는다(한 곳 convertMany). 줄 이름은 못 옮긴 것을 알리려고
  const cells = row(await db(sb).from("grid_cell").select("row_id,value,grid_row(label,schools(name),students(name))").eq("col_id", colId), "값을 못 읽음") ?? [];
  const plan = convertMany(cur, c, cells.map((x) => ({ row_id: x.row_id, value: x.value, title: rowTitle({ school: x.grid_row?.schools?.name ?? null, student: x.grid_row?.students?.name ?? null, label: x.grid_row?.label ?? null }) })), await refsFor(sb, cur, cells));
  for (const u of plan.updates) row(await db(sb).from("grid_cell").update({ value: u.value }).eq("row_id", u.row_id).eq("col_id", colId).select("row_id"), "값을 못 옮김");
  return { moved: plan.moved, unmoved: plan.unmoved.length, unmovedRows: plan.unmoved };
}
/** 고르기 칸의 값이 가리키는 이름(교재 · 회차 · 단원) — 글로 옮길 때만 읽는다 */
async function refsFor(sb, col, cells = []) {
  if (col.type !== "pick") return {};
  const ids = [...new Set(cells.map((x) => x.value?.id).filter(Boolean))]; if (!ids.length) return {};
  const of = col.options?.of ?? "book";
  if (of === "book") return { books: row(await db(sb).from("books").select("id,name").in("id", ids), "교재를 못 읽음") ?? [] };
  if (of === "exam") return { exams: (row(await db(sb).from("exams").select("id,name,schools(name)").in("id", ids), "회차를 못 읽음") ?? []).map((e) => ({ id: e.id, name: e.name, school: e.schools?.name ?? null })) };
  return { units: (row(await db(sb).from("units").select("id,chapter,mid,sub").in("id", ids), "단원을 못 읽음") ?? []).map((u) => ({ id: u.id, chapter: u.chapter, short: [u.mid, u.sub].filter(Boolean).join(" ") })) };
}
export async function moveCol(sb, gridId, colId, dir) {
  const order = moveIn(await colsOf(sb, gridId), colId, dir); if (!order) return { moved: false };
  for (const o of order) row(await db(sb).from("grid_col").update({ sort: o.sort }).eq("id", o.id).select("id"), "칸 차례를 못 바꿈");
  return { moved: true };
}
export async function retireCol(sb, colId) { const r = row(await db(sb).from("grid_col").update({ state: "retired" }).eq("id", colId).eq("state", "active").select("id"), "칸을 못 내림"); if (!r?.length) throw new Error("이미 내린 칸입니다"); }
export async function setBoardCol(sb, gridId, colId) {
  if (colId) { const c = row(await db(sb).from("grid_col").select("id,type,grid_id").eq("id", colId).single(), "칸을 못 읽음"); if (!c || c.grid_id !== gridId || c.type !== "select") throw new Error("보드 축은 이 표의 「선택」 칸이어야 합니다"); }
  row(await db(sb).from("grid").update({ board_col: colId || null }).eq("id", gridId).select("id"), "보드 축을 못 바꿈");
}
/** 줄 — 학교 · 학생 · 자유 이름. 같은 학교가 두 줄일 수 있다(학년마다) · 같은 학생은 한 줄 */
async function rowsOf(sb, gridId) { return row(await db(sb).from("grid_row").select("id,sort,state,student_id").eq("grid_id", gridId), "줄을 못 읽음") ?? []; }
export async function addRow(sb, gridId, { schoolId = null, studentId = null, label = null }) {
  const g = row(await db(sb).from("grid").select("id,rows").eq("id", gridId).single(), "표를 못 읽음"); if (!g) throw new Error("표가 없습니다");
  const have = await rowsOf(sb, gridId);
  const ins = { grid_id: gridId, sort: Math.max(0, ...alive(have).map((x) => x.sort)) + 10 };
  if (g.rows === "school") { if (!schoolId) throw new Error("학교를 고르세요"); ins.school_id = schoolId; }
  else if (g.rows === "student") { if (!studentId) throw new Error("아이를 고르세요"); if (alive(have).some((r) => r.student_id === studentId)) throw new Error("이미 있는 아이입니다"); ins.student_id = studentId; }
  else { const l = String(label ?? "").trim(); if (!l) throw new Error("줄 이름을 적으세요"); ins.label = l; }
  const r = row(await db(sb).from("grid_row").insert(ins).select("id").single(), "줄을 못 더함"); return r.id;
}
export async function moveRow(sb, gridId, rowId, dir) {
  const order = moveIn(await rowsOf(sb, gridId), rowId, dir); if (!order) return { moved: false };
  for (const o of order) row(await db(sb).from("grid_row").update({ sort: o.sort }).eq("id", o.id).select("id"), "줄 차례를 못 바꿈");
  return { moved: true };
}
export async function retireRow(sb, rowId) { const r = row(await db(sb).from("grid_row").update({ state: "retired" }).eq("id", rowId).eq("state", "active").select("id"), "줄을 못 내림"); if (!r?.length) throw new Error("이미 내린 줄입니다"); }
/** 셀 — 손 떼면 저장. 값은 칸 종류대로 읽는다(한 곳 parseCell) · 비면 null */
export const STALE = "다른 사람이 먼저 고쳤습니다 — 새로고침 뒤 다시 적어 주세요";   // 0-3 읽은 줄이 그대로일 때만 저장
export async function setCell(sb, rowId, colId, raw, seenAt = null) {
  const col = row(await db(sb).from("grid_col").select("id,type,options,state").eq("id", colId).single(), "칸을 못 읽음"); if (!col) throw new Error("칸이 없습니다");
  const value = parseCell(col, raw);
  if (seenAt) {   // 읽어 둔 고친 때가 그대로일 때만 덮는다(0-3) — 다르면 덮지 않고 알린다
    const { error, count } = await db(sb).from("grid_cell").update({ value }, { count: "exact" }).eq("row_id", rowId).eq("col_id", colId).eq("updated_at", seenAt);
    if (error) throw new Error(`값을 못 적음: ${error.message}`);
    if (!count) { const cur = row(await db(sb).from("grid_cell").select("row_id").eq("row_id", rowId).eq("col_id", colId).maybeSingle(), "값을 못 읽음"); if (cur) throw new Error(STALE); }
    if (count) return { value };
  }
  row(await db(sb).from("grid_cell").upsert({ row_id: rowId, col_id: colId, value }, { onConflict: "row_id,col_id" }).select("row_id"), "값을 못 적음");
  return { value };
}
/** 따로 챙길 아이 — 메모 하나(비면 지운 것 = 띠에서 빠진다 · 줄은 남는다) */
/** 단원 전부(살아 있는 교재의 살아 있는 단원 — id·교재·대단원·짧은 이름) — 06c 「앱에서 고르기 → 단원」 칸이 있는 표를 열 때 한 번((가)-⑤ · 교재마다 따로 읽던 두 단을 한 번에) */
export async function allUnits(sb) {
  return row(await db(sb).from("units").select("id,book_id,chapter,short,label,sort,books!inner(id)").eq("state", "active").eq("books.state", "active").order("book_id").order("sort"), "단원을 못 읽음") ?? [];
}
export async function setWatch(sb, studentId, note) {
  const n = String(note ?? "").trim() || null;
  row(await db(sb).from("student_watch").upsert({ student_id: studentId, note: n }, { onConflict: "student_id" }).select("student_id"), "메모를 못 적음");
  return { note: n };
}
