"use server";
/** 학생 14 의 손 — 학원 사람만. 판단·쓰기는 lib/student.js 한 벌(+ 학생 · 고치기 · 퇴원·복귀 · 반 · 금액 · 상담 · 형제 · 계정 발급 · 비밀번호 초기화). 계정은 서버 자신(service role)이 auth 에 만든다 */
import { guard } from "@/lib/session";
import { attachConsult } from "@/lib/files";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { serviceClient } from "@/lib/supabase";
import { addStudent, setStudent, setState, setClass, setFee, addConsult, linkSibling, issueStudentAccount, issueParentAccount, resetPassword, setParentName } from "@/lib/student";
import { setStudentShow } from "@/lib/score";
import { setStudentEdit, confirmMark, revertMark, confirmAllMarks, resolveFlag } from "@/lib/progress";   // (허) 진도 체크 — 설정 진도 체크와 같은 손(원칙-1)
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addStudent(sb, f ?? {}, await today(sb)) }; }); }
export async function setAct(id, f, seenAt = null) { return wrap(async () => { const { sb } = await staff(); await setStudent(sb, id, f ?? {}, seenAt); return {}; }); }   // seenAt: 읽어 둔 고친 때(0-3)
export async function stateAct(id, state, on = null) { return wrap(async () => { const { sb } = await staff(); await setState(sb, id, state, on); return {}; }); }
export async function classAct(id, classId, fromDate) { return wrap(async () => { const { sb } = await staff(); return setClass(sb, id, classId, fromDate); }); }
export async function feeAct(id, amount, fromDate) { return wrap(async () => { const { sb } = await staff(); return setFee(sb, id, amount, fromDate); }); }
export async function consultAttachAct(fileId, consultId) { return wrap(async () => { const { sb } = await staff(); await attachConsult(sb, String(fileId), String(consultId)); return {}; }); }   // 상담에 붙이기(4단계-6)
export async function consultAct(id, f) { return wrap(async () => { const { sb, user } = await staff(); return { id: await addConsult(sb, { studentId: id, at: f?.at || null, way: f?.way, body: f?.body }, user.id) }; }); }
export async function siblingAct(id, otherId) { return wrap(async () => { const { sb } = await staff(); return linkSibling(sb, id, otherId); }); }
export async function showAct(id, show) { return wrap(async () => { const { sb } = await staff(); await setStudentShow(sb, id, show); return {}; }); }
export async function studentAccountAct(id, loginId) { return wrap(async () => { const { sb } = await staff(); return issueStudentAccount(serviceClient(), sb, id, loginId); }); }
export async function parentAccountAct(id, phone, rel = null) { return wrap(async () => { const { sb } = await staff(); return issueParentAccount(serviceClient(), sb, id, phone, rel); }); }
export async function parentNameAct(id, profileId, name) { return wrap(async () => { const { sb } = await staff(); return setParentName(sb, id, profileId, name); }); }   // 학부모 계정 이름((가)-⑩)
export async function resetAct(profileId) { return wrap(async () => { const { sb } = await staff(); return resetPassword(serviceClient(), sb, profileId); }); }
/** (허) 그 아이의 진도 체크 — 열림 모드 · 아이가 찍은 줄 확인·되돌리기·한 번에 · ❗ 처분. 판단·쓰기는 lib/progress.js 한 벌 */
export async function editModeAct(studentId, mode) { return wrap(async () => { const { sb } = await staff(); await setStudentEdit(sb, studentId, mode); return {}; }); }
export async function confirmMarkAct(studentId, unitId, round) { return wrap(async () => { const { sb } = await staff(); await confirmMark(sb, { studentId, unitId, round }); return {}; }); }
export async function revertMarkAct(studentId, unitId, round) { return wrap(async () => { const { sb } = await staff(); await revertMark(sb, { studentId, unitId, round, date: await today(sb) }); return {}; }); }
export async function confirmAllAct(studentId) { return wrap(async () => { const { sb } = await staff(); return confirmAllMarks(sb, studentId); }); }
export async function flagAct(flagId, status = null) { return wrap(async () => { const { sb, user } = await staff(); return resolveFlag(sb, flagId, { status, date: await today(sb), by: user.id }); }); }
