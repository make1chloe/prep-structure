/** 숙제 검사 · 오늘 학습 · 오늘 숙제 — 판 안의 줄(v2.day_item) 한 벌.
 *  검사: ○ done · △ weak(어디까지 done_note) · ✕ missing. 나머지는 「오늘 학습으로 · 다음 숙제로 · 남아서」 — 조각이 원본을 가리킨다(carry_of, 확정-⑳).
 *  지우지 않는다 — 옮기는 것은 slot 을 바꾸는 것(대전제-6). */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { CHECK } from "./status.js";
export const STATUS = Object.freeze(Object.fromEntries(CHECK));
export const UPTO = Object.freeze(["시작만", "절반", "거의 다"]);
export const REST = Object.freeze({ class: "오늘 학습으로", home: "다음 숙제로", stay: "남아서" });
async function sheetOf(sb, itemId) {
  const { data } = await db(sb).from("day_item").select("id,sheet_id,slot,range_note,memo,unit_id,item_id,status,done_note").eq("id", itemId).maybeSingle();
  if (!data) throw new Error("항목이 없습니다"); await assertOpen(sb, data.sheet_id); return data;
}
export async function checkItem(sb, itemId, status, doneNote = null) {
  if (!STATUS[status]) throw new Error(`검사 값이 아닙니다: ${status}`);
  await sheetOf(sb, itemId);
  const { error } = await db(sb).from("day_item").update({ status, done_note: status === "weak" ? doneNote : null }).eq("id", itemId);
  if (error) throw new Error(`검사를 못 씀: ${error.message}`);
}
/** △·✕ 의 나머지를 어디로 — 오늘 학습(class) · 다음 숙제(home) 줄을 새로 세우되 원본을 가리킨다. 남아서(stay)는 늦귀가가 맡는다(lib/late.js) */
export async function carryRest(sb, itemId, where, note = null) {
  const it = await sheetOf(sb, itemId);
  if (where === "stay") return { stay: true, item: it };
  if (!["class", "home"].includes(where)) throw new Error(`갈 곳이 아닙니다: ${where}`);
  const { data: dup } = await db(sb).from("day_item").select("id").eq("carry_of", itemId).eq("slot", where).maybeSingle();
  if (dup) return { id: dup.id, already: true };
  const { data, error } = await db(sb).from("day_item").insert({ sheet_id: it.sheet_id, slot: where, carry_of: itemId, range_note: note ?? `나머지 — ${it.range_note ?? ""}`.trim(), unit_id: it.unit_id, item_id: it.item_id, sort: 900 }).select("id").single();
  if (error) throw new Error(`나머지를 못 넘김: ${error.message}`);
  return { id: data.id };
}
export async function addItem(sb, sheetId, slot, text) {
  if (!["class", "home"].includes(slot)) throw new Error(`자리가 아닙니다: ${slot}`);
  const t = String(text ?? "").trim(); if (!t) throw new Error("적은 것이 없습니다");
  await assertOpen(sb, sheetId);
  const { data: last } = await db(sb).from("day_item").select("sort").eq("sheet_id", sheetId).eq("slot", slot).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db(sb).from("day_item").insert({ sheet_id: sheetId, slot, range_note: t, sort: (last?.sort ?? 0) + 1 });
  if (error) throw new Error(`항목을 못 더함: ${error.message}`);
}
/** 미루기 — 학원 → 숙제. 지우지 않고 자리만 바꾼다 */
export async function moveItem(sb, itemId, slot) {
  if (!["class", "home"].includes(slot)) throw new Error(`자리가 아닙니다: ${slot}`);
  await sheetOf(sb, itemId);
  const { error } = await db(sb).from("day_item").update({ slot }).eq("id", itemId);
  if (error) throw new Error(`못 옮김: ${error.message}`);
}
