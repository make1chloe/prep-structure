"use server";
/** 내신 자료 04 의 손 — 학원 사람만. 판단·쓰기는 lib/todo.js 한 벌(+ 자료 · ♻️ 가져오기 · 학교 진도 · 배부 · 빼기 · 할 일 끝냄). 지우는 손이 없다(대전제-6) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { prepBoard, addMaterial, reuseMaterial, setSchoolProg, handOut, dropMaterial, finishTodo, setSchoolBook, setItemUnit } from "@/lib/todo";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function addMaterialAct(examId, f) { return wrap(async () => { const { sb } = await staff(); const b = await prepBoard(sb, examId, await today(sb)); return addMaterial(sb, { examId, typeId: f?.typeId, title: f?.title, items: f?.items, studentIds: f?.studentIds ?? [], takers: b.takers ?? [], types: b.types ?? [] }); }); }
export async function reuseAct(examId, fromId, studentIds = [], revised = false) { return wrap(async () => { const { sb } = await staff(); const b = await prepBoard(sb, examId, await today(sb)); return reuseMaterial(sb, { examId, fromId, studentIds, takers: b.takers ?? [], types: b.types ?? [], revised: Boolean(revised) }); }); }
export async function schoolProgAct(examId, studentId, text) { return wrap(async () => { const { sb } = await staff(); return setSchoolProg(sb, examId, studentId, text); }); }
export async function handAct(materialId, studentIds = null) { return wrap(async () => { const { sb } = await staff(); return handOut(sb, materialId, studentIds); }); }
export async function dropMaterialAct(materialId, why = null) { return wrap(async () => { const { sb } = await staff(); await dropMaterial(sb, materialId, why); return {}; }); }
export async function schoolBookAct(f) { return wrap(async () => { const { sb } = await staff(); return setSchoolBook(sb, f ?? {}); }); }   // 처음-8 학교 × 학년 × 연도의 교과서
export async function itemUnitAct(itemId, unitId) { return wrap(async () => { const { sb } = await staff(); await setItemUnit(sb, itemId, unitId || null); return {}; }); }   // 항목을 단원으로(4단계-5)
export async function todoDoneAct(todoId) { return wrap(async () => { const { sb } = await staff(); return finishTodo(sb, todoId); }); }
