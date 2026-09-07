"use server";
/** 학교별 표 06c 의 손 — 학원 사람만. 판단·쓰기는 lib/grid.js 한 벌(+ 새 표 · 내리기·되살리기·이름 · 칸 · 줄 · 셀 · 보드 축 · 따로 챙길 아이). 지우는 손이 없다(대전제-6). 단원 목록은 lib/exam unitsOf(06b 와 같은 것) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { addGrid, retireGrid, reviveGrid, renameGrid, moveGrid, addCol, setCol, moveCol, retireCol, setBoardCol, addRow, moveRow, retireRow, setCell, setWatch } from "@/lib/grid";
import { unitsOf } from "@/lib/exam";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function gridAddAct(template, label = null) { return wrap(async () => { const { sb, user } = await staff(); return addGrid(sb, { template, label }, user.id); }); }
export async function gridRetireAct(id) { return wrap(async () => { const { sb } = await staff(); await retireGrid(sb, id); return {}; }); }
export async function gridReviveAct(id) { return wrap(async () => { const { sb } = await staff(); await reviveGrid(sb, id); return {}; }); }
export async function gridRenameAct(id, label) { return wrap(async () => { const { sb } = await staff(); await renameGrid(sb, id, label); return {}; }); }
export async function colAddAct(gridId, f) { return wrap(async () => { const { sb } = await staff(); return { id: await addCol(sb, gridId, f) }; }); }
export async function gridMoveAct(id, dir) { return wrap(async () => { const { sb } = await staff(); return moveGrid(sb, id, dir); }); }
export async function colSetAct(colId, f) { return wrap(async () => { const { sb } = await staff(); return setCol(sb, colId, f); }); }   // 종류를 바꾸면 옮겨 담은 셈(moved · unmoved · unmovedRows)이 온다
export async function colMoveAct(gridId, colId, dir) { return wrap(async () => { const { sb } = await staff(); return moveCol(sb, gridId, colId, dir); }); }
export async function colRetireAct(colId) { return wrap(async () => { const { sb } = await staff(); await retireCol(sb, colId); return {}; }); }
export async function boardColAct(gridId, colId) { return wrap(async () => { const { sb } = await staff(); await setBoardCol(sb, gridId, colId); return {}; }); }
export async function rowAddAct(gridId, f) { return wrap(async () => { const { sb } = await staff(); return { id: await addRow(sb, gridId, f ?? {}) }; }); }
export async function rowMoveAct(gridId, rowId, dir) { return wrap(async () => { const { sb } = await staff(); return moveRow(sb, gridId, rowId, dir); }); }
export async function rowRetireAct(rowId) { return wrap(async () => { const { sb } = await staff(); await retireRow(sb, rowId); return {}; }); }
export async function cellAct(rowId, colId, raw, seenAt = null) { return wrap(async () => { const { sb } = await staff(); return setCell(sb, rowId, colId, raw, seenAt); }); }   // seenAt: 읽어 둔 고친 때(0-3) — 다르면 덮지 않는다
export async function watchAct(studentId, note) { return wrap(async () => { const { sb } = await staff(); return setWatch(sb, studentId, note); }); }
export async function unitsAct(bookId) { return wrap(async () => { const { sb } = await staff(); return { units: await unitsOf(sb, bookId) }; }); }
