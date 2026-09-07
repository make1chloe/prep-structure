/** 내 할 일 05 · 내신 자료 04 의 손 — 판 읽기(한 벌 todo_board · prep_board) · 자료 세우기(갈래 + 항목 + 배정 → 할 일은 DB 한 곳 sync_material_todos 가 세운다) · 학교 진도 · 배부 ·
 *  할 일 끝냄/되돌리기/마감/빼기(자료 단계도 같이 움직인다 — 자료 하나 안에서만 순서, 확정-㉟) · 단원평가 출제 · 메모 · 되풀이 규칙 · 한 번에 뽑기 · 줄이기.
 *  판단은 lib/todo-plan.js(순수). 지우지 않는다(대전제-6): 빼기는 dropped · 되돌리기는 상태만 */
import { db } from "./supabase.js";
import { addTodo } from "./schedule.js";
import { parseMaterial, parseRepeat, KINDS } from "./todo-plan.js";
import { beforeRun } from "./queue.js";
const row = (r, what) => { if (r?.error) throw new Error(`${what}: ${r.error.message}`); return r?.data ?? null; };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
const now = () => new Date().toISOString();
async function rpc(sb, fn, args, what) { const { data, error } = await db(sb).rpc(fn, args); if (error) throw new Error(`${what}: ${error.message}`); return data; }
/** 05 한 벌 — 오늘 되풀이가 아직 안 돌았으면 먼저 돌린다(하루 한 번 · 크론이 못 돌았어도 화면이 연다) */
export async function todoBoard(sb, date) {
  let b = await rpc(sb, "todo_board", { p_on: date }, "할 일을 못 읽음");
  if (!b) throw new Error("할 일은 학원 사람의 화면입니다");
  if (!b.repeat_ran) { await rpc(sb, "run_repeats", { p_on: date }, "되풀이를 못 돌림"); b = await rpc(sb, "todo_board", { p_on: date }, "할 일을 못 읽음"); }
  return b;
}
/** 04 한 벌 — 회차를 안 고르면 회차 목록만(첫 회차를 화면이 고른다) */
export async function prepBoard(sb, examId, date) {
  const [b, sbQ, bkQ] = await Promise.all([   // 판 한 벌 ∥ 학교 교과서(처음-8) ∥ 교재 목록(고르기)
    rpc(sb, "prep_board", { p_exam: examId ?? null, p_on: date }, "내신 자료를 못 읽음"),
    db(sb).from("school_book").select("id,school_id,grade,year,book_id,note,books(name)").order("year", { ascending: false }),
    db(sb).from("books").select("id,name").eq("state", "active").order("name"),
  ]);
  if (!b) throw new Error("내신 자료는 학원 사람의 화면입니다");
  if (sbQ.error) throw new Error(`학교 교과서를 못 읽음: ${sbQ.error.message}`); if (bkQ.error) throw new Error(`교재 목록을 못 읽음: ${bkQ.error.message}`);
  return { ...b, school_books: sbQ.data ?? [], books: bkQ.data ?? [] };
}
/** 처음-8 학교 × 학년 × 연도의 교과서 — 더하기·바꾸기(같은 교재는 한 번). 지우지 않는다(원칙-6) */
export async function setSchoolBook(sb, { schoolId, grade, year, bookId }) {
  if (!schoolId || !bookId) throw new Error("학교와 교재를 고르세요");
  const g = Number(grade), y = Number(year); if (!Number.isInteger(g) || !Number.isInteger(y)) throw new Error("학년·연도가 아닙니다");
  const r = row(await db(sb).from("school_book").upsert({ school_id: schoolId, grade: g, year: y, book_id: bookId }, { onConflict: "school_id,grade,year,book_id" }).select("id"), "학교 교과서를 못 적음");
  return { id: r?.[0]?.id ?? null };
}
/** + 자료 — 갈래 하나(종류 · 제목) + 항목들 + 배정(보는 아이, 비면 전부). ♻️ 지난번 것이면 만들기가 끝난 채로(state made · 할 일 make 는 done, 확정-㊵). 할 일 셋은 DB 한 곳이 세운다 */
export async function addMaterial(sb, { examId, typeId, title, items, studentIds, reuseOf = null, takers = [], types = [] }) {
  if (!examId) throw new Error("회차가 없습니다");
  const p = parseMaterial({ typeId, title, items, studentIds, takers, types });
  const ins = row(await db(sb).from("material").insert({ exam_id: examId, type_id: p.typeId, title: p.title, reuse_of: reuseOf || null, state: reuseOf ? "made" : "todo", made_at: reuseOf ? now() : null }).select("id").single(), "자료를 못 세움");
  if (p.items.length) row(await db(sb).from("material_item").insert(p.items.map((name, i) => ({ material_id: ins.id, name, sort: (i + 1) * 10 }))).select("id"), "항목을 못 넣음");
  if (p.studentIds.length) row(await db(sb).from("material_give").insert(p.studentIds.map((sid) => ({ material_id: ins.id, student_id: sid }))).select("material_id"), "배정을 못 넣음");
  const todos = await rpc(sb, "sync_material_todos", { p_material: ins.id }, "할 일을 못 세움");
  return { id: ins.id, items: p.items.length, students: p.studentIds.length, todos };
}
/** ♻️ 지난번 것을 가져온다 — 항목을 베끼고 만들기는 끝난 채로. 개정판이면 체크 안 함(체크 없이 새로 = state todo) */
export async function reuseMaterial(sb, { examId, fromId, studentIds = [], takers = [], types = [], revised = false }) {
  const src = row(await db(sb).from("material").select("id,type_id,title,material_item(name,unit_id,item_id,sort)").eq("id", fromId).single(), "지난번 것을 못 읽음");
  if (!src) throw new Error("지난번 자료가 없습니다");
  const p = parseMaterial({ typeId: src.type_id, title: src.title, items: "", studentIds, takers, types });
  const ins = row(await db(sb).from("material").insert({ exam_id: examId, type_id: src.type_id, title: src.title, reuse_of: fromId, state: revised ? "todo" : "made", made_at: revised ? null : now() }).select("id").single(), "자료를 못 세움");
  const items = (src.material_item ?? []).sort((a, b) => a.sort - b.sort);
  if (items.length) row(await db(sb).from("material_item").insert(items.map((it, i) => ({ material_id: ins.id, name: it.name, unit_id: it.unit_id, item_id: it.item_id, sort: (i + 1) * 10 }))).select("id"), "항목을 못 베낌");
  if (p.studentIds.length) row(await db(sb).from("material_give").insert(p.studentIds.map((sid) => ({ material_id: ins.id, student_id: sid }))).select("material_id"), "배정을 못 넣음");
  if (revised) row(await db(sb).from("material").update({ reuse_of: null }).eq("id", ins.id).select("id"), "자료를 못 고침");   // 개정판 — 지난번 것을 가리키지 않는다(만들기 체크 없이)
  const todos = await rpc(sb, "sync_material_todos", { p_material: ins.id }, "할 일을 못 세움");
  return { id: ins.id, items: items.length, students: p.studentIds.length, todos, revised };
}
/** 학교 진도 — 아이 × 회차 한 줄(비면 지운 것이 아니라 「아직」) */
export async function setSchoolProg(sb, examId, studentId, text) {
  const t = String(text ?? "").trim() || null;
  row(await db(sb).from("prep_student").upsert({ exam_id: examId, student_id: studentId, school_prog: t }, { onConflict: "exam_id,student_id" }).select("exam_id"), "학교 진도를 못 적음");
  return { school_prog: t };
}
/** 자료 단계를 옮긴다 — 만들기(made) · 인쇄(printed) · 배부(done — 아이 전부에게 handed_at). 되돌리기(back)는 한 단계 아래로(배부는 handed_at 도 무른다 — 잘못 누른 것) */
async function stepMaterial(sb, materialId, step, back = false) {
  const m = row(await db(sb).from("material").select("id,state,reuse_of").eq("id", materialId).single(), "자료를 못 읽음"); if (!m) throw new Error("자료가 없습니다");
  const patch = step === "make" ? (back ? { state: "todo", made_at: null } : { state: ["printed", "done"].includes(m.state) ? m.state : "made", made_at: now() })
    : step === "print" ? (back ? { state: "made", printed_at: null } : { state: m.state === "done" ? "done" : "printed", printed_at: now(), made_at: m.state === "todo" ? now() : undefined })
    : step === "hand" ? (back ? { state: "printed" } : { state: "done", made_at: m.state === "todo" ? now() : undefined, printed_at: m.state === "todo" || m.state === "made" ? now() : undefined }) : null;
  if (!patch) return;
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
  row(await db(sb).from("material").update(patch).eq("id", materialId).select("id"), "자료 단계를 못 옮김");
  if (step === "hand") row(await db(sb).from("material_give").update({ handed_at: back ? null : now() }).eq("material_id", materialId).select("material_id"), "배부를 못 적음");
  if (step === "hand" && !back) row(await db(sb).from("material_give").update({ handed_at: now() }).eq("material_id", materialId).is("handed_at", null).select("material_id"), "배부를 못 적음");
}
/** 앞 단계 할 일도 끝난다 — 인쇄했으면 만든 것이고 배부했으면 인쇄한 것이다(자료 상태와 할 일이 어긋나지 않게) */
async function closeEarlier(sb, materialId, kind) {
  const earlier = kind === "hand" ? ["make", "print"] : kind === "print" ? ["make"] : [];
  if (earlier.length) row(await db(sb).from("todo").update({ state: "done", done_at: now() }).eq("material_id", materialId).in("kind", earlier).in("state", ["todo", "doing"]).select("id"), "앞 단계 할 일을 못 끝냄");
}
/** ✓ 끝냄 — 할 일 한 줄. 자료의 할 일이면 자료 단계도 같이(만들기·인쇄·배부 — 앞 단계 할 일도 끝난다) */
export async function finishTodo(sb, todoId) {
  const t = row(await db(sb).from("todo").select("id,kind,state,material_id").eq("id", todoId).single(), "할 일을 못 읽음"); if (!t) throw new Error("할 일이 없습니다");
  if (t.state === "done") throw new Error("이미 끝낸 할 일입니다");
  row(await db(sb).from("todo").update({ state: "done", done_at: now() }).eq("id", todoId).select("id"), "할 일을 못 끝냄");
  if (t.material_id && ["make", "print", "hand"].includes(t.kind)) { await stepMaterial(sb, t.material_id, t.kind); await closeEarlier(sb, t.material_id, t.kind); }
  return { kind: t.kind };
}
/** 되돌리기 — 끝낸 것을 다시 하는 것으로(자료 단계도 한 칸 아래로) */
export async function undoTodo(sb, todoId) {
  const t = row(await db(sb).from("todo").select("id,kind,state,material_id").eq("id", todoId).single(), "할 일을 못 읽음"); if (!t) throw new Error("할 일이 없습니다");
  if (t.state === "todo" || t.state === "doing") throw new Error("아직 하는 중인 할 일입니다");
  row(await db(sb).from("todo").update({ state: "todo", done_at: null }).eq("id", todoId).select("id"), "할 일을 못 되돌림");
  if (t.material_id && ["make", "print", "hand"].includes(t.kind)) await stepMaterial(sb, t.material_id, t.kind, true);
  return { kind: t.kind };
}
export async function setTodoDue(sb, todoId, dueOn) {
  if (dueOn && !isDate(dueOn)) throw new Error(`날짜가 아닙니다: ${dueOn}`);
  const r = row(await db(sb).from("todo").update({ due_on: dueOn || null }).eq("id", todoId).select("id"), "마감을 못 적음"); if (!r?.length) throw new Error("고쳐진 줄이 없습니다");
}
/** 빼기 — 지우지 않고 dropped(까닭 남김). 자료의 만들기를 빼면 자료도 뺀다 */
export async function dropTodo(sb, todoId, why = null) {
  const t = row(await db(sb).from("todo").select("id,kind,material_id,state").eq("id", todoId).single(), "할 일을 못 읽음"); if (!t) throw new Error("할 일이 없습니다");
  row(await db(sb).from("todo").update({ state: "dropped", why: String(why ?? "").trim() || t.why || "뺐습니다" }).eq("id", todoId).select("id"), "할 일을 못 뺌");
  if (t.material_id && t.kind === "make") await dropMaterial(sb, t.material_id, why);
}
/** 자료 빼기(줄이기 🔥) — 자료 dropped + 하는 중인 할 일 dropped */
export async function dropMaterial(sb, materialId, why = null) {
  row(await db(sb).from("material").update({ state: "dropped" }).eq("id", materialId).select("id"), "자료를 못 뺌");
  row(await db(sb).from("todo").update({ state: "dropped", why: String(why ?? "").trim() || "못 따라가서 줄임(05 🔥)" }).eq("material_id", materialId).in("state", ["todo", "doing"]).select("id"), "할 일을 못 뺌");
}
/** 🖨 한 번에 뽑기 — 인쇄 칸의 자료 전부: 자료 printed · 인쇄 할 일 done. 장수는 화면이 셌다(printAllOf) */
export async function printAll(sb, materialIds = []) {
  const ids = [...new Set((materialIds ?? []).filter(Boolean))]; if (!ids.length) throw new Error("뽑을 자료가 없습니다");
  for (const id of ids) await stepMaterial(sb, id, "print");
  row(await db(sb).from("todo").update({ state: "done", done_at: now() }).in("material_id", ids).in("kind", ["make", "print"]).in("state", ["todo", "doing"]).select("id"), "인쇄 할 일을 못 끝냄");   // 뽑았으면 만든 것이다
  return { materials: ids.length };
}
/** 📤 배부 — 자료 하나를 아이들에게(비면 배정 전부). 배부 할 일도 같이 끝난다 */
export async function handOut(sb, materialId, studentIds = null) {
  let q = db(sb).from("material_give").update({ handed_at: now() }).eq("material_id", materialId).is("handed_at", null);
  if (studentIds?.length) q = q.in("student_id", studentIds);
  const r = row(await q.select("student_id"), "배부를 못 적음") ?? [];
  const left = row(await db(sb).from("material_give").select("student_id").eq("material_id", materialId).is("handed_at", null), "배정을 못 읽음") ?? [];
  if (!left.length) { await stepMaterial(sb, materialId, "hand"); row(await db(sb).from("todo").update({ state: "done", done_at: now() }).eq("material_id", materialId).in("kind", ["make", "print", "hand"]).in("state", ["todo", "doing"]).select("id"), "배부 할 일을 못 끝냄"); }
  return { handed: r.length, left: left.length };
}
/** 📝 단원평가 출제 — 새로 만들기(아이 · 문법 분류 · 문항 수) → 낼 것(todo). 「출제함」이 made 로(01 카드가 그때부터 선다) */
export async function addUnitTest(sb, { studentId, topicId, qCount = 25 }) {
  if (!studentId) throw new Error("아이를 고르세요"); if (!topicId) throw new Error("문법 분류를 고르세요");
  const n = Number(qCount); if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error("문항 수는 1~200");
  const ins = row(await db(sb).from("unit_test").insert({ student_id: studentId, topic_id: topicId, q_count: n, state: "todo" }).select("id").single(), "단원평가를 못 세움");
  return ins.id;
}
export async function unitTestMade(sb, id, date) {
  const r = row(await db(sb).from("unit_test").update({ state: "made", assigned_on: date }).eq("id", id).eq("state", "todo").select("id"), "단원평가를 못 고침"); if (!r?.length) throw new Error("이미 출제한 단원평가입니다");
}
/** 📋 메모 — 12 의 + 할 일과 같은 줄(kind note) */
export const addNote = (sb, { title, dueOn, dueTime = null, studentId = null, note = null }) => addTodo(sb, { title, dueOn, dueTime, studentId, note });
/** ⏰ 되풀이 규칙 — 매달 N일 / 매주 요일 · 며칠 전부터. 만들면 바로 한 번 돌려 오늘 걸리는 것을 세운다 */
export async function addRepeat(sb, { name, every, day, weekday, lead, days, left }, date) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("무엇을 되풀이하는지 적으세요");
  const th = parseRepeat({ every, day, weekday, lead, days, left });
  const ins = row(await db(sb).from("auto_rule").insert({ kind: "repeat", name: nm, threshold: th, active: true }).select("id").single(), "되풀이 규칙을 못 넣음");
  const made = await rpc(sb, "run_repeats", { p_on: date }, "되풀이를 못 돌림");   // 열쇠(규칙 · 마감 날)로 막으니 오늘 다시 돌려도 겹치지 않는다
  return { id: ins.id, made };
}
export async function setRepeatActive(sb, id, active) { const r = row(await db(sb).from("auto_rule").update({ active: Boolean(active) }).eq("id", id).select("id"), "되풀이 규칙을 못 고침"); if (!r?.length) throw new Error("고쳐진 줄이 없습니다"); }
/** 시험이 밀리면 날짜도 밀린다 — 회차의 자료 할 일 마감을 다시 맞춘다(DB 한 곳). lib/schedule setEnglishOn 이 부른다 */
export const syncExamTodos = (sb, examId) => rpc(sb, "sync_exam_todos", { p_exam: examId }, "할 일 마감을 못 맞춤");
/** 🔁 재시험지 만들었음(05 카드 · 4단계-5) — 아직 안 본 재시험 줄에만 · 무를 수 있다. 시험을 보면 카드는 사라진다 */
export async function setQuizPaper(sb, quizId, on) {
  const r = row(await db(sb).from("quiz").update({ paper_at: on ? now() : null }).eq("id", quizId).eq("state", "planned").not("retry_of", "is", null).select("id"), "재시험지 표시를 못 적음");
  if (!r?.length) throw new Error("아직 안 본 재시험 줄이 아닙니다");
}
/** 04 자료 항목을 단원으로(4단계-5) — 이름만 적던 항목에 범위의 단원을 잇는다(비우면 이름만). 항목 이름은 그대로 둔다 */
export async function setItemUnit(sb, itemId, unitId) {
  const r = row(await db(sb).from("material_item").update({ unit_id: unitId || null }).eq("id", itemId).select("id"), "항목의 단원을 못 적음");
  if (!r?.length) throw new Error("고쳐진 항목이 없습니다(검사-⑪)");
}
/** 크론 한 바퀴 앞 — 오늘 되풀이를 돌린다(하루 한 번 · day_ran 이 막는다 · 05 첫 열기와 같은 손 — 뼈대-9: 크론은 새 셈을 안 만든다) */
export async function runRepeatsDaily(sb, today) { await rpc(sb, "run_repeats", { p_on: today }, "되풀이를 못 돌림"); }
if (!beforeRun.includes(runRepeatsDaily)) beforeRun.push(runRepeatsDaily);
export const TODO_KINDS = KINDS;
