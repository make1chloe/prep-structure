"use server";
/** (처) 남기실 말 답 — 학원 사람만. 판단·쓰기는 lib/request.js answerRequest 한 벌 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { answerRequest } from "@/lib/request";
export async function answerAct(id, text) { try { const { sb, me } = await guard(); if (!isStaff(me?.role)) throw new Error("학원 사람만 씁니다"); return { ok: true, ...(await answerRequest(sb, id, text)) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
