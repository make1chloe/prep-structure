"use server";
/** 월간 리포트 손 — 학원 사람만. 판단·쓰기는 lib/report.js 한 벌 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { serviceClient } from "@/lib/supabase";
import { saveBody, sendMonthly } from "@/lib/report";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function bodyAct(studentId, ym, body) { return wrap(async () => { const { sb } = await staff(); return saveBody(sb, String(studentId), String(ym), body); }); }
export async function sendAct(ym, studentIds) { return wrap(async () => { const { sb } = await staff(); return sendMonthly(serviceClient(), sb, String(ym), studentIds); }); }
