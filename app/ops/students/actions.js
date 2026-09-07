"use server";
/** 학생 14 의 손 — 학원 사람만. 판단·쓰기는 lib/student.js 한 벌(+ 학생 · 고치기 · 퇴원·복귀 · 반 · 금액 · 상담 · 형제 · 계정 발급 · 비밀번호 초기화). 계정은 서버 자신(service role)이 auth 에 만든다 */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { serviceClient } from "@/lib/supabase";
import { addStudent, setStudent, setState, setClass, setFee, addConsult, linkSibling, issueStudentAccount, issueParentAccount, resetPassword } from "@/lib/student";
import { setStudentShow } from "@/lib/score";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function addAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addStudent(sb, f ?? {}, await today(sb)) }; }); }
export async function setAct(id, f, seenAt = null) { return wrap(async () => { const { sb } = await staff(); await setStudent(sb, id, f ?? {}, seenAt); return {}; }); }   // seenAt: 읽어 둔 고친 때(0-3)
export async function stateAct(id, state, on = null) { return wrap(async () => { const { sb } = await staff(); await setState(sb, id, state, on); return {}; }); }
export async function classAct(id, classId, fromDate) { return wrap(async () => { const { sb } = await staff(); return setClass(sb, id, classId, fromDate); }); }
export async function feeAct(id, amount, fromDate) { return wrap(async () => { const { sb } = await staff(); return setFee(sb, id, amount, fromDate); }); }
export async function consultAct(id, f) { return wrap(async () => { const { sb, user } = await staff(); return { id: await addConsult(sb, { studentId: id, at: f?.at || null, way: f?.way, body: f?.body }, user.id) }; }); }
export async function siblingAct(id, otherId) { return wrap(async () => { const { sb } = await staff(); return linkSibling(sb, id, otherId); }); }
export async function showAct(id, show) { return wrap(async () => { const { sb } = await staff(); await setStudentShow(sb, id, show); return {}; }); }
export async function studentAccountAct(id, loginId) { return wrap(async () => { const { sb } = await staff(); return issueStudentAccount(serviceClient(), sb, id, loginId); }); }
export async function parentAccountAct(id, phone, rel = null) { return wrap(async () => { const { sb } = await staff(); return issueParentAccount(serviceClient(), sb, id, phone, rel); }); }
export async function resetAct(profileId) { return wrap(async () => { const { sb } = await staff(); return resetPassword(serviceClient(), sb, profileId); }); }
