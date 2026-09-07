"use server";
/** 교재 손 — 학원 사람만. 판단·쓰기는 lib/book.js 한 벌(+ 교재 · 고치기 · 다른 이름 · 문법 분류 · 엑셀 미리보기·저장). 지우는 손이 없다(대전제-6) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { addBook, setBook, addAlias, setUnitTopics, addTopic, previewUpload, applyUpload, setUnit, setUnitState } from "@/lib/book";
import * as XLSX from "xlsx";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function addBookAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addBook(sb, { name: f?.name, area: f?.area || null, code: f?.code || null, chunkDepth: f?.chunkDepth || "sub", orderBasis: f?.orderBasis || "sub" }) }; }); }
export async function setBookAct(id, patch) { return wrap(async () => { const { sb } = await staff(); await setBook(sb, id, patch); return {}; }); }
export async function aliasAct(id, alias) { return wrap(async () => { const { sb } = await staff(); return { added: await addAlias(sb, id, alias) }; }); }
export async function topicsAct(unitId, ids) { return wrap(async () => { const { sb } = await staff(); return { n: await setUnitTopics(sb, unitId, ids) }; }); }
export async function unitAct(unitId, f) { return wrap(async () => { const { sb } = await staff(); await setUnit(sb, String(unitId), f); return {}; }); }
export async function unitStateAct(unitId, state) { return wrap(async () => { const { sb } = await staff(); await setUnitState(sb, String(unitId), String(state)); return {}; }); }
export async function addTopicAct(name) { return wrap(async () => { const { sb } = await staff(); return { id: await addTopic(sb, name) }; }); }
export async function previewAct(formData, modes = {}) {
  return wrap(async () => {
    const { sb } = await staff(); const f = formData?.get?.("file"); if (!f || typeof f.arrayBuffer !== "function") throw new Error("엑셀 파일을 고르세요");
    const wb = XLSX.read(Buffer.from(await f.arrayBuffer()), { type: "buffer" }); const ws = wb.Sheets[wb.SheetNames[0]]; if (!ws) throw new Error("시트가 없습니다");
    return { name: f.name ?? "", ...(await previewUpload(sb, XLSX.utils.sheet_to_json(ws, { defval: "" }), await today(sb), modes)) };
  });
}
export async function applyAct(rows, decisions) { return wrap(async () => { const { sb } = await staff(); return applyUpload(sb, rows, await today(sb), decisions ?? {}); }); }
