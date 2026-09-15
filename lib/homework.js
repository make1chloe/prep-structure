/** 숙제 검사 · 오늘 학습 · 오늘 숙제 — 판 안의 줄(v2.day_item) 한 벌.
 *  검사: ○ done · △ weak(어디까지 done_note) · ✕ missing. 나머지는 「오늘 학습으로 · 다음 숙제로 · 남아서」 — 조각이 원본을 가리킨다(carry_of, 확정-⑳).
 *  지우지 않는다 — 옮기는 것은 slot 을 바꾸는 것(대전제-6). */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { CHECK, isUnchecked } from "./status.js";
import { layRoutine, reorderToday } from "./routine.js";
import { readyBooks } from "./routine-plan.js";
import { markFromCheck } from "./progress.js";
import { changed } from "./sqlError.js";
export const STATUS = Object.freeze(Object.fromEntries(CHECK));
/** 「다 ○」((어24)) — 판의 안 본 검사 줄을 전부 ○. 줄마다 checkItem(진도·깔기 방아쇠 그대로 — 마지막 줄에서 오늘 학습이 깔린다) */
export async function checkAll(sb, sheetId) {
  const { data, error } = await db(sb).from("day_item").select("id,status").eq("sheet_id", sheetId).eq("slot", "check");
  if (error) throw new Error(`검사 줄을 못 읽음: ${error.message}`);
  const todo = (data ?? []).filter(isUnchecked);
  for (const it of todo) await checkItem(sb, it.id, "done");
  return { marked: todo.length };
}
export const UPTO = Object.freeze(["시작만", "절반", "거의 다"]);
export const REST = Object.freeze({ class: "오늘 학습으로", home: "다음 숙제로", stay: "남아서" });
async function sheetOf(sb, itemId) {
  const { data } = await db(sb).from("day_item").select("id,sheet_id,slot,range_note,memo,unit_id,item_id,status,done_note,carry_of,units(book_id)").eq("id", itemId).maybeSingle();
  if (!data) throw new Error("항목이 없습니다"); await assertOpen(sb, data.sheet_id); return data;
}
export async function checkItem(sb, itemId, status, doneNote = null) {
  if (!STATUS[status]) throw new Error(`검사 값이 아닙니다: ${status}`);
  const it = await sheetOf(sb, itemId);
  changed(await db(sb).from("day_item").update({ status, done_note: status === "weak" ? doneNote : null }, { count: "exact" }).eq("id", itemId), "검사를 못 씀");
  // 검사가 곧 진도(확정-⑳ · 검사-⑭) — ○ done · △ doing, 예습·조각은 완료 아님
  const { data: sh } = await db(sb).from("day_sheet").select("id,student_id,date").eq("id", it.sheet_id).single();
  if (sh) await markFromCheck(sb, { ...it, status }, sh);
  // ① 숙제 검사가 방아쇠(확정-⑨) · 이 판의 검사 줄이 다 검사됐으면 ②③ 을 깐다(이미 깔렸으면 layRoutine 이 안 깐다)
  // (어35) 원장님 9/15 「숙제검사를 먼저 한 영역이 오늘학습에 먼저 배정 → 완료되면 루틴 순서대로 재배열」: 이 교재의 검사 줄이 다 검사되는 순간 그 교재부터 깔고(readyBooks), 마지막 검사에서 나머지를 깔고 루틴 차례로 다시 세운다(reorderToday · 시작한 줄은 앞에).
  //   이미 검사한 줄을 고치는 것은 방아쇠가 아니다(선생님이 ▲▼ 로 세운 차례가 안 뒤집힌다)
  const wasUnchecked = isUnchecked(it);
  const { data: left, error: e2 } = await db(sb).from("day_item").select("id,status,unit_id,units(book_id)").eq("sheet_id", it.sheet_id).eq("slot", "check");
  if (e2) throw new Error(`검사 줄을 못 읽음: ${e2.message}`);
  if (!(left ?? []).some(isUnchecked)) { await layRoutine(sb, it.sheet_id); if (wasUnchecked) await reorderToday(sb, it.sheet_id); }
  else if (wasUnchecked && it.units?.book_id && readyBooks(left ?? []).includes(it.units.book_id)) await layRoutine(sb, it.sheet_id, { books: [it.units.book_id] });
}
/** △·✕ 의 나머지를 어디로 — 오늘 학습(class) · 다음 숙제(home) · 남아서(stay — 3b 「남」 줄, 0141) 줄을 새로 세우되 원본을 가리킨다(조각). 같은 곳에 이미 세웠으면 그것 */
export async function carryRest(sb, itemId, where, note = null) {
  const it = await sheetOf(sb, itemId);
  if (!["class", "home", "stay"].includes(where)) throw new Error(`갈 곳이 아닙니다: ${where}`);
  const { data: dup } = await db(sb).from("day_item").select("id").eq("carry_of", itemId).eq("slot", where).maybeSingle();
  if (dup) return { id: dup.id, already: true };
  const { data, error } = await db(sb).from("day_item").insert({ sheet_id: it.sheet_id, slot: where, carry_of: itemId, range_note: note ?? it.range_note ?? null, unit_id: it.unit_id, item_id: it.item_id, sort: 900 }).select("id").single();
  if (error) throw new Error(`나머지를 못 넘김: ${error.message}`);
  return { id: data.id };
}
export async function addItem(sb, sheetId, slot, text) {
  if (!["class", "home", "stay"].includes(slot)) throw new Error(`구분이 아닙니다: ${slot}`);
  const t = String(text ?? "").trim(); if (!t) throw new Error("적은 것이 없습니다");
  await assertOpen(sb, sheetId);
  const { data: last } = await db(sb).from("day_item").select("sort").eq("sheet_id", sheetId).eq("slot", slot).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db(sb).from("day_item").insert({ sheet_id: sheetId, slot, range_note: t, sort: (last?.sort ?? 0) + 1 });
  if (error) throw new Error(`항목을 못 더함: ${error.message}`);
}
/** 숙제 주기 모달((어13) — 원장님 2026-09-14 「오늘 화면에 숙제가 없었을때 부여하는 버튼 필요해. 모달로 따로 뜨게」) — 여러 줄을 한 번에 그 자리에. 빈 줄은 건너뛴다 · 한 줄도 없으면 던진다. 줄마다 addItem 과 같은 모양(range_note · sort 이어서) */
export async function addItems(sb, sheetId, slot, text) {
  if (!["class", "home"].includes(slot)) throw new Error(`구분이 아닙니다: ${slot}`);
  const lines = String(text ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) throw new Error("적은 것이 없습니다");
  await assertOpen(sb, sheetId);
  const { data: last } = await db(sb).from("day_item").select("sort").eq("sheet_id", sheetId).eq("slot", slot).order("sort", { ascending: false }).limit(1).maybeSingle();
  const base = last?.sort ?? 0;
  const { error } = await db(sb).from("day_item").insert(lines.map((t, i) => ({ sheet_id: sheetId, slot, range_note: t, sort: base + 1 + i })));
  if (error) throw new Error(`항목을 못 더함: ${error.message}`);
  return { n: lines.length };
}
/** 미루기 · 학원 ↔ 숙제. 지우지 않고 자리만 바꾼다(처분 한 벌 disposeItem 으로 · (어37)) */
export async function moveItem(sb, itemId, slot) {
  if (!["class", "home"].includes(slot)) throw new Error(`구분이 아닙니다: ${slot}`);
  return disposeItem(sb, itemId, slot);
}
/** 3b 「남」 줄(0141 · 목업 01) — 다 함(done) · 한 판의 남은 것 전부 다 함 · ⏭ 남은 것 다음 숙제로(조각을 home 에 세우고 이 줄은 missing = 「남아서 하려다 못 한 것」). 지우지 않는다 */
export async function stayDone(sb, itemId) {
  const it = await sheetOf(sb, itemId);   // sheetOf 가 마감을 본다(assertOpen) — check-close 가 이 이름을 안다
  if (it.slot !== "stay") throw new Error("남아서 줄이 아닙니다");
  changed(await db(sb).from("day_item").update({ status: "done" }, { count: "exact" }).eq("id", itemId), "못 적음");
}
export async function stayAllDone(sb, sheetId) {
  await assertOpen(sb, sheetId);
  const { data, error } = await db(sb).from("day_item").update({ status: "done" }).eq("sheet_id", sheetId).eq("slot", "stay").or("status.is.null,status.eq.none").select("id");
  if (error) throw new Error(`못 적음: ${error.message}`); return { n: (data ?? []).length };
}
export async function stayCarry(sb, sheetId) {
  await assertOpen(sb, sheetId);
  const { data: rows, error } = await db(sb).from("day_item").select("id,status").eq("sheet_id", sheetId).eq("slot", "stay").or("status.is.null,status.eq.none"); if (error) throw new Error(`남은 것을 못 읽음: ${error.message}`);
  let n = 0;
  for (const r of rows ?? []) { await carryRest(sb, r.id, "home"); changed(await db(sb).from("day_item").update({ status: "missing" }, { count: "exact" }).eq("id", r.id), "못 넘김"); n++; }
  return { n };
}

