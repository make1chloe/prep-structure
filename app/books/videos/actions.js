"use server";
/** 영상 19 의 손 · 학원 사람만. + 영상 · 수정·삭제 · 배정 · 마감 미루기 · 배정 삭제 · 📨 알림(알림 길은 lib/notify 하나 · 서버 자신이 든다) */
import { staff } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { today } from "@/lib/day";
import { serviceClient } from "@/lib/supabase";
import { addVideo, setVideo, videoMany, assignVideo, postponeVideo, retireAssign, remindVideo, remindMany } from "@/lib/video";
const wrap = (fn) => act(fn, "영상 19");   // 손 한 벌은 lib/act.js · 삼키지 않고 서버 기록에 까닭을 남긴다(원칙-1)
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addVideo(sb, f ?? {}) }; }); }
export async function setAct(id, patch) { return wrap(async () => { const { sb } = await staff(); await setVideo(sb, String(id), patch ?? {}); return {}; }); }
export async function assignAct(id, f) { return wrap(async () => { const { sb } = await staff(); return assignVideo(sb, String(id), f ?? {}); }); }
export async function postponeAct(id, dueOn) { return wrap(async () => { const { sb } = await staff(); return postponeVideo(sb, String(id), String(dueOn ?? "")); }); }
export async function retireAct(assignId) { return wrap(async () => { const { sb } = await staff(); await retireAssign(sb, String(assignId)); return {}; }); }
export async function remindAct(id) { return wrap(async () => { const { sb } = await staff(); return remindVideo(serviceClient(), sb, String(id), await today(sb)); }); }
export async function setManyAct(ids, patch) { return wrap(async () => { const { sb } = await staff(); return videoMany(sb, ids, patch ?? {}); }); }   // (어28)-③ 고른 영상 폴더·삭제·복구 한 번에
export async function remindManyAct(ids) { return wrap(async () => { const { sb } = await staff(); return remindMany(serviceClient(), sb, ids, await today(sb)); }); }   // (어28)-③ 고른 영상 📨 알림 한 번에
