/** 내 업무 05 · 내신 자료 04 의 손 · 판 읽기(한 벌 todo_board · prep_board) · 자료 세우기(유형 + 항목 + 배정 → 업무는 DB 한 곳 sync_material_todos 가 세운다) · 학교 진도 · 배부 ·
 *  업무 끝냄/되돌리기/마감/빼기(자료 단계도 같이 움직인다 · 자료 하나 안에서만 순서, 확정-㉟) · 단원평가 출제 · 메모 · 반복 규칙 · 한 번에 뽑기 · 줄이기.
 *  판단은 lib/todo-plan.js(순수). 지우지 않는다(대전제-6): 빼기는 dropped · 되돌리기는 상태만 */
import { db } from "./supabase.js";
import { addTodo } from "./schedule.js";
import { parseMaterial, parseRepeat, KINDS, SHOW_ON, kindList, isNotifyWay } from "./todo-plan.js";
import { beforeRun, enqueue } from "./queue.js";
import { changed, row, saidBy, ZERO } from "./sqlError.js";
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
const now = () => new Date().toISOString();
async function rpc(sb, fn, args, what) { const { data, error } = await db(sb).rpc(fn, args); if (error) throw new Error(`${what}: ${error.message}`); return data; }
/** 05 한 벌 · 오늘 반복이 아직 안 돌았으면 먼저 돌린다(하루 한 번 · 크론이 못 돌았어도 화면이 연다) */
export async function todoBoard(sb, date) {
  let b = await rpc(sb, "todo_board", { p_on: date }, "업무를 못 읽음");
  if (!b) throw new Error("업무는 학원 사람의 화면입니다");
  if (!b.repeat_ran) { await rpc(sb, "run_repeats", { p_on: date }, "반복을 못 돌림"); b = await rpc(sb, "todo_board", { p_on: date }, "업무를 못 읽음"); }
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
/** (어94) 「+ 자료」 양식이 쓰는 것만 — 그 시험의 자료 종류와 보는 아이. 05 에서 모달을 열 때만 부른다.
 *  prepBoard 를 부르지 않는다 — 그건 학교 교과서·교재 목록까지 셋을 읽어서 모달 하나에는 무겁다(속도-1). */
export async function materialForm(sb, examId, date) {
  const b = await rpc(sb, "prep_board", { p_exam: examId, p_on: date }, "내신 자료를 못 읽음");
  if (!b) throw new Error("내신 자료는 학원 사람의 화면입니다");
  return { types: b.types ?? [], takers: b.takers ?? [] };
}
/** 처음-8 학교 × 학년 × 연도의 교과서 — 더하기·바꾸기(같은 교재는 한 번). 지우지 않는다(원칙-6) */
/** (어21) 오늘 오는 아이의 「멈춘 교재의 시험」과 자료 — 01 파도에 한 줄(속도-1). 0163 이 아직 실 DB 에 없으면 빈 것으로 — 01 이 이것 때문에 안 서면 안 된다(대전제-0: 자리는 「자료 없음」이 아니라 안 보인다) */
export async function todayPrep(sb, date) {
  const { data, error } = await db(sb).rpc("today_prep", { p_on: date });
  if (error) { console.error("[오늘] 내신 자료(today_prep)를 못 읽음:", error.message); return {}; }
  return data ?? {};
}
/** (어21) 배정 — 이미 있는 자료를 이 아이에게(material_give 한 줄 · 이미 있으면 그대로). 04 의 + 자료 배정과 같은 줄 */
export async function giveMaterial(sb, materialId, studentIds = []) {
  const ids = [...new Set(studentIds.map(String).filter(Boolean))];
  if (!ids.length) return { given: 0 };
  const had = row(await db(sb).from("material_give").select("student_id").eq("material_id", materialId).in("student_id", ids), "배정을 못 읽음") ?? [];
  const has = new Set(had.map((g) => g.student_id)), fresh = ids.filter((id) => !has.has(id));
  if (fresh.length) row(await db(sb).from("material_give").insert(fresh.map((sid) => ({ material_id: materialId, student_id: sid }))).select("material_id"), "배정을 못 넣음");
  return { given: fresh.length };
}
export async function setSchoolBook(sb, { schoolId, grade, year, bookId }) {
  if (!schoolId || !bookId) throw new Error("학교와 교재를 고르세요");
  const g = Number(grade), y = Number(year); if (!Number.isInteger(g) || !Number.isInteger(y)) throw new Error("학년·연도가 아닙니다");
  const r = changed(await db(sb).from("school_book").upsert({ school_id: schoolId, grade: g, year: y, book_id: bookId }, { onConflict: "school_id,grade,year,book_id" }).select("id"), "학교 교과서를 못 적음");
  return { id: r?.[0]?.id ?? null };
}
/** + 자료 · 유형 하나(종류 · 제목) + 항목들 + 배정(보는 아이, 비면 전부). ♻️ 지난번 것이면 만들기가 끝난 채로(state made · 업무 make 는 done, 확정-㊵). 업무 셋은 DB 한 곳이 세운다 */
export async function addMaterial(sb, { examId, typeId, title, items, studentIds, reuseOf = null, takers = [], types = [] }) {
  if (!examId) throw new Error("시험이 없습니다");
  const p = parseMaterial({ typeId, title, items, studentIds, takers, types });
  const ins = row(await db(sb).from("material").insert({ exam_id: examId, type_id: p.typeId, title: p.title, reuse_of: reuseOf || null, state: reuseOf ? "made" : "todo", made_at: reuseOf ? now() : null }).select("id").single(), "자료를 못 세움");
  if (p.items.length) row(await db(sb).from("material_item").insert(p.items.map((name, i) => ({ material_id: ins.id, name, sort: (i + 1) * 10 }))).select("id"), "항목을 못 넣음");
  if (p.studentIds.length) row(await db(sb).from("material_give").insert(p.studentIds.map((sid) => ({ material_id: ins.id, student_id: sid }))).select("material_id"), "배정을 못 넣음");
  const todos = await rpc(sb, "sync_material_todos", { p_material: ins.id }, "업무를 못 세움");
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
  if (revised) changed(await db(sb).from("material").update({ reuse_of: null }).eq("id", ins.id).select("id"), "자료를 수정 못 함");   // 개정판 — 지난번 것을 가리키지 않는다(만들기 체크 없이)
  const todos = await rpc(sb, "sync_material_todos", { p_material: ins.id }, "업무를 못 세움");
  return { id: ins.id, items: items.length, students: p.studentIds.length, todos, revised };
}
/** 학교 진도 — 아이 × 회차 한 줄(비면 지운 것이 아니라 「아직」) */
export async function setSchoolProg(sb, examId, studentId, text) {
  const t = String(text ?? "").trim() || null;
  changed(await db(sb).from("prep_student").upsert({ exam_id: examId, student_id: studentId, school_prog: t }, { onConflict: "exam_id,student_id" }).select("exam_id"), "학교 진도를 못 적음");
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
  changed(await db(sb).from("material").update(patch).eq("id", materialId).select("id"), "자료 단계를 못 옮김");
  /* ⚠️ (어96) **준 날짜를 덮어쓰지 않는다** — 먼저 준 아이의 날짜가 「전부 배부」 한 번에 오늘로 지워지고 있었다.
     크로스체크(원장님 2026-09-19 「생각없이 체크누르면 큰 문제」)는 **언제 줬나**가 사실이어야 서므로 이것부터다(대전제-0).
     앞으로: 안 준 아이만 채운다 · 무를 때만 통째로 비운다(잘못 누른 것을 되돌리는 자리). */
  if (step === "hand" && back) changed(await db(sb).from("material_give").update({ handed_at: null }).eq("material_id", materialId).select("material_id"), "배부를 못 취소함", { zero: "ok" });
  if (step === "hand" && !back) {
    const fresh = changed(await db(sb).from("material_give").update({ handed_at: now() }).eq("material_id", materialId).is("handed_at", null).select("student_id"), "배부를 못 적음", { zero: "ok" }) ?? [];
    await tellGive(sb, materialId, fresh.map((r) => r.student_id));   // (어96) 이번에 **새로 준** 아이에게만 — 이미 준 아이에게 또 울리지 않는다
  }
}
/** (어96) 배부하면 아이에게 알린다 — 원장님 2026-09-19 「내가 완료처리하면 ① 학생에게 알림이가고」.
 *  ⚠️ **큐를 지나간다**(lib/send.js 손) — 그래야 방해금지(23시~9시)에 함께 걸려 밤에 안 울린다.
 *     바로 notify 를 부르면 밤 11시에 배부를 찍으신 날 아이 폰이 운다.
 *  ⚠️ 칸의 스위치가 「알림만」·「둘 다」일 때만 보낸다 — 0185 전 DB 는 칸이 없어 늘 안 보낸다(대전제-27). */
async function tellGive(sb, materialId, studentIds) {
  const ids = (studentIds ?? []).filter(Boolean); if (!ids.length) return;
  const way = (await listKinds(sb))?.find((x) => x.kind === "hand")?.notify_way ?? "none";
  if (way !== "push" && way !== "both") return;
  for (const id of ids) await enqueue(sb, "give_notice", { student_id: id, material_id: materialId }, { table: "material", id: materialId });
}
/** ✅ 채점 — 아이마다(0145 material_give.scored_at · (가)-⑧ 원장님 「학생어플에서 제출」: 제출은 아이가 07 에서, 채점은 원장이 05 채점 칸에서). 제출 안 한 아이는 못 찍는다 */
export async function setScored(sb, materialId, studentId, on = true) {
  const g = row(await db(sb).from("material_give").select("material_id,submitted_at").eq("material_id", materialId).eq("student_id", studentId).maybeSingle(), "배정을 못 읽음");
  if (!g) throw new Error("이 아이에게 준 자료가 아닙니다");
  if (on && !g.submitted_at) throw new Error("아직 제출 전입니다. 아이가 앱에서 「제출」을 찍어야 채점할 수 있습니다");
  changed(await db(sb).from("material_give").update({ scored_at: on ? now() : null }).eq("material_id", materialId).eq("student_id", studentId).select("material_id"), "채점을 못 적음");
  return { scored: on };
}
/** 앞 단계 업무도 끝난다 · 인쇄했으면 만든 것이고 배부했으면 인쇄한 것이다(자료 상태와 업무가 어긋나지 않게) */
async function closeEarlier(sb, materialId, kind) {
  const earlier = kind === "hand" ? ["make", "print"] : kind === "print" ? ["make"] : [];
  if (earlier.length) changed(await db(sb).from("todo").update({ state: "done", done_at: now() }).eq("material_id", materialId).in("kind", earlier).in("state", ["todo", "doing"]).select("id"), "앞 단계 업무를 완료 못 함", { zero: "ok" });
}
/** (어96) 이 칸이 **아이 확인을 받는** 칸인가 — 받는 칸이면 자료 배정을 아이마다 본다(원장님 2026-09-19 「크로스체크가 필요하다는거야」).
 *  ⚠️ 칸 이름을 조회 글자에 안 적는다(`*` · 대전제-27 ①) — 0185 전 DB 에서 이 조회가 거절되면 05 가 통째로 안 열린다.
 *  ⚠️ 0185 전 DB 는 `confirm_got` 이 없어 **늘 꺼진 것**이 된다 — 여태 하던 대로 한 번에 끝난다. */
async function crossOf(sb, t) {
  if (!t.material_id || t.kind !== "hand") return null;
  const k = (await listKinds(sb))?.find((x) => x.kind === t.kind);
  if (!k?.confirm_got) return null;
  const g = row(await db(sb).from("material_give").select("*,students(name)").eq("material_id", t.material_id), "배정을 못 읽음") ?? [];
  return { rows: g.map((r) => ({ id: r.student_id, name: r.students?.name ?? "이름 없음", handed: Boolean(r.handed_at), ok: Boolean(r.got_at) || Boolean(r.checked_at) })) };
}
/** ✓ 끝냄 · 업무 한 줄. 자료의 업무가면 자료 단계도 같이(만들기·인쇄·배부 · 앞 단계 업무도 끝난다).
 *  (어96) 아이 확인을 받는 칸이면 **두 걸음**이다 — 첫 누름은 나눠 주고 카드를 「하는 중」으로 남기고,
 *  다 받아 간 뒤의 누름이 카드를 닫는다. 덜 받아 갔으면 **누가 안 받아 갔는지** 말한다(대전제-0). */
export async function finishTodo(sb, todoId) {
  const t = row(await db(sb).from("todo").select("id,kind,state,material_id").eq("id", todoId).single(), "업무를 못 읽음"); if (!t) throw new Error("업무가 없습니다");
  if (t.state === "done") throw new Error("이미 끝낸 업무입니다");
  const cross = await crossOf(sb, t);
  if (cross) {
    const fresh = cross.rows.filter((r) => !r.handed);
    if (fresh.length) {
      await stepMaterial(sb, t.material_id, t.kind); await closeEarlier(sb, t.material_id, t.kind);
      changed(await db(sb).from("todo").update({ state: "doing" }).eq("id", todoId).select("id"), "업무를 못 옮김");
      return { kind: t.kind, state: "doing", handed: fresh.length, waiting: cross.rows.filter((r) => !r.ok).length };
    }
    const left = cross.rows.filter((r) => !r.ok);
    if (left.length) throw new Error(`아직 안 받아 간 아이 ${left.length}명: ${left.map((r) => r.name).join(" · ")}`);
  }
  changed(await db(sb).from("todo").update({ state: "done", done_at: now() }).eq("id", todoId).select("id"), "업무를 완료 못 함");
  if (t.material_id && ["make", "print", "hand"].includes(t.kind)) { await stepMaterial(sb, t.material_id, t.kind); await closeEarlier(sb, t.material_id, t.kind); }
  return { kind: t.kind, state: "done" };
}
/** (어96) 원장 확인 도장 — 아이가 찍은 「받았다」(got_at · 0117 트리거가 서버에서 찍는다)와 **다른 사실**이다.
 *  원장님 2026-09-19 「그냥 생각없이 체크누르면 큰 문제가 돼」 — 두 눈으로 본다.
 *  폰이 없거나 안 찍는 아이가 있어도 이 도장으로 카드를 닫으실 수 있다(막다른 길을 안 만든다 · 대전제-19 는 여럿도 기본). */
export async function setChecked(sb, materialId, studentIds, on = true) {
  const ids = [...new Set((studentIds ?? []).filter(Boolean).map(String))]; if (!ids.length) throw new Error("아이를 고르세요");
  const { error, count } = await db(sb).from("material_give").update({ checked_at: on ? now() : null }, { count: "exact" }).eq("material_id", materialId).in("student_id", ids);
  if (error) throw new Error(`확인을 못 적음: ${saidBy(error.message)}`);
  if (!count) throw new Error(`확인을 못 적음: ${ZERO}`);
  return { checked: count, on };
}
/** 되돌리기 — 끝낸 것을 다시 하는 것으로(자료 단계도 한 칸 아래로) */
export async function undoTodo(sb, todoId) {
  const t = row(await db(sb).from("todo").select("id,kind,state,material_id").eq("id", todoId).single(), "업무를 못 읽음"); if (!t) throw new Error("업무가 없습니다");
  if (t.state === "todo" || t.state === "doing") throw new Error("아직 하는 중인 업무입니다");
  changed(await db(sb).from("todo").update({ state: "todo", done_at: null }).eq("id", todoId).select("id"), "업무를 못 되돌림");
  if (t.material_id && ["make", "print", "hand"].includes(t.kind)) await stepMaterial(sb, t.material_id, t.kind, true);
  return { kind: t.kind };
}
export async function setTodoDue(sb, todoId, dueOn) {
  if (dueOn && !isDate(dueOn)) throw new Error(`날짜가 아닙니다: ${dueOn}`);
  const r = changed(await db(sb).from("todo").update({ due_on: dueOn || null }).eq("id", todoId).select("id"), "마감을 못 적음"); if (!r?.length) throw new Error("고쳐진 줄이 없습니다");
}
/** 복구 — 뺀 줄(dropped)을 다시 세운다((어80) · 대전제-6 은 「지우지 않고 내린다」이니 **되살리는 길**이 있어야 짝이 맞는다) */
export async function restoreTodo(sb, todoId) {
  const r = row(await db(sb).from("todo").select("id,state").eq("id", todoId).single(), "업무를 못 읽음"); if (!r) throw new Error("업무가 없습니다");
  if (r.state !== "dropped") throw new Error("삭제한 업무가 아닙니다");
  changed(await db(sb).from("todo").update({ state: "todo", done_at: null }).eq("id", todoId).select("id"), "업무를 못 복구함");
}
/** 빼기 — 지우지 않고 dropped(까닭 남김). 자료의 만들기를 빼면 자료도 뺀다 */
/** 업무 삭제(지우지 않고 감춘다 · 대전제-6 · 말은 「삭제」로 · 말-사전).
 *  ⚠️ 만들기 업무를 삭제하면 **그 자료와 자료에 딸린 남은 업무까지** 함께 감춘다 — 화면이 그 사실을 말해야 하므로
 *  `{ material: <자료 id 또는 null> }` 를 돌려준다(원장님 2026-09-18 「빼기가 무슨 기능인지 모르겠다」 · (어88)) */
export async function dropTodo(sb, todoId, why = null) {
  const t = row(await db(sb).from("todo").select("id,kind,material_id,state").eq("id", todoId).single(), "업무를 못 읽음"); if (!t) throw new Error("업무가 없습니다");
  changed(await db(sb).from("todo").update({ state: "dropped", why: String(why ?? "").trim() || t.why || "삭제했습니다" }).eq("id", todoId).select("id"), "업무를 못 삭제함");
  const alsoMaterial = Boolean(t.material_id && t.kind === "make");
  if (alsoMaterial) await dropMaterial(sb, t.material_id, why);
  return { material: alsoMaterial ? t.material_id : null };
}
/** 자료 삭제(줄이기 🔥) · 자료 dropped + 하는 중인 업무 dropped — 범위가 넓어 화면 이름도 「자료 삭제」로 다르다 */
export async function dropMaterial(sb, materialId, why = null) {
  changed(await db(sb).from("material").update({ state: "dropped" }).eq("id", materialId).select("id"), "자료를 못 삭제함");
  changed(await db(sb).from("todo").update({ state: "dropped", why: String(why ?? "").trim() || "못 따라가서 줄임(05 🔥)" }).eq("material_id", materialId).in("state", ["todo", "doing"]).select("id"), "업무를 못 삭제함", { zero: "ok" });
}
/** 🖨 한 번에 뽑기 · 인쇄 칸의 자료 전부: 자료 printed · 인쇄 업무 done. 장수는 화면이 셌다(printAllOf) */
export async function printAll(sb, materialIds = []) {
  const ids = [...new Set((materialIds ?? []).filter(Boolean))]; if (!ids.length) throw new Error("뽑을 자료가 없습니다");
  for (const id of ids) await stepMaterial(sb, id, "print");
  changed(await db(sb).from("todo").update({ state: "done", done_at: now() }).in("material_id", ids).in("kind", ["make", "print"]).in("state", ["todo", "doing"]).select("id"), "인쇄 업무를 완료 못 함", { zero: "ok" });   // 뽑았으면 만든 것이다
  return { materials: ids.length };
}
/** 📤 배부 · 자료 하나를 아이들에게(비면 배정 전부). 배부 업무도 같이 끝난다 */
export async function handOut(sb, materialId, studentIds = null) {
  let q = db(sb).from("material_give").update({ handed_at: now() }).eq("material_id", materialId).is("handed_at", null);   /* 0줄 허용 — 남은 배정이 없으면 0줄 · 아래에서 left 로 본다 */
  if (studentIds?.length) q = q.in("student_id", studentIds);
  const r = row(await q.select("student_id"), "배부를 못 적음") ?? [];
  const left = row(await db(sb).from("material_give").select("student_id").eq("material_id", materialId).is("handed_at", null), "배정을 못 읽음") ?? [];
  if (!left.length) {
    await stepMaterial(sb, materialId, "hand");
    /* (어96) 아이 확인을 받는 칸이면 **배부 카드는 안 닫는다** — 받아 갔는지가 아직 안 찍혔다(05 에서 닫는다) */
    const wait = Boolean((await listKinds(sb))?.find((x) => x.kind === "hand")?.confirm_got);
    changed(await db(sb).from("todo").update({ state: "done", done_at: now() }).eq("material_id", materialId).in("kind", wait ? ["make", "print"] : ["make", "print", "hand"]).in("state", ["todo", "doing"]).select("id"), "배부 업무를 완료 못 함", { zero: "ok" });
    if (wait) changed(await db(sb).from("todo").update({ state: "doing" }).eq("material_id", materialId).eq("kind", "hand").in("state", ["todo"]).select("id"), "배부 업무를 못 옮김", { zero: "ok" });
  }
  return { handed: r.length, left: left.length };
}
/** 📝 단원평가 출제 · 새로 만들기(아이 · 문법 분류 · 문항 수) → 낼 것(todo). 「출제 완료」가 made 로(01 카드가 그때부터 선다) */
export async function addUnitTest(sb, { studentId, topicId, qCount = 25 }) {
  if (!studentId) throw new Error("아이를 고르세요"); if (!topicId) throw new Error("문법 분류를 고르세요");
  const n = Number(qCount); if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error("문항 수는 1~200");
  const ins = row(await db(sb).from("unit_test").insert({ student_id: studentId, topic_id: topicId, q_count: n, state: "todo" }).select("id").single(), "단원평가를 못 세움");
  return ins.id;
}
export async function unitTestMade(sb, id, date) {
  const r = changed(await db(sb).from("unit_test").update({ state: "made", assigned_on: date }).eq("id", id).eq("state", "todo").select("id"), "단원평가를 수정 못 함"); if (!r?.length) throw new Error("이미 출제한 단원평가입니다");
}
/** (버) 저절로 선 단원평가 카드(todo_board unit_test_due · 루틴 11 의 「단원평가 본다」가 켜진 교재의 끝난 올린 기록)의 「출제 완료」 · 올린 기록(교재·회독·대단원|올린 기록 번호·덮는 것)을 새겨 made 로 세운다(01 카드가 그때부터 선다). 같은 올린 기록 두 번은 0149 색인이 막는다 */
export async function makeDueUnitTest(sb, { studentId, bookId, round, chapter = null, seq = null, covers = null, topicId = null, qCount = 25 }, date) {
  if (!studentId || !bookId || !round) throw new Error("아이·교재·회독이 비었습니다");
  const n = Number(qCount); if (!Number.isInteger(n) || n < 1 || n > 200) throw new Error("문항 수는 1~200");
  const ins = row(await db(sb).from("unit_test").insert({ student_id: studentId, topic_id: topicId || null, q_count: n, state: "made", assigned_on: date, book_id: bookId, round: Number(round), chapter: chapter || null, seq: seq == null ? null : Number(seq), covers: covers || null }).select("id").single(), "단원평가를 못 세움");
  return ins.id;
}
/** 📋 메모 · 12 의 + 업무과 같은 줄(kind note) */
export const addNote = (sb, { title, kind = null, dueOn = null, dueTime = null, studentIds = [], note = null, startOn = null }) => addTodo(sb, { title, kind, dueOn, dueTime, studentIds, note, startOn });   // (어88) 종류를 고르면 그 칸으로 선다   // (어78) 마감·시작일은 없어도 된다 — 퀵 메모가 같은 손을 쓴다(원칙-1)   // (어95) 아이는 여럿
/** ⏰ 반복 규칙 · 매달 N일 / 매주 요일 · 며칠 전부터. 만들면 바로 한 번 돌려 오늘 걸리는 것을 세운다 */
export async function addRepeat(sb, { name, every, day, weekday, lead, days, left }, date) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("무엇을 반복하는지 적으세요");
  const th = parseRepeat({ every, day, weekday, lead, days, left });
  const ins = row(await db(sb).from("auto_rule").insert({ kind: "repeat", name: nm, threshold: th, active: true }).select("id").single(), "반복 규칙을 못 넣음");
  const made = await rpc(sb, "run_repeats", { p_on: date }, "반복을 못 돌림");   // 키(규칙 · 마감 날)로 막으니 오늘 다시 돌려도 겹치지 않는다
  return { id: ins.id, made };
}
export async function setRepeatActive(sb, id, active) { const r = changed(await db(sb).from("auto_rule").update({ active: Boolean(active) }).eq("id", id).select("id"), "반복 규칙을 수정 못 함"); if (!r?.length) throw new Error("고쳐진 줄이 없습니다"); }
/** 시험이 밀리면 날짜도 밀린다 · 회차의 자료 업무 마감을 다시 맞춘다(DB 한 곳). lib/schedule setEnglishOn 이 부른다 */
export const syncExamTodos = (sb, examId) => rpc(sb, "sync_exam_todos", { p_exam: examId }, "업무 마감을 못 맞춤");
/** 🔁 재시험지 만들었음(05 카드 · 4단계-5) — 아직 안 본 재시험 줄에만 · 무를 수 있다. 시험을 보면 카드는 사라진다 */
export async function setQuizPaper(sb, quizId, on) {
  const r = changed(await db(sb).from("quiz").update({ paper_at: on ? now() : null }).eq("id", quizId).eq("state", "planned").not("retry_of", "is", null).select("id"), "재시험지 표시를 못 적음", { zero: "ok" });
  if (!r?.length) throw new Error("아직 안 본 재시험 줄이 아닙니다");
}
/** 04 자료 항목을 단원으로(4단계-5) — 이름만 적던 항목에 범위의 단원을 잇는다(비우면 이름만). 항목 이름은 그대로 둔다 */
export async function setItemUnit(sb, itemId, unitId) {
  const r = changed(await db(sb).from("material_item").update({ unit_id: unitId || null }).eq("id", itemId).select("id"), "항목의 단원을 못 적음");
  if (!r?.length) throw new Error("고쳐진 항목이 없습니다(검사-⑪)");
}
/** 크론 한 바퀴 앞 · 오늘 반복을 돌린다(하루 한 번 · day_ran 이 막는다 · 05 첫 열기와 같은 손 · 뼈대-9: 크론은 새 셈을 안 만든다) */
export async function runRepeatsDaily(sb, today) { await rpc(sb, "run_repeats", { p_on: today }, "반복을 못 돌림"); }
if (!beforeRun.includes(runRepeatsDaily)) beforeRun.push(runRepeatsDaily);
export const TODO_KINDS = KINDS;
/* ── (어80) 업무 분류 표(0179 v2.todo_kind) — 원장님 2026-09-18 「업무 칸반보드에 분류자체를 추가/수정/삭제가 되게해줘」 ──
   지우지 않는다(대전제-6): 내리기는 state='off' · 복구가 짝이다. 앱이 카드를 내는 열 벌(app=true)은 못 내린다. */
