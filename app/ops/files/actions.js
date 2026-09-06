"use server";
/** 자료함 20 의 손 — 학원 사람만. 갈래 고르기 · 숙제에 붙이기는 lib/files 한 벌. 올리기는 /api/files 한 길(파일은 서버 액션으로 안 보낸다) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { sortFile, attachFile } from "@/lib/files";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function sortAct(fileId, kind) { return wrap(async () => { const { sb } = await staff(); return { bin: await sortFile(sb, String(fileId), String(kind)) }; }); }
export async function attachAct(fileId, itemId) { return wrap(async () => { const { sb } = await staff(); await attachFile(sb, String(fileId), String(itemId)); return {}; }); }
