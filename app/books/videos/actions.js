"use server";
/** 영상 19 의 손 — 학원 사람만. + 영상 · 고치기·내리기 · 배정 · 마감 미루기 · 배정 내리기 · 📨 재촉(알림 길은 lib/notify 하나 — 서버 자신이 든다) */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { serviceClient } from "@/lib/supabase";
import { addVideo, setVideo, assignVideo, postponeVideo, retireAssign, remindVideo } from "@/lib/video";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "영상 19");   // 손 한 벌은 lib/act.js — 삼키지 않고 서버 자취에 까닭을 남긴다(원칙-1)
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addVideo(sb, f ?? {}) }; }); }
export async function setAct(id, patch) { return wrap(async () => { const { sb } = await staff(); await setVideo(sb, String(id), patch ?? {}); return {}; }); }
export async function assignAct(id, f) { return wrap(async () => { const { sb } = await staff(); return assignVideo(sb, String(id), f ?? {}); }); }
export async function postponeAct(id, dueOn) { return wrap(async () => { const { sb } = await staff(); return postponeVideo(sb, String(id), String(dueOn ?? "")); }); }
export async function retireAct(assignId) { return wrap(async () => { const { sb } = await staff(); await retireAssign(sb, String(assignId)); return {}; }); }
export async function remindAct(id) { return wrap(async () => { const { sb } = await staff(); return remindVideo(serviceClient(), sb, String(id), await today(sb)); }); }
