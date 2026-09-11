"use server";
/** 📢 공지의 손 — 학원 사람만. 판단·쓰기는 lib/notice.js 한 벌(만들기 · 고치기(보내기 전) · 📎 붙이기(보내기 전) · 보내기). 지우는 손이 없다(대전제-6) */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { serviceClient } from "@/lib/supabase";
import { addNotice, setNotice, attachNotice, sendNotice } from "@/lib/notice";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "공지");   // 손 한 벌은 lib/act.js — 삼키지 않고 서버 자취에 까닭을 남긴다(원칙-1)
export async function addAct(f) { return wrap(async () => { const { sb, me } = await staff(); return { id: await addNotice(sb, f ?? {}, me.id) }; }); }
export async function setAct(id, f) { return wrap(async () => { const { sb } = await staff(); await setNotice(sb, id, f ?? {}); return {}; }); }
export async function attachAct(fileId, noticeId) { return wrap(async () => { const { sb } = await staff(); await attachNotice(sb, String(fileId), String(noticeId)); return {}; }); }
export async function sendAct(noticeId) { return wrap(async () => { const { sb } = await staff(); return sendNotice(serviceClient(), sb, String(noticeId), await today(sb)); }); }
