"use server";
/** 시험 회차 손 — 학원 사람만. 판단·쓰기는 lib/exam.js 한 벌(범위 · 안 봄 · 숨김 · 몇 주 전부터 · 지금 멈춤 · 풀기). 지우는 손이 없다(대전제-6) */
import { guard } from "@/lib/session";
import { wrap as act } from "@/lib/act";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { addScope, removeScope, setSkip, setSkipAll, setHidden, setStopWeeks, setStudentWeeks, stopNow, releaseStops, unitsOf, setChangeSeen } from "@/lib/exam";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const wrap = (fn) => act(fn, "시험 회차 06b");   // 손 한 벌은 lib/act.js — 삼키지 않고 서버 자취에 까닭을 남긴다(원칙-1)
export async function unitsAct(bookId) { return wrap(async () => { const { sb } = await staff(); return { units: await unitsOf(sb, bookId) }; }); }
export async function scopeAct(examId, f) { return wrap(async () => { const { sb } = await staff(); return addScope(sb, examId, { unitIds: f?.unitIds ?? [], freeNote: f?.freeNote ?? null, date: await today(sb) }); }); }
export async function removeScopeAct(ids) { return wrap(async () => { const { sb } = await staff(); return { n: await removeScope(sb, ids, await today(sb)) }; }); }
export async function skipAllAct(examId, studentIds) { return wrap(async () => { const { sb } = await staff(); return setSkipAll(sb, examId, studentIds, await today(sb)); }); }   // 이 학년 안 봄 한 번에((가)-⑨)
export async function skipAct(examId, studentId, skipped) { return wrap(async () => { const { sb } = await staff(); return setSkip(sb, examId, studentId, skipped, await today(sb)); }); }
export async function hiddenAct(examId, hidden) { return wrap(async () => { const { sb } = await staff(); return setHidden(sb, examId, hidden, await today(sb)); }); }
export async function stopWeeksAct(level, weeks) { return wrap(async () => { const { sb } = await staff(); return setStopWeeks(sb, level, weeks, await today(sb)); }); }
export async function studentWeeksAct(studentId, weeks) { return wrap(async () => { const { sb } = await staff(); return setStudentWeeks(sb, studentId, weeks, await today(sb)); }); }
export async function stopNowAct(examId) { return wrap(async () => { const { sb } = await staff(); return stopNow(sb, examId, await today(sb)); }); }
export async function releaseAct(examId) { return wrap(async () => { const { sb } = await staff(); return releaseStops(sb, examId); }); }
export async function changeSeenAct(examId) { return wrap(async () => { const { sb } = await staff(); return setChangeSeen(sb, examId); }); }   // (저) 「봤음」 — 나이스가 옮긴 기간을 봤다(0152)
