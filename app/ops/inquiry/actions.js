"use server";
/** 신규 상담 18 의 손 — 학원 사람만(권한 ops.inquiry 는 화면이 가린다). 판단·쓰기는 lib/inquiry.js 한 벌(+ 문의 · 고치기 · 안내 보냄 · 단계 · 등록 전환 일곱) */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { inquiryBoard, addInquiry, setInquiry, answerInquiry, setStage, convertInquiry, stageMany, answerMany } from "@/lib/inquiry";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "신규 상담 18");   // 손 한 벌은 lib/act.js · 삼키지 않고 서버 기록에 까닭을 남긴다(원칙-1)
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addInquiry(sb, f ?? {}) }; }); }
export async function setAct(id, f, seenAt = null) { return wrap(async () => { const { sb } = await staff(); return setInquiry(sb, id, f ?? {}, seenAt); }); }   // seenAt: 읽어 둔 고친 때(0-3)
export async function answerAct(id) { return wrap(async () => { const { sb } = await staff(); return answerInquiry(sb, id); }); }   // (커) { sms } — 문자 결과(없으면 null)
export async function stageAct(id, stage, why = null) { return wrap(async () => { const { sb } = await staff(); await setStage(sb, id, stage, why); return {}; }); }
export async function convertAct(id, f) { return wrap(async () => { const { sb, user } = await staff(); const date = await today(sb); const b = await inquiryBoard(sb, date); return convertInquiry(sb, id, f ?? {}, { date, by: user.id, schools: b.schools ?? [] }); }); }
export async function stageManyAct(ids, stage) { return wrap(async () => { const { sb } = await staff(); return stageMany(sb, ids, stage); }); }   // (어28)-④ 고른 문의 한 번에(단계)
export async function answerManyAct(ids) { return wrap(async () => { const { sb } = await staff(); return answerMany(sb, ids); }); }   // 고른 문의에 📨 안내 한 번에
