"use server";
/** 일정 손 — 학원 사람만. 판단·쓰기는 lib/schedule.js 한 벌(휴강·할 일·시험·보강일·아이 보강). 지우는 손이 없다(대전제-6) */
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { today } from "@/lib/day";
import { addHoliday, undoHoliday, addTodo, doneTodo, addExam, setEnglishOn, cancelExam, classMakeupDay, cancelClassMakeupDay, setMakeup, setSiteUrl, addExamWord } from "@/lib/schedule";
import { importExams, searchSchools, setSchoolCode } from "@/lib/neis";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
async function wrap(fn) { try { return { ok: true, ...(await fn()) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } }
export async function holidayAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addHoliday(sb, { date: f.date, classId: f.classId || null, reason: f.reason }) }; }); }
export async function undoHolidayAct(id) { return wrap(async () => { const { sb } = await staff(); await undoHoliday(sb, id); return {}; }); }
export async function todoAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addTodo(sb, { title: f.title, dueOn: f.dueOn, dueTime: f.dueTime || null, note: f.note }) }; }); }
export async function doneTodoAct(id) { return wrap(async () => { const { sb } = await staff(); await doneTodo(sb, id); return {}; }); }
export async function examAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addExam(sb, { scope: f.scope, schoolId: f.schoolId || null, grade: f.grade, name: f.name, termFrom: f.termFrom, termTo: f.termTo || null, englishOn: f.englishOn, date: await today(sb) || null }) }; }); }
export async function englishOnAct(id, date) { return wrap(async () => { const { sb } = await staff(); await setEnglishOn(sb, id, date || null, await today(sb)); return {}; }); }
export async function cancelExamAct(id) { return wrap(async () => { const { sb } = await staff(); await cancelExam(sb, id, await today(sb)); return {}; }); }
export async function classMakeupAct(f) { return wrap(async () => { const { sb } = await staff(); return classMakeupDay(sb, { classId: f.classId, onDate: f.onDate, atTime: f.atTime || null, reason: f.reason, date: await today(sb) }); }); }
export async function cancelClassMakeupAct(ids) { return wrap(async () => { const { sb } = await staff(); return { n: await cancelClassMakeupDay(sb, { ids }) }; }); }
export async function makeupAct(f) { return wrap(async () => { const { sb, user } = await staff(); return setMakeup(sb, { studentId: f.studentId, ofDate: f.ofDate, onDate: f.onDate || null, atTime: f.atTime || null, reason: f.reason ?? null, waived: Boolean(f.waived) }, user.id); }); }
export async function siteUrlAct(schoolId, url) { return wrap(async () => { const { sb } = await staff(); await setSiteUrl(sb, schoolId, url); return {}; }); }
export async function examWordAct(word) { return wrap(async () => { const { sb } = await staff(); return { added: await addExamWord(sb, word) }; }); }
export async function importAct() { return wrap(async () => { const { sb } = await staff(); return { r: await importExams(sb, await today(sb)) }; }); }
export async function searchSchoolsAct(name) { return wrap(async () => { const { sb } = await staff(); return { rows: await searchSchools(sb, name) }; }); }
export async function schoolCodeAct(schoolId, atpt, schul) { return wrap(async () => { const { sb } = await staff(); await setSchoolCode(sb, schoolId, atpt, schul); return {}; }); }
