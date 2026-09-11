"use server";
/** 진도 체크 열기(원장 쪽)의 손 — 학원 사람만. 판단·쓰기는 lib/progress.js 한 벌(학원 켬/끔 · 아이마다 · 확인 · 되돌리기 · 한 번에 · ❗ 처분) */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { setAcademyEdit, setStudentEdit, confirmMark, revertMark, confirmAllMarks, resolveFlag } from "@/lib/progress";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "진도 설정");   // 손 한 벌은 lib/act.js — 삼키지 않고 서버 자취에 까닭을 남긴다(원칙-1)
export async function academyAct(open) { return wrap(async () => { const { sb, user } = await staff(); await setAcademyEdit(sb, Boolean(open), await today(sb), user.id); return {}; }); }
export async function studentEditAct(studentId, mode) { return wrap(async () => { const { sb } = await staff(); await setStudentEdit(sb, studentId, mode); return {}; }); }
export async function confirmAct(studentId, unitId, round) { return wrap(async () => { const { sb } = await staff(); await confirmMark(sb, { studentId, unitId, round }); return {}; }); }
export async function revertAct(studentId, unitId, round) { return wrap(async () => { const { sb } = await staff(); await revertMark(sb, { studentId, unitId, round, date: await today(sb) }); return {}; }); }
export async function confirmAllAct(studentId = null) { return wrap(async () => { const { sb } = await staff(); return confirmAllMarks(sb, studentId); }); }
export async function flagAct(flagId, status = null) { return wrap(async () => { const { sb, user } = await staff(); return resolveFlag(sb, flagId, { status, date: await today(sb), by: user.id }); }); }
