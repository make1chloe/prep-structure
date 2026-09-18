/** 일정 12 의 손 · 판 읽기(한 벌 schedule_board) · 휴강 넣기·취소 · 업무 · 시험(손으로) · 영어 시험일 · 반 보강일(8회 채우기) · 아이 보강 잡기(02c 와 같은 손 planSave).
 *  지우지 않는다(대전제-6): 휴강은 state off · 보강은 cancelled · 시험은 cancelled. 판단은 lib/schedule-plan.js(순수) */
import { db } from "./supabase.js";
import { planSave } from "./plan.js";
import { AREAS } from "./routine-plan.js";
import { syncStops } from "./exam.js";
import { manualKey } from "./exam-plan.js";
import { notify } from "./notify.js";
import { changed, row } from "./sqlError.js";
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""));
const isYm = (ym) => /^\d{4}-\d{2}$/.test(String(ym ?? ""));
export async function scheduleBoard(sb, ym, date) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  const { data, error } = await db(sb).rpc("schedule_board", { p_ym: ym, p_on: date });
  if (error) throw new Error(`일정을 못 읽음: ${error.message}`);
  if (!data) throw new Error("일정은 학원 사람의 화면입니다");
  return data;
}
/** 가져오기 판 한 벌(0120 import_board) · 12b */
export async function importBoard(sb, date) {
  const { data, error } = await db(sb).rpc("import_board", { p_on: date });
  if (error) throw new Error(`가져오기 화면을 못 읽음: ${error.message}`);
  if (!data) throw new Error("학사일정 가져오기는 학원 사람의 화면입니다");
  return data;
}
/** + 휴강 — 날짜 · 반(비면 전체) · 사유. 같은 날 같은 반이 이미 있으면 되살린다(무른 것) */
export async function addHoliday(sb, { date, classId = null, reason = null }) {
  if (!isDate(date)) throw new Error(`날짜가 아닙니다: ${date}`);
  let q = db(sb).from("holiday").select("id,state").eq("date", date); q = classId ? q.eq("class_id", classId) : q.is("class_id", null);
  const ex = row(await q.maybeSingle(), "휴강을 못 읽음");
  const r = String(reason ?? "").trim() || null;
  if (ex) { changed(await db(sb).from("holiday").update({ state: "on", reason: r }).eq("id", ex.id).select("id"), "휴강을 못 되살림"); return ex.id; }
  const ins = row(await db(sb).from("holiday").insert({ date, class_id: classId, reason: r, state: "on" }).select("id").single(), "휴강을 못 넣음");
  return ins.id;
}
/** 휴강 취소 · 지우지 않고 off(0075). 0줄이면 실패(검사-⑪) */
export async function undoHoliday(sb, id) {
  const r = changed(await db(sb).from("holiday").update({ state: "off" }).eq("id", id).eq("state", "on").select("id"), "휴강을 못 취소함");
  if (!r?.length) throw new Error("이미 무른 휴강입니다");
}
/** + 업무 · 한 줄(제목 · 날짜 · 시각 · 아이 · (어78) 시작일). 05 업무 화면이 서면 그쪽이 주인.
 *  (어78) **마감은 없어도 된다**(원장님 2026-09-17 「필요하면 마감 날짜도 설정할 수 있고」) — 퀵 메모는
 *  떠오른 것을 먼저 적는 자리라 날짜를 물으면 적기를 멈춘다. 없는 마감을 오늘로 넣지 않는다(대전제-0) ·
 *  판은 이미 마감 없는 줄을 맨 뒤로 보내고(todo_board order by due_on nulls last) 글도 「마감 없음」이 있다(todo-plan). */
