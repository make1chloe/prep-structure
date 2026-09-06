"use server";
/** 내 할 일 05 의 손 — 학원 사람만. 판단·쓰기는 lib/todo.js 한 벌(끝냄 · 되돌리기 · 마감 · 빼기 · 단원평가 출제 · 메모 · 되풀이 · 한 번에 뽑기 · 자료 빼기). 지우는 손이 없다(대전제-6) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { finishTodo, undoTodo, setTodoDue, dropTodo, addUnitTest, unitTestMade, addNote, addRepeat, setRepeatActive, printAll, dropMaterial } from "@/lib/todo";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function doneAct(todoId) { return wrap(async () => { const { sb } = await staff(); return finishTodo(sb, todoId); }); }
export async function undoAct(todoId) { return wrap(async () => { const { sb } = await staff(); return undoTodo(sb, todoId); }); }
export async function dueAct(todoId, dueOn) { return wrap(async () => { const { sb } = await staff(); await setTodoDue(sb, todoId, dueOn); return {}; }); }
export async function dropAct(todoId, why = null) { return wrap(async () => { const { sb } = await staff(); await dropTodo(sb, todoId, why); return {}; }); }
export async function unitTestAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addUnitTest(sb, { studentId: f?.studentId, topicId: f?.topicId, qCount: f?.qCount ?? 25 }) }; }); }
export async function unitTestMadeAct(id) { return wrap(async () => { const { sb } = await staff(); await unitTestMade(sb, id, await today(sb)); return {}; }); }
export async function noteAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addNote(sb, { title: f?.title, dueOn: f?.dueOn, dueTime: f?.dueTime || null, studentId: f?.studentId || null, note: f?.note || null }) }; }); }
export async function repeatAct(f) { return wrap(async () => { const { sb } = await staff(); return addRepeat(sb, { name: f?.name, every: f?.every, day: f?.day, weekday: f?.weekday, lead: f?.lead }, await today(sb)); }); }
export async function repeatActiveAct(id, active) { return wrap(async () => { const { sb } = await staff(); await setRepeatActive(sb, id, active); return {}; }); }
export async function printAllAct(materialIds) { return wrap(async () => { const { sb } = await staff(); return printAll(sb, materialIds); }); }
export async function dropMaterialAct(materialId, why = null) { return wrap(async () => { const { sb } = await staff(); await dropMaterial(sb, materialId, why); return {}; }); }
