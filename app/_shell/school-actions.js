"use server";
/** 학교 손 한 벌 · 06c 줄 더하기 · 14 학생 · 12b 가져오기 · 06b 학교 카드가 같은 것을 부른다(원칙-1). 쓰기는 lib/schools.js */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { addSchool, setSchool, closeSchool, closeSchoolMany, reviveSchool } from "@/lib/schools";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "학교");
export async function schoolAddAct(f) { return wrap(async () => { const { sb } = await staff(); return addSchool(sb, f ?? {}); }); }
export async function schoolSetAct(id, f) { return wrap(async () => { const { sb } = await staff(); await setSchool(sb, id, f ?? {}); return {}; }); }
export async function schoolCloseAct(id) { return wrap(async () => { const { sb } = await staff(); await closeSchool(sb, id); return {}; }); }
export async function schoolReviveAct(id) { return wrap(async () => { const { sb } = await staff(); await reviveSchool(sb, id); return {}; }); }
export async function schoolCloseManyAct(ids) { return wrap(async () => { const { sb } = await staff(); return closeSchoolMany(sb, ids); }); }   // (어28)-④ 고른 학교 한 번에