export async function addTodo(sb, { title, dueOn = null, dueTime = null, studentId = null, note = null, startOn = null }) {
  const t = String(title ?? "").trim(); if (!t) throw new Error("업무를 적으세요");
  if (dueOn && !isDate(dueOn)) throw new Error(`날짜가 아닙니다: ${dueOn}`);
  if (startOn && !isDate(startOn)) throw new Error(`시작일이 날짜가 아닙니다: ${startOn}`);
  if (startOn && dueOn && startOn > dueOn) throw new Error("시작일이 마감보다 늦습니다");
  const payload = { kind: "note", title: t, note: String(note ?? "").trim() || null, due_on: dueOn || null, due_time: dueTime || null, student_id: studentId || null };
  if (startOn) payload.start_on = startOn;   // ⚠️ (어78 사고) **값이 있을 때만** 새 칸을 적는다 — 0178 이 아직 안 들어간 DB 에서도 퀵 메모가 들어가야 한다
  const ins = row(await db(sb).from("todo").insert(payload).select("id").single(), "업무를 못 넣음");
  return ins.id;
}
export async function doneTodo(sb, id) {
  const r = changed(await db(sb).from("todo").update({ state: "done", done_at: new Date().toISOString() }).eq("id", id).in("state", ["todo", "doing"]).select("id"), "업무를 못 끝냄", { zero: "ok" });
  if (!r?.length) throw new Error("이미 끝난 업무입니다");
}
/** + 시험(손으로) · 학교(중간·기말: 학교 · 학년 · 기간 · 영어 시험일) / 전국(수능·모의: 이름 · 날 하나). 출처 manual · 받아와도 안 덮는다(확정-㊲) */
export async function addExam(sb, { scope, schoolId = null, grade = null, name, termFrom, termTo = null, englishOn = null, date = null }) {
  const nm = String(name ?? "").trim(); if (!nm) throw new Error("시험 이름을 적으세요");
  if (!["school", "national"].includes(scope)) throw new Error(`유형이 아닙니다: ${scope}`);
  if (scope === "school" && !schoolId) throw new Error("학교를 고르세요");
  if (!isDate(termFrom)) throw new Error("시작 날짜를 적으세요");
  const to = termTo && isDate(termTo) ? termTo : termFrom;
  if (to < termFrom) throw new Error("끝이 시작보다 앞섭니다");
  if (englishOn && !isDate(englishOn)) throw new Error(`영어 시험일이 날짜가 아닙니다: ${englishOn}`);
  const g = grade == null || grade === "" ? null : Number(grade);
  const key = manualKey({ scope, schoolId, grade: g, name: nm, termFrom });
  const dup = row(await db(sb).from("exams").select("id,state").eq("source_key", key).maybeSingle(), "회차를 못 읽음");
  if (dup) throw new Error(dup.state === "active" ? "같은 회차가 이미 있습니다(같은 학교·학년·이름·시작날)" : "같은 회차를 전에 물렸습니다. 이름이나 시작날을 다르게");
  const ins = row(await db(sb).from("exams").insert({ scope, school_id: scope === "school" ? schoolId : null, grade: Number.isInteger(g) ? g : null, name: nm, term_from: termFrom, term_to: to, english_on: englishOn || null, source: "manual", source_key: key }).select("id").single(), "시험을 못 넣음");
  if (englishOn && date) await syncStops(sb, ins.id, date);   // 영어 시험일을 같이 넣었으면 교재 보류 창도 같이(06b)
  return ins.id;
}
/** 영어 시험일 — 나이스는 안 준다. 한 줄 넣으면 전날 등원·안내·마감이 선다(뒤 단계). 비우기도 된다 */
export async function setEnglishOn(sb, examId, englishOn, date = null) {
  if (englishOn && !isDate(englishOn)) throw new Error(`날짜가 아닙니다: ${englishOn}`);
  const r = changed(await db(sb).from("exams").update({ english_on: englishOn || null }).eq("id", examId).select("id"), "영어 시험일을 못 적음");
  if (!r?.length) throw new Error("고쳐진 줄이 없습니다(검사-⑪)");
  if (date) await syncStops(sb, examId, date);   // 영어 시험일이 서면 교재 보류 창도 선다(06b · 한 줄 넣으면 같이 서는 것)
  const { error } = await db(sb).rpc("sync_exam_todos", { p_exam: examId });   // 시험이 밀리면 자료 업무 날짜도 밀린다(확정-㉛ · 0125 한 곳)
  if (error) throw new Error(`업무 마감을 못 맞춤: ${error.message}`);
}
export async function cancelExam(sb, examId, date = null) {
  const r = changed(await db(sb).from("exams").update({ state: "cancelled" }).eq("id", examId).eq("state", "active").select("id"), "시험을 못 취소함");
  if (!r?.length) throw new Error("이미 물린 시험입니다");
  if (date) await syncStops(sb, examId, date);   // 물리면 묶인 보류가 풀린다
}
/** 📅 보강일 잡기(반) — 8회 채우기: 그 반 아이 전부에게 「빠진 날 없는 보강」 줄 하나씩(of_date null · set). 이미 그날 있으면 건너뛴다 */
export async function classMakeupDay(sb, { classId, onDate, atTime = null, reason = "8회 채우기", date }) {
  if (!isDate(onDate)) throw new Error(`날짜가 아닙니다: ${onDate}`);
  const members = row(await db(sb).rpc("class_roster", { p_class: classId, p_on: date }), "반 아이들을 못 읽음") ?? [];
  if (!members.length) throw new Error("이 반에 아이가 없습니다");
  const ids = members.map((m) => m.student_id);
  const had = row(await db(sb).from("makeup").select("student_id").in("student_id", ids).eq("on_date", onDate).is("of_date", null).neq("state", "cancelled"), "보강을 못 읽음") ?? [];
  const todo = ids.filter((id) => !had.some((h) => h.student_id === id));
  if (todo.length) row(await db(sb).from("makeup").insert(todo.map((student_id) => ({ student_id, of_date: null, on_date: onDate, at_time: atTime || null, state: "set", reason: String(reason ?? "").trim() || "8회 채우기" }))).select("id"), "보강일을 못 잡음");
  return { made: todo.length, had: had.length };
}
/** 반 보강일 취소 · 그날 그 반 아이들의 반 보강 줄을 cancelled 로 */
export async function cancelClassMakeupDay(sb, { ids }) {
  const r = changed(await db(sb).from("makeup").update({ state: "cancelled" }).in("id", ids ?? []).is("of_date", null).select("id"), "보강일을 못 취소함", { zero: "ok" });
  return (r ?? []).length;
}
/** + 결석 예정((어52) · 원장님 2026-09-16 「결석예정의 경우 어느학생인지까지 연결되어서 오늘학습등 다른 페이지에 연결되어야해」) — 02c 달력과 **같은 손**(planSave · 결석 예정은 보강 줄 한 벌 of_date, state todo · 0109).
 *  일정 12 최상단에서 넣어도 아이에 붙으니 01 오늘 수업(줄 상태 · 반 알약 · 첫 아이 건너뜀) · 17 대시보드 · 02c · 07 · 09 · 10 안내가 저절로 본다(대전제-24) */
