"use server";
/** 내 업무 05 의 손 · 학원 사람만. 판단·쓰기는 lib/todo.js 한 벌(끝냄 · 되돌리기 · 마감 · 빼기 · 단원평가 출제 · 메모 · 반복 · 한 번에 뽑기 · 자료 빼기). 지우는 손이 없다(대전제-6) */
import { staff } from "@/lib/session";
import { editTodo } from "@/lib/schedule";
import { wrap as act } from "@/lib/act";
import { today } from "@/lib/day";
import { takeQuiz } from "@/lib/quiz";   // (어89) 재시험 끝냄 — 01 과 같은 손(원칙-1)
import { finishTodo, undoTodo, setTodoDue, dropTodo, todoMany, addUnitTest, unitTestMade, makeDueUnitTest, addNote, addRepeat, setRepeatActive, printAll, dropMaterial, setQuizPaper, setScored , restoreTodo, addKind, editKind, dropKind, restoreKind, moveKindOrder, moveKind } from "@/lib/todo";
const wrap = (fn) => act(fn, "업무 05");   // 손 한 벌은 lib/act.js · 삼키지 않고 서버 기록에 까닭을 남긴다(원칙-1)
export async function doneAct(todoId) { return wrap(async () => { const { sb } = await staff(); return finishTodo(sb, todoId); }); }
export async function undoAct(todoId) { return wrap(async () => { const { sb } = await staff(); return undoTodo(sb, todoId); }); }
export async function dueAct(todoId, dueOn) { return wrap(async () => { const { sb } = await staff(); await setTodoDue(sb, todoId, dueOn); return {}; }); }
export async function dropAct(todoId, why = null) { return wrap(async () => { const { sb } = await staff(); return await dropTodo(sb, todoId, why); }); }   // (어88) { material } 을 그대로 돌려준다 — 자료까지 지웠으면 화면이 그 말을 한다(대전제-0)
export async function unitTestAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addUnitTest(sb, { studentId: f?.studentId, topicId: f?.topicId, qCount: f?.qCount ?? 25 }) }; }); }
export async function unitTestMadeAct(id) { return wrap(async () => { const { sb } = await staff(); await unitTestMade(sb, id, await today(sb)); return {}; }); }
export async function unitTestDueAct(due) { return wrap(async () => { const { sb } = await staff(); await makeDueUnitTest(sb, due ?? {}, await today(sb)); return {}; }); }   // (버) 저절로 선 카드의 「출제 완료」
export async function noteAct(f) { return wrap(async () => { const { sb } = await staff(); return { id: await addNote(sb, { title: f?.title, kind: f?.kind || null, dueOn: f?.dueOn || null, dueTime: f?.dueTime || null, studentId: f?.studentId || null, note: f?.note || null, startOn: f?.startOn || null }) }; }); }   // (어78) 마감·시작일은 없어도 된다 — 📌 퀵 메모와 05 가 같은 손을 쓴다
export async function editNoteAct(todoId, f) { return wrap(async () => { const { sb } = await staff(); await editTodo(sb, todoId, { title: f?.title, kind: f?.kind || undefined, dueOn: f?.dueOn || null, dueTime: f?.dueTime || null, studentId: f?.studentId || null, startOn: f?.startOn || null }); return {}; }); }   // (어80) ✎ 한 줄 고치기 — 퀵 메모와 **같은 양식**이 넣기·고치기를 다 한다(원칙-1)
/* ── (어80) 분류 자체를 더하고 고치고 내린다 — 원장님 2026-09-18 「업무 칸반보드에 분류자체를 추가/수정/삭제가 되게해줘」 ── */
export async function addKindAct(f) { return wrap(async () => { const { sb } = await staff(); return { kind: await addKind(sb, { name: f?.name, cls: f?.cls ?? "", showOn: f?.showOn ?? "todo" }) }; }); }
export async function editKindAct(kind, f) { return wrap(async () => { const { sb } = await staff(); await editKind(sb, kind, { name: f?.name, cls: f?.cls ?? "", showOn: f?.showOn }); return {}; }); }
export async function dropKindAct(kind) { return wrap(async () => { const { sb } = await staff(); await dropKind(sb, kind); return {}; }); }
export async function restoreKindAct(kind) { return wrap(async () => { const { sb } = await staff(); await restoreKind(sb, kind); return {}; }); }
export async function kindOrderAct(kind, dir) { return wrap(async () => { const { sb } = await staff(); await moveKindOrder(sb, kind, dir); return {}; }); }
export async function moveKindAct(ids, kind) { return wrap(async () => { const { sb } = await staff(); return moveKind(sb, ids, kind); }); }   // 고른 업무를 한 문장으로 옮긴다(원장님 「분류 옮기기가능하게」)
export async function restoreAct(todoId) { return wrap(async () => { const { sb } = await staff(); await restoreTodo(sb, todoId); return {}; }); }   // (어80) 뺀 것 복구(대전제-6 의 짝)
export async function quizPaperAct(quizId, on) { return wrap(async () => { const { sb } = await staff(); await setQuizPaper(sb, quizId, Boolean(on)); return {}; }); }
export async function repeatAct(f) { return wrap(async () => { const { sb } = await staff(); return addRepeat(sb, { name: f?.name, every: f?.every, day: f?.day, weekday: f?.weekday, lead: f?.lead, days: f?.days, left: f?.left }, await today(sb)); }); }
export async function repeatActiveAct(id, active) { return wrap(async () => { const { sb } = await staff(); await setRepeatActive(sb, id, active); return {}; }); }
export async function printAllAct(materialIds) { return wrap(async () => { const { sb } = await staff(); return printAll(sb, materialIds); }); }
export async function scoredAct(materialId, studentId, on) { return wrap(async () => { const { sb } = await staff(); return setScored(sb, String(materialId), String(studentId), Boolean(on)); }); }   // ✅ 채점 아이마다((가)-⑧)
export async function dropMaterialAct(materialId, why = null) { return wrap(async () => { const { sb } = await staff(); await dropMaterial(sb, materialId, why); return {}; }); }
export async function manyAct(ids, op, value = null) { return wrap(async () => { const { sb } = await staff(); return todoMany(sb, ids, op, value); }); }   // (어28)-③ 고른 업무에 한 번에(done · undo · due · drop)
/** (어89) 재시험 「✓ 끝냄」 — 원장님 2026-09-18 「재시함지는 왜 완료가 없어?」.
 *  05 에서 그 자리에서 틀린 개수만 적는다. 쓰는 손은 **01 오늘 수업과 같은 것**(lib/quiz takeQuiz · 새 손 0 · 원칙-1)이라
 *  결과가 그 아이 그날 수업 일지에 제대로 남고, 넘기면 passed · 못 넘기면 다음 재시험이 또 선다(그 판단도 01 과 같다). */
export async function retestTakeAct(sheetId, quizId, wrong) { return wrap(async () => { const { sb } = await staff(); return await takeQuiz(sb, sheetId, quizId, { wrong }); }); }
