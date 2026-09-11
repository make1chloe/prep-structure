"use server";
/** 월간 리포트 손 — 학원 사람만. 판단·쓰기는 lib/report.js 한 벌 */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { serviceClient } from "@/lib/supabase";
import { saveBody, sendMonthly } from "@/lib/report";
import { scheduleFor } from "@/lib/send";
import { today } from "@/lib/day";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "월간 리포트");   // 손 한 벌은 lib/act.js — 삼키지 않고 서버 자취에 까닭을 남긴다(원칙-1)
export async function bodyAct(studentId, ym, body) { return wrap(async () => { const { sb } = await staff(); return saveBody(sb, String(studentId), String(ym), body); }); }
export async function sendAct(ym, studentIds) { return wrap(async () => { const { sb } = await staff(); return sendMonthly(serviceClient(), sb, String(ym), studentIds); }); }
export async function scheduleAct(ym, studentIds, choice, custom) { return wrap(async () => { const { sb, user } = await staff(); return scheduleFor(sb, "monthly", String(ym), studentIds, choice, custom, user.id, await today(sb)); }); }   // (어) ⏰ 예약
