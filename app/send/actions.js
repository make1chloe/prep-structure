"use server";
/** 발송 손 — 학원 사람만. 판단·쓰기는 lib/send.js 한 벌. 되돌릴 수 없는 것이라 서버 답을 기다린다(속도-5) */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { sendNow, schedule, cancelScheduled, resend, saveTemplate, setSmsKinds, editDaily } from "@/lib/send";
import { setReason, sendLate } from "@/lib/late";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "발송 10");   // 손 한 벌은 lib/act.js — 삼키지 않고 서버 자취에 까닭을 남긴다(원칙-1)
export async function sendSelected(ids) { return wrap(async () => { const { sb } = await staff(); return { r: await sendNow(sb, ids) }; }); }
export async function scheduleSelected(ids, choice, custom) { return wrap(async () => { const { sb, user } = await staff(); return schedule(sb, ids, choice, custom, user.id, await today(sb)); }); }
export async function cancelSchedule(id) { return wrap(async () => { const { sb } = await staff(); await cancelScheduled(sb, id); return {}; }); }
export async function resendLog(id) { return wrap(async () => { const { sb } = await staff(); return { r: await resend(sb, id) }; }); }
export async function saveTemplateAct(kind, body) { return wrap(async () => { const { sb } = await staff(); return saveTemplate(sb, kind, body); }); }   // (커) ✉️ 문자 문구 고치기
/** (어39) 줄을 펼쳐 그 자리에서 · 나갈 글 고치기 · 늦은 귀가 안내 보내기(사유가 비었으면 적어서). 다른 화면으로 안 보낸다(대전제-22) */
export async function saveDailyAct(sheetId, comment) { return wrap(async () => { const { sb } = await staff(); await editDaily(sb, String(sheetId), String(comment ?? "")); return {}; }); }
export async function lateSendAct(sheetId, reason) { return wrap(async () => { const { sb } = await staff(); if (String(reason ?? "").trim()) await setReason(sb, String(sheetId), String(reason).trim()); await sendLate(sb, String(sheetId)); return {}; }); }
/** (뎌-2) 문자로도 보낼 갈래 켜고 끄기 — 판단·쓰기는 lib/send.js 한 벌 */
export async function smsKindsAct(kinds) { return wrap(async () => { const { sb } = await staff(); return setSmsKinds(sb, kinds ?? []); }); }   // (뎌-2) 앱 알림과 함께 문자로도 — 화면은 router.refresh() 로 다시 읽는다(다른 손들과 같은 꼴)
