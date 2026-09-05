/** 진도(v2.progress) 한 벌 — 검사 ○△✕ 가 단원 진도가 되고(확정-⑳ · 검사-⑭), 진도 체크(02b)에서 원장님이 찍고 되돌리며(확정-㊶), 마감 때 메모로 대신한 교재의 오늘 학습 소단원이 저절로 ○ 가 된다(확정-㊳ — 그 교재만).
 *  진도 나무는 표 하나 · 보기 넷(확정-51) — 02b·08·14·01 은 이 표를 그린다. 커서(다음 소단원)는 저장하지 않고 v2.todo_units 가 여기서 세어 낸다(확정-④).
 *  회독은 배정(student_book.round)에서. 판단(무엇이 done 이 되나)은 lib/progress-plan.js 순수 함수 */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { fromCheck, merge, memoDone, chapterSummary, TRI } from "./progress-plan.js";
export { TRI };
const alive = (q, date) => q.lte("from_date", date).or(`to_date.is.null,to_date.gte.${date}`);
async function roundOf(sb, studentId, bookId, date) {
  const { data, error } = await alive(db(sb).from("student_book").select("round,order_basis").eq("student_id", studentId).eq("book_id", bookId), date).order("from_date", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`배정을 못 읽음: ${error.message}`);
  return data?.round ?? 1;
}
/** 한 단원에 상태를 쓴다(있으면 합쳐서) — by: 'check' 검사에서 · 'staff' 원장님이 손으로 · force 면 내려가는 것도 허용(되돌리기) */
async function write(sb, { studentId, unitId, round, status, by, date, force = false, why = null }) {
  const { data: prev } = await db(sb).from("progress").select("status").eq("student_id", studentId).eq("unit_id", unitId).eq("round", round).maybeSingle();
  const next = force ? status : merge(prev?.status ?? null, status);
  if (!next || next === (prev?.status ?? null)) return { changed: false, status: prev?.status ?? null };
  const row = { student_id: studentId, unit_id: unitId, round, status: next, last_by: by, confirmed: true, marked_on: date, done_on: next === "done" ? date : null, skip_why: next === "skip" ? why : null };
  const { error } = await db(sb).from("progress").upsert(row, { onConflict: "student_id,unit_id,round" });
  if (error) throw new Error(`진도를 못 씀: ${error.message}`);
  return { changed: true, status: next };
}
/** 검사 줄 하나가 검사됐다 → 그 단원의 진도(○ done · △ doing · 예습·조각은 완료 아님). checkItem 이 부른다 */
export async function markFromCheck(sb, item, sheet) {
  const status = fromCheck(item);
  if (!status) return null;
  const { data: u, error } = await db(sb).from("units").select("id,book_id").eq("id", item.unit_id).single();
  if (error || !u) throw new Error(`단원을 못 읽음: ${error?.message ?? "없음"}`);
  const round = await roundOf(sb, sheet.student_id, u.book_id, sheet.date);
  return write(sb, { studentId: sheet.student_id, unitId: item.unit_id, round, status, by: "check", date: sheet.date });
}
async function sheetRow(sb, sheetId) {
  await assertOpen(sb, sheetId);
  const { data, error } = await db(sb).from("day_sheet").select("id,student_id,date").eq("id", sheetId).single();
  if (error || !data) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  return data;
}
/** 진도 체크(02b)가 여는 것 — 교재의 소단원 전부 · 이 회독의 진도 · 오늘 학습 소단원(✍ 메모로 자동 ○ 후보) · 메모. 읽기만이라 마감된 판도 연다 */
export async function tree(sb, sheetId, bookId) {
  const { data: sheet, error } = await db(sb).from("day_sheet").select("id,student_id,date,closed_at").eq("id", sheetId).single();
  if (error || !sheet) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  const round = await roundOf(sb, sheet.student_id, bookId, sheet.date);
  const [units, prog, items, mark, book] = await Promise.all([
    db(sb).from("units").select("id,chapter,mid,sub,activity,is_workbook,sort,page_start,page_end,q_count,short,label").eq("book_id", bookId).eq("state", "active").order("sort"),
    db(sb).from("progress").select("unit_id,status,last_by,confirmed,marked_on,done_on,skip_why").eq("student_id", sheet.student_id).eq("round", round),
    db(sb).from("day_item").select("unit_id,slot,off,range_note,item_id,carry_of,units!inner(book_id)").eq("sheet_id", sheetId).eq("units.book_id", bookId).eq("slot", "class").not("item_id", "is", null).is("carry_of", null),
    db(sb).from("sheet_book").select("class_memo").eq("sheet_id", sheetId).eq("book_id", bookId).maybeSingle(),
    db(sb).from("books").select("id,name").eq("id", bookId).single(),
  ]);
  for (const r of [units, prog, items, mark, book]) if (r.error) throw new Error(`진도 나무를 못 읽음: ${r.error.message}`);
  const ids = new Set((units.data ?? []).map((u) => u.id));
  const summary = chapterSummary(units.data ?? [], (prog.data ?? []).filter((p) => ids.has(p.unit_id)));
  const today = [...memoDone((items.data ?? []).map((i) => ({ unit_id: i.unit_id, slot: i.slot, off: i.off, range_note: i.range_note }))).keys()];
  return { book: book.data, round, closed: Boolean(sheet.closed_at), memo: mark.data?.class_memo ?? "", today, ...summary, marks: Object.fromEntries((prog.data ?? []).map((p) => [p.unit_id, p])) };
}
/** 02b 에서 원장님이 찍는다 — ○ done · ◐ doing · · none. 내려가는 것도 된다(되돌리기 한 자리) */
export async function setUnit(sb, sheetId, unitId, status) {
  if (!TRI.some(([k]) => k === status)) throw new Error(`진도 값이 아닙니다: ${status}`);
  const sheet = await sheetRow(sb, sheetId);
  const { data: u, error } = await db(sb).from("units").select("id,book_id").eq("id", unitId).single();
  if (error || !u) throw new Error(`단원을 못 읽음: ${error?.message ?? "없음"}`);
  const round = await roundOf(sb, sheet.student_id, u.book_id, sheet.date);
  return write(sb, { studentId: sheet.student_id, unitId, round, status, by: "staff", date: sheet.date, force: true });
}
/** 이 대단원 건너뛰기 — 안 끝난 소단원을 skip 으로(지운 것이 아니라 「안 한 채로 넘어간 것」, 까닭이 남는다). 잠긴 대단원을 푸는 손잡이 */
export async function skipChapter(sb, sheetId, bookId, chapter, why = "대단원 건너뜀 — 원장님") {
  const sheet = await sheetRow(sb, sheetId);
  const round = await roundOf(sb, sheet.student_id, bookId, sheet.date);
  const [units, prog] = await Promise.all([
    db(sb).from("units").select("id").eq("book_id", bookId).eq("chapter", chapter).eq("state", "active"),
    db(sb).from("progress").select("unit_id,status").eq("student_id", sheet.student_id).eq("round", round),
  ]);
  if (units.error) throw new Error(`소단원을 못 읽음: ${units.error.message}`);
  const st = new Map((prog.data ?? []).map((p) => [p.unit_id, p.status]));
  const todo = (units.data ?? []).filter((u) => !["done", "skip"].includes(st.get(u.id) ?? "none"));
  await Promise.all(todo.map((u) => write(sb, { studentId: sheet.student_id, unitId: u.id, round, status: "skip", by: "staff", date: sheet.date, force: true, why })));
  return { skipped: todo.length };
}
/** 마감 때 — 학습 메모가 있는 교재의 오늘 학습 소단원을 ○ 로(조각은 ◐). 그 교재만(확정-㊳). closeSheet 가 부른다(판은 이 뒤에 닫힌다) */
export async function autoDoneOnClose(sb, sheetId) {
  const { data: sheet, error } = await db(sb).from("day_sheet").select("id,student_id,date").eq("id", sheetId).single();
  if (error || !sheet) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  const { data: marks, error: e2 } = await db(sb).from("sheet_book").select("book_id,class_memo").eq("sheet_id", sheetId).not("class_memo", "is", null);
  if (e2) throw new Error(`판×교재를 못 읽음: ${e2.message}`);
  const books = (marks ?? []).filter((m) => String(m.class_memo).trim());
  if (!books.length) return { units: 0 };
  // 루틴이 깐 학습 줄만(나머지 줄·손으로 더한 줄은 아니다) — 메모로 대신한 것은 그날 깔린 학습이다
  const { data: items, error: e3 } = await db(sb).from("day_item").select("unit_id,slot,off,range_note,item_id,carry_of,units!inner(book_id)").eq("sheet_id", sheetId).eq("slot", "class").not("item_id", "is", null).is("carry_of", null).in("units.book_id", books.map((b) => b.book_id));
  if (e3) throw new Error(`판의 줄을 못 읽음: ${e3.message}`);
  let n = 0;
  for (const b of books) {
    const round = await roundOf(sb, sheet.student_id, b.book_id, sheet.date);
    const want = memoDone((items ?? []).filter((i) => i.units?.book_id === b.book_id).map((i) => ({ unit_id: i.unit_id, slot: i.slot, off: i.off, range_note: i.range_note })));
    for (const [unitId, status] of want) { const r = await write(sb, { studentId: sheet.student_id, unitId, round, status, by: "staff", date: sheet.date }); if (r.changed) n++; }
  }
  return { units: n };
}