const isShowOn = (v) => SHOW_ON.some(([x]) => x === v);
/** 표가 아직 없는 DB 에서는 **null** 을 준다 — 화면은 씨앗(KINDS)으로 그리고, 분류를 고치는 자리만 감춘다(대전제-27) */
export async function listKinds(sb) {
  /* ⚠️ (어96) 칸 이름을 **안 적는다**(`*`) — 0185 가 칸 둘을 더하는데, 이름을 적어 두면 그 SQL 을 넣기 전 DB 에서
     이 조회가 통째로 거절돼 05 가 안 열린다(대전제-27 ① · (어78) 사고). 붙은 표가 아니라 제 표라 무게도 같다. */
  const { data, error } = await db(sb).from("todo_kind").select("*").order("ord");
  if (!error) return data ?? [];
  if (/could not find the table|PGRST205|does not exist/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) return null;   // 0179 를 아직 안 붙이셨다 — 화면은 살아야 한다((어78) 사고)
  throw new Error(`분류를 못 읽음: ${saidBy(error.message)}`);
}
const kindsOrThrow = async (sb) => { const k = await listKinds(sb); if (k === null) throw new Error("업무 분류 표가 아직 없습니다. 붙여넣기 SQL docs/sql-paste/0179.sql 을 넣으신 뒤 다시 해 보세요"); return k; };
export async function addKind(sb, { name, cls = "", showOn = "todo", notifyWay = undefined, confirmGot = undefined }) {
  const t = String(name ?? "").trim(); if (!t) throw new Error("분류 이름을 적으세요");
  if (!isShowOn(showOn)) throw new Error(`어디에 보일지가 아닙니다: ${showOn}`);
  const list = await kindsOrThrow(sb);
  if (list.some((k) => String(k.name).trim() === t)) throw new Error("같은 이름의 분류가 이미 있습니다");
  const ord = Math.max(0, ...list.map((k) => Number(k.ord) || 0)) + 10;
  const kind = "u" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);   // 뜻 없는 열쇠 — 이름은 언제든 고치실 수 있어야 하니 이름을 열쇠로 쓰지 않는다
  const ins = row(await db(sb).from("todo_kind").insert({ kind, name: t, cls: String(cls ?? ""), ord, show_in: showOn }).select("kind").single(), "분류를 못 넣음");
  await setKindSwitches(sb, kind, { notifyWay, confirmGot });
  return ins.kind;
}
/** (어96) 알림·확인 스위치(0185) — 원장님 2026-09-19 「그냥 칸반 자체에 이 기능이 있고 그걸 내가 쓸지말지 결정해야할듯」.
 *  ⚠️ **새 칸이라 따로 적는다**(대전제-27 ②) — 0185 를 아직 안 붙이신 DB 에서도 분류 넣기·고치기는 살아야 한다.
 *     다만 **켜 달라고 하셨는데 못 켰으면 조용히 넘기지 않는다**(대전제-0) — 어느 SQL 인지 말한다. */