export async function addAbsence(sb, { studentId, date, reason = null }, by) {
  if (!studentId) throw new Error("아이를 고르세요");
  return planSave(sb, studentId, date, { kind: "absent", reason, makeupOn: null, makeupAt: null }, by);
}
/** 결석 예정에 고를 아이 — 다니는 아이 이름만(일정 12 파도에 얹는다 · 속도-1) */
export async function studentPicks(sb) {
  return row(await db(sb).from("students").select("id,name").eq("state", "active").order("name"), "아이를 못 읽음") ?? [];
}
/** 아이 보강 잡기 — 02c 와 같은 손(planSave: 결석 그대로 · 보강 날짜·시각). 앱이 시각을 제안하지 않는다(확정-㉔) */
export async function setMakeup(sb, { studentId, ofDate, onDate, atTime = null, reason = null, waived = false }, by) {
  if (!waived && !isDate(onDate)) throw new Error("보강 날짜를 고르세요. 앱이 제안하지 않습니다");
  return planSave(sb, studentId, ofDate, { kind: "absent", reason, makeupOn: waived ? null : onDate, makeupAt: waived ? null : atTime, waived }, by);
}
/** 학교 홈페이지 주소 — 나이스에 없는 학교는 여기서 본다(확장은 다음) */
export async function setSiteUrl(sb, schoolId, url) {
  const u = String(url ?? "").trim();
  if (u && !/^https?:\/\//.test(u)) throw new Error("주소는 http(s):// 로 시작합니다");
  const r = changed(await db(sb).from("schools").update({ site_url: u || null }).eq("id", schoolId).select("id"), "주소를 못 적음");
  if (!r?.length) throw new Error("고쳐진 줄이 없습니다(검사-⑪)");
}
/** 전국으로 볼 이름 더하기(exam_word · 받아올 때 이름으로 유형을 판정, 확정-㊲) */
export async function addExamWord(sb, word) {
  const w = String(word ?? "").trim(); if (!w) throw new Error("낱말을 적으세요");
  const ex = row(await db(sb).from("exam_word").select("word").eq("word", w).maybeSingle(), "낱말을 못 읽음");
  if (ex) return false;
  row(await db(sb).from("exam_word").insert({ word: w, scope: "national" }).select("word"), "낱말을 못 더함");
  return true;
}
export const AREA_NAMES = AREAS.map(([a]) => a);
/** 그 달 일정 확정(4단계-3b · 원장님 9/7 ㉚ 「예상수업일정보내기 기능 필요없음 무조건확정후 알림」) · 도장은 살아 있는 반마다 확정 하나(정의자 confirm_month) → 그 반 아이마다 학부모에게 「수업 일정 안내」 한 통(유형 schedule · 꼬리표 month-달-아이 · 다시 확정하면 같은 꼬리표라 폰에는 한 통으로 보인다 · 발송 이력은 notify 가 남긴다). 지난 달은 확정하지 않는다 */
export async function confirmMonth(svc, sb, ym, date) {
  if (!isYm(ym)) throw new Error(`달이 아닙니다: ${ym}`);
  if (String(ym) < String(date).slice(0, 7)) throw new Error("지난 달은 확정하지 않습니다");
  const r = row(await db(sb).rpc("confirm_month", { p_ym: ym }), "확정을 못 함") ?? {};
  const on = String(ym) === String(date).slice(0, 7) ? date : `${ym}-01`;   // 명단 기준일 — 판(schedule_board members)과 같은 셈: 그 달 1일과 오늘 중 늦은 쪽
  const ids = new Set();
  for (const cid of r.class_ids ?? []) for (const m of row(await db(sb).rpc("class_roster", { p_class: cid, p_on: on }), "반 아이들을 못 읽음") ?? []) ids.add(m.student_id);
  let sent = 0, failed = 0, sink = null;
  for (const sid of ids) { const x = await notify(svc, { kind: "schedule", studentId: sid, url: `/parent/cal?s=${sid}`, tag: `month-${ym}-${sid}`, why: { table: "month_confirm", ym } }); sink = x.sink; sent += x.sent ?? 0; failed += x.failed ?? 0; }
  return { classes: r.classes ?? 0, n: ids.size, sent, failed, sink };
}