/** 대전제-19(원장님 2026-09-15 「기본적으로 모든 항목을 추가/수정/삭제가 가능한게 기본이야」): 손으로 더한 줄(그 밖에 · 남 · 나머지 조각)은 글 고치기 · 빼기 · 복구.
 *  루틴이 깐 줄(교재 반쪽)은 「조절」과 같은 손(pickWave)으로 뺀다. 지우지 않는다(대전제-6): 빼기 = off · 복구 = off 풀기. 검사 줄(지난 판)은 못 건드린다 */
export async function editItemText(sb, itemId, text) {
  const t = String(text ?? "").trim(); if (!t) throw new Error("적은 것이 없습니다");
  const it = await sheetOf(sb, itemId);
  if (it.item_id && it.unit_id && !it.carry_of) throw new Error("루틴이 깐 줄은 「조절」에서 고칩니다");
  changed(await db(sb).from("day_item").update({ range_note: t }, { count: "exact" }).eq("id", itemId), "줄을 못 고침");
}
export async function removeItem(sb, itemId) {
  const it = await sheetOf(sb, itemId);
  if (!["class", "home", "next", "stay"].includes(it.slot)) throw new Error("검사 줄은 못 뺍니다");
  changed(await db(sb).from("day_item").update({ off: true }, { count: "exact" }).eq("id", itemId), "줄을 못 뺌");
}
export async function restoreItem(sb, itemId) {
  await sheetOf(sb, itemId);
  changed(await db(sb).from("day_item").update({ off: false }, { count: "exact" }).eq("id", itemId), "줄을 못 되살림");
}