async function setKindSwitches(sb, kind, { notifyWay, confirmGot } = {}) {
  const patch = {};
  if (notifyWay !== undefined && notifyWay !== null) { if (!isNotifyWay(notifyWay)) throw new Error(`알릴 곳이 아닙니다: ${notifyWay}`); patch.notify_way = notifyWay; }
  if (confirmGot !== undefined && confirmGot !== null) patch.confirm_got = Boolean(confirmGot);
  if (!Object.keys(patch).length) return;
  const wants = (patch.notify_way && patch.notify_way !== "none") || patch.confirm_got === true;
  const { error, count } = await db(sb).from("todo_kind").update(patch, { count: "exact" }).eq("kind", kind);
  if (!error) { if (!count) throw new Error(`알림·확인 스위치를 못 적음: ${ZERO}`); return; }
  if (!/does not exist|schema cache|PGRST204/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw new Error(`알림·확인 스위치를 못 적음: ${saidBy(error.message)}`);
  if (wants) throw new Error(`분류는 적었지만 알림·확인 스위치는 못 적었습니다: ${saidBy(error.message)}`);
}
export async function editKind(sb, kind, { name, cls, showOn, ord, notifyWay, confirmGot } = {}) {
  const list = await kindsOrThrow(sb); const cur = list.find((k) => k.kind === kind); if (!cur) throw new Error("분류가 없습니다");
  const patch = {};
  if (name !== undefined) { const t = String(name).trim(); if (!t) throw new Error("분류 이름을 적으세요");
    if (list.some((k) => k.kind !== kind && String(k.name).trim() === t)) throw new Error("같은 이름의 분류가 이미 있습니다"); patch.name = t; }
  if (cls !== undefined) patch.cls = String(cls ?? "");
  if (showOn !== undefined) { if (!isShowOn(showOn)) throw new Error(`어디에 보일지가 아닙니다: ${showOn}`); patch.show_in = showOn; }
  if (ord !== undefined) patch.ord = Number(ord) || 0;
  if (!Object.keys(patch).length && notifyWay === undefined && confirmGot === undefined) throw new Error("고칠 것이 없습니다");
  if (Object.keys(patch).length) changed(await db(sb).from("todo_kind").update(patch).eq("kind", kind).select("kind"), "분류를 수정 못 함");
  await setKindSwitches(sb, kind, { notifyWay, confirmGot });   // (어96) 새 칸은 따로(대전제-27)
}
/** 차례 바꾸기 — 이웃과 ord 를 맞바꾼다(▲▼). 한 벌로 두 줄을 고친다 */
export async function moveKindOrder(sb, kind, dir = -1) {
  const list = kindList(await kindsOrThrow(sb)); const i = list.findIndex((k) => k.kind === kind); if (i < 0) throw new Error("분류가 없습니다");
  const j = i + (dir < 0 ? -1 : 1); if (j < 0 || j >= list.length) throw new Error("더 갈 곳이 없습니다");
  const a = list[i], b = list[j], ao = a.ord === b.ord ? a.ord + (dir < 0 ? 1 : -1) : b.ord;
  changed(await db(sb).from("todo_kind").update({ ord: ao }).eq("kind", a.kind).select("kind"), "분류 차례를 수정 못 함");
  changed(await db(sb).from("todo_kind").update({ ord: a.ord }).eq("kind", b.kind).select("kind"), "분류 차례를 수정 못 함");
}
/** 내리기 — 지우지 않는다(대전제-6). 앱이 카드를 내는 분류는 못 내린다(카드가 갈 곳을 잃는다) */
export async function dropKind(sb, kind) {
  const list = await kindsOrThrow(sb); const cur = list.find((k) => k.kind === kind); if (!cur) throw new Error("분류가 없습니다");
  if (cur.app) throw new Error("앱이 저절로 만드는 분류라 못 내립니다. 이름·색·차례는 고치실 수 있습니다");
  changed(await db(sb).from("todo_kind").update({ state: "off" }).eq("kind", kind).select("kind"), "분류를 못 삭제함");
}
export async function restoreKind(sb, kind) {
  changed(await db(sb).from("todo_kind").update({ state: "active" }).eq("kind", kind).select("kind"), "분류를 못 복구함");
}
/** 고른 업무를 다른 분류로 — 원장님 2026-09-18 「세부내용의 일괄처리 · 분류 옮기기가능하게」.
 *  한 문장으로 옮긴다(옛 학사일정 226줄을 한 줄씩 부르면 화면이 멈춘다) · 분류 표가 없어도 산다(v2.todo.kind 는 예전부터 있던 칸) */
export async function moveKind(sb, ids = [], kind) {
  const list = [...new Set((ids ?? []).filter(Boolean))]; if (!list.length) throw new Error("고른 업무가 없습니다");
  const k = String(kind ?? "").trim(); if (!k) throw new Error("옮길 분류를 고르세요");
  const r = changed(await db(sb).from("todo").update({ kind: k }).in("id", list).select("id"), "분류를 못 옮김");
  return { n: r?.length ?? 0 };
}
/** 여럿 한 번에((어28)-③ · 대전제-20) · done · undo · due(value = 날짜) · drop. 하나씩의 손을 차례로 · 막히면 그 줄부터 멈춘다 */
export async function todoMany(sb, ids = [], op, value = null) {
  const list = [...new Set((ids ?? []).filter(Boolean))]; if (!list.length) throw new Error("고른 업무가 없습니다");
  const one = { done: (id) => finishTodo(sb, id), undo: (id) => undoTodo(sb, id), due: (id) => setTodoDue(sb, id, value), drop: (id) => dropTodo(sb, id, null), restore: (id) => restoreTodo(sb, id) }[op];   /* (어80) 복구 — 뺀 것을 되살린다 */
  if (!one) throw new Error(`할 수 없는 일입니다: ${op}`);
  let n = 0; for (const id of list) { await one(id); n++; } return { n };
}
