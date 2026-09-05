"use server";
/** 오늘 수업의 손 — 전부 guard(학원 사람) → lib 의 판단 한 벌 → 다시 그리기. 판단은 여기 없다.
 *  ⚠️ 마감된 판은 lib 의 assertOpen 이 막는다(검사-⑤). 실패는 던지지 않고 {ok:false, msg} 로 돌려 화면이 그 자리에서 말한다 */
import { revalidatePath } from "next/cache";
import { guard } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { ensureSheet, saveComment, closeSheet } from "@/lib/day";
import { attendanceWrite } from "@/lib/attend";
import { checkItem, carryRest, addItem, moveItem } from "@/lib/homework";
import { setLate, sendLate } from "@/lib/late";
import { setMode, setStop, pickWave, setMemo, tunePool, applyTune } from "@/lib/routine";
import { addQuiz, setQuiz, takeQuiz, retest, skipRetest } from "@/lib/quiz";
async function staff() { const w = await guard(); if (!isStaff(w.me?.role)) throw new Error("학원 사람만 씁니다"); return w; }
const done = (fn) => async (...a) => { try { const r = await fn(...a); revalidatePath("/today"); return { ok: true, ...(r ?? {}) }; } catch (e) { return { ok: false, msg: String(e?.message ?? e) }; } };

export const openSheet = done(async (studentId, classId, date) => { const { sb } = await staff(); const s = await ensureSheet(sb, studentId, classId, date); return { sheetId: s.id }; });
export const setAttend = done(async (sheetId, value) => { const { sb } = await staff(); await attendanceWrite(sb, sheetId, value); });
export const check = done(async (itemId, status, doneNote) => { const { sb } = await staff(); await checkItem(sb, itemId, status, doneNote); });
export const rest = done(async (itemId, where) => { const { sb } = await staff(); const r = await carryRest(sb, itemId, where); if (r.stay) await setLate(sb, r.item.sheet_id, { reason: `숙제 나머지 — ${r.item.range_note ?? ""}`.trim() }); });
export const add = done(async (form) => { const { sb } = await staff(); await addItem(sb, String(form.get("sheetId")), String(form.get("slot")), String(form.get("text") ?? "")); });
export const move = done(async (itemId, slot) => { const { sb } = await staff(); await moveItem(sb, itemId, slot); });
export const late = done(async (form) => { const { sb } = await staff(); await setLate(sb, String(form.get("sheetId")), { reason: String(form.get("reason") ?? "") || null, untilAt: String(form.get("untilAt") ?? "") || null }); });
export const lateSend = done(async (sheetId) => { const { sb } = await staff(); await sendLate(sb, sheetId); });
export const comment = done(async (form) => { const { sb } = await staff(); await saveComment(sb, String(form.get("sheetId")), String(form.get("comment") ?? "")); });
export const close = done(async (form) => { const { sb, user } = await staff(); await closeSheet(sb, String(form.get("sheetId")), String(form.get("comment") ?? ""), user.id); });
// 오늘 학습·숙제 — 저절로 깔린 것을 손보는 손(확정-⑨a): 줄이기 · 교재 상태 · 회차 · 교재마다 메모. 판단은 lib/routine.js
export const mode = done(async (sheetId, m) => { const { sb } = await staff(); await setMode(sb, sheetId, m); });
export const stop = done(async (sheetId, studentBookId, m) => { const { sb } = await staff(); await setStop(sb, sheetId, studentBookId, m); });
export const wave = done(async (sheetId, bookId, slot, unitIds) => { const { sb } = await staff(); await pickWave(sb, sheetId, bookId, slot, unitIds); });
export const memo = done(async (form) => { const { sb } = await staff(); await setMemo(sb, String(form.get("sheetId")), String(form.get("bookId")), String(form.get("slot")), String(form.get("text") ?? "")); });
// 시험(🔤 오늘 볼 것 · 📝 다음 시간에 낼 것) — 판정은 SQL, 여기는 손만. 판단은 lib/quiz.js
export const quizAdd = done(async (form) => { const { sb } = await staff(); const r = await addQuiz(sb, String(form.get("sheetId")), { kind: String(form.get("kind")), bookId: String(form.get("bookId") || "") || null, unitId: String(form.get("unitId") || "") || null, freeNote: String(form.get("freeNote") ?? ""), round: Number(form.get("round") || 1) }); return r; });
export const quizSet = done(async (sheetId, quizId, patch) => { const { sb } = await staff(); await setQuiz(sb, sheetId, quizId, patch); });
export const quizTake = done(async (sheetId, quizId, wrong, total) => { const { sb } = await staff(); return takeQuiz(sb, sheetId, quizId, { wrong, total }); });
export const quizRetest = done(async (sheetId, quizId) => { const { sb } = await staff(); await retest(sb, sheetId, quizId); });
export const quizSkip = done(async (sheetId, quizId, skip) => { const { sb } = await staff(); await skipRetest(sb, sheetId, quizId, skip); });
// 조절 모달(02) — 열 때 읽고(tunePool), 적용은 한 손(applyTune). 판단은 lib/routine.js
export const tuneOpen = done(async (sheetId, bookId) => { const { sb } = await staff(); return { pool: await tunePool(sb, sheetId, bookId) }; });
export const tuneApply = done(async (sheetId, bookId, payload) => { const { sb } = await staff(); return applyTune(sb, sheetId, bookId, payload); });