/** (어37) 오늘 학습 줄 하나의 처분(원장님 9/15 「각 항목별로 건너뛰기 / 다음시간으로 / 숙제로」 · 단원마다는 그 단원 줄을 차례로 돌린다, 대전제-20) · 지우지 않는다(대전제-6).
 *  skip: 오늘은 안 한다(off = 빼기 · 「뺀 줄」에서 되살린다) · next: 다음 시간으로(자리 next · 다음 판이 설 때 오늘 학습 맨 앞에 이어 깔린다, routine.js layRoutine) · home: 오늘 숙제로 · class: 되돌리기(다음 시간·숙제 → 오늘 학습).
 *  그 자리에 같은 줄(같은 항목·단원 · 손으로 적은 줄은 같은 글)이 이미 있으면(루틴이 둘 다에 깐 것 · day_item_one_per_slot) 이 줄은 off 로 내리고 그 줄을 살려 합친다(merged) */
export const DISPOSE = Object.freeze([["skip", "건너뛰기"], ["next", "다음 시간으로"], ["home", "숙제로"]]);
export async function disposeItem(sb, itemId, where) {
  if (where === "skip") { await removeItem(sb, itemId); return { where, merged: false }; }
  if (!["next", "home", "class"].includes(where)) throw new Error(`갈 곳이 아닙니다: ${where}`);
  const it = await sheetOf(sb, itemId);
  if (!["class", "home", "next"].includes(it.slot)) throw new Error("검사 줄은 못 옮깁니다");
  if (it.slot === where) return { where, merged: false };
  let q = db(sb).from("day_item").select("id,off").eq("sheet_id", it.sheet_id).eq("slot", where).neq("id", itemId);
  if (it.item_id || it.unit_id) { q = it.item_id ? q.eq("item_id", it.item_id) : q.is("item_id", null); q = it.unit_id ? q.eq("unit_id", it.unit_id) : q.is("unit_id", null); }
  else q = q.is("item_id", null).is("unit_id", null).eq("range_note", it.range_note ?? "");
  const { data: dup, error } = await q.limit(1).maybeSingle(); if (error) throw new Error(`줄을 못 읽음: ${error.message}`);
  if (dup) {
    if (dup.off) changed(await db(sb).from("day_item").update({ off: false }, { count: "exact" }).eq("id", dup.id), "줄을 못 되살림");
    changed(await db(sb).from("day_item").update({ off: true }, { count: "exact" }).eq("id", itemId), "줄을 못 내림");
    return { where, merged: true };
  }
  changed(await db(sb).from("day_item").update({ slot: where }, { count: "exact" }).eq("id", itemId), "못 옮김");
  return { where, merged: false };
}
/** 여럿 한 번에(단원 머리 단추) · 하나씩의 손을 차례로 */
export async function disposeMany(sb, itemIds = [], where) {
  const list = [...new Set((itemIds ?? []).filter(Boolean))]; if (!list.length) throw new Error("고른 줄이 없습니다");
  let n = 0, merged = 0; for (const id of list) { const r = await disposeItem(sb, id, where); n++; if (r.merged) merged++; }
  return { n, merged, where };
}
