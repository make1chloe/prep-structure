"use server";
/** 반 손 — 학원 사람만. 판단·쓰기는 lib/classes.js 한 벌. 지우는 손이 없다(닫는다 · 대전제-6) */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { addClass, setSchedule, setClassName, closeClass, addMember, removeMember, setClassFee } from "@/lib/classes";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "반 02c");   // 손 한 벌은 lib/act.js — 삼키지 않고 서버 자취에 까닭을 남긴다(원칙-1)
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return addClass(sb, f); }); }
export async function scheduleAct(classId, f) { return wrap(async () => { const { sb } = await staff(); return setSchedule(sb, String(classId), f); }); }
export async function nameAct(classId, nickname, kind) { return wrap(async () => { const { sb } = await staff(); await setClassName(sb, String(classId), nickname, kind); return {}; }); }
export async function closeAct(classId, on) { return wrap(async () => { const { sb } = await staff(); await closeClass(sb, String(classId), on); return {}; }); }
export async function memberAct(classId, studentId, fromDate) { return wrap(async () => { const { sb } = await staff(); await addMember(sb, String(classId), String(studentId), fromDate); return {}; }); }
export async function removeAct(classId, studentId, on) { return wrap(async () => { const { sb } = await staff(); await removeMember(sb, String(classId), String(studentId), on); return {}; }); }
export async function feeAct(classId, f) { return wrap(async () => { const { sb } = await staff(); return setClassFee(sb, String(classId), f); }); }
