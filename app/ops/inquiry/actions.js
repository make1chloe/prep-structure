"use server";
/** 신규 상담 18 의 손 — 학원 사람만(권한 ops.inquiry 는 화면이 가린다). 판단·쓰기는 lib/inquiry.js 한 벌(+ 문의 · 고치기 · 안내 보냄 · 단계 · 등록 전환 일곱) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { inquiryBoard, addInquiry, setInquiry, answerInquiry, setStage, convertInquiry } from "@/lib/inquiry";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addInquiry(sb, f ?? {}) }; }); }
export async function setAct(id, f, seenAt = null) { return wrap(async () => { const { sb } = await staff(); return setInquiry(sb, id, f ?? {}, seenAt); }); }   // seenAt: 읽어 둔 고친 때(0-3)
export async function answerAct(id) { return wrap(async () => { const { sb } = await staff(); return answerInquiry(sb, id); }); }   // (커) { sms } — 문자 결과(없으면 null)
export async function stageAct(id, stage, why = null) { return wrap(async () => { const { sb } = await staff(); await setStage(sb, id, stage, why); return {}; }); }
export async function convertAct(id, f) { return wrap(async () => { const { sb, user } = await staff(); const date = await today(sb); const b = await inquiryBoard(sb, date); return convertInquiry(sb, id, f ?? {}, { date, by: user.id, schools: b.schools ?? [] }); }); }
