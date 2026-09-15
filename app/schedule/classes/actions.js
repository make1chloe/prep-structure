"use server";
/** 반 손 — 학원 사람만. 판단·쓰기는 lib/classes.js 한 벌. 지우는 손이 없다(닫는다 · 대전제-6) */
import { staff } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { addClass, setSchedule, setClassName, closeClass, closeClassMany, addMember, removeMember, removeMemberMany, setClassFee } from "@/lib/classes";
const wrap = (fn) => act(fn, "반 02c");   // 손 한 벌은 lib/act.js · 삼키지 않고 서버 기록에 까닭을 남긴다(원칙-1)
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return addClass(sb, f); }); }
export async function scheduleAct(classId, f) { return wrap(async () => { const { sb } = await staff(); return setSchedule(sb, String(classId), f); }); }
export async function nameAct(classId, nickname, kind) { return wrap(async () => { const { sb } = await staff(); await setClassName(sb, String(classId), nickname, kind); return {}; }); }
export async function closeAct(classId, on) { return wrap(async () => { const { sb } = await staff(); await closeClass(sb, String(classId), on); return {}; }); }
export async function memberAct(classId, studentId, fromDate) { return wrap(async () => { const { sb } = await staff(); await addMember(sb, String(classId), String(studentId), fromDate); return {}; }); }
export async function removeAct(classId, studentId, on) { return wrap(async () => { const { sb } = await staff(); await removeMember(sb, String(classId), String(studentId), on); return {}; }); }
export async function feeAct(classId, f) { return wrap(async () => { const { sb } = await staff(); return setClassFee(sb, String(classId), f); }); }
export async function closeManyAct(ids, on) { return wrap(async () => { const { sb } = await staff(); return closeClassMany(sb, ids, on); }); }   // (어28)-④ 고른 반 한 번에
export async function removeManyAct(pairs, on) { return wrap(async () => { const { sb } = await staff(); return removeMemberMany(sb, pairs, on); }); }   // 고른 명단 아이 한 번에(반:아이 짝)
