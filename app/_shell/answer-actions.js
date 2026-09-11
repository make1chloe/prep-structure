"use server";
/** (처) 남기실 말 답 — 학원 사람만. 판단·쓰기는 lib/request.js answerRequest 한 벌 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { answerRequest } from "@/lib/request";
import { wrap as act } from "@/lib/act";
const wrap = (fn) => act(fn, "남기실 말 답");   // 손 한 벌은 lib/act.js(원칙-1)
export async function answerAct(id, text) { return wrap(async () => { const { sb, me } = await guard(); if (!isStaff(me?.role)) throw new Error("학원 사람만 씁니다"); return { ...(await answerRequest(sb, id, text)) }; }); }
