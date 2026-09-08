"use server";
/** 루틴 손 — 학원 사람만. 판단·쓰기는 lib/routine.js 한 벌. 🗑 는 retired(확정-㊷) — 지우는 손이 없다 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { addItem, editItem, retireItem, setLine, moveLine, customizeStudent, resetStudent, reviveStudentLine, setBook, assignBook, customizeBook, resetBook, endBook } from "@/lib/routine";
import { parseChecks } from "@/lib/routine-plan";
import { setQuizPos } from "@/lib/quiz";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function addItemAct(f) { return wrap(async () => { const { sb } = await staff(); return addItem(sb, { area: f.area, name: f.name, method: f.method, checks: parseChecks(f.checks), place: f.place, required: Boolean(f.required) }); }); }
export async function editItemAct(id, f) { return wrap(async () => { const { sb } = await staff(); await editItem(sb, id, { name: f.name, method: f.method, checks: parseChecks(f.checks) }); return {}; }); }
export async function retireItemAct(id) { return wrap(async () => { const { sb } = await staff(); return retireItem(sb, id); }); }   // 항목 자체 내리기((가)-⑨)
export async function setLineAct(kind, id, patch) { return wrap(async () => { const { sb } = await staff(); await setLine(sb, kind, id, patch); return {}; }); }
export async function moveLineAct(kind, id, dir) { return wrap(async () => { const { sb } = await staff(); return { moved: await moveLine(sb, kind, id, dir) }; }); }
export async function customizeAct(studentId, area) { return wrap(async () => { const { sb } = await staff(); return { n: await customizeStudent(sb, studentId, area) }; }); }
export async function resetAct(studentId, area) { return wrap(async () => { const { sb } = await staff(); return { n: await resetStudent(sb, studentId, area) }; }); }
export async function reviveAct(studentId, area, itemId) { return wrap(async () => { const { sb } = await staff(); await reviveStudentLine(sb, studentId, area, itemId); return {}; }); }
export async function setBookAct(id, patch) { return wrap(async () => { const { sb } = await staff(); await setBook(sb, id, patch); return {}; }); }
export async function assignBookAct(studentId, bookId, date = null) { return wrap(async () => { const { sb } = await staff(); return { id: await assignBook(sb, studentId, bookId, date || await today(sb)) }; }); }   // 시작일을 고른다(비면 오늘)
export async function bookCustomizeAct(studentId, bookId) { return wrap(async () => { const { sb } = await staff(); return { n: await customizeBook(sb, studentId, bookId) }; }); }
export async function bookResetAct(studentId, bookId) { return wrap(async () => { const { sb } = await staff(); return { n: await resetBook(sb, studentId, bookId) }; }); }
export async function bookReviveAct(studentId, area, itemId, bookId) { return wrap(async () => { const { sb } = await staff(); await reviveStudentLine(sb, studentId, area, itemId, bookId); return {}; }); }
export async function quizPosAct(studentId, at) { return wrap(async () => { const { sb } = await staff(); return setQuizPos(sb, studentId, at); }); }   // 🔤 시험 카드 자리(0143) — 아이 머리 세그
export async function endBookAct(studentBookId) { return wrap(async () => { const { sb } = await staff(); return endBook(sb, studentBookId, await today(sb)); }); }
