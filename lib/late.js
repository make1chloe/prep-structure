/** 늦귀가(v2.late_stay) 한 벌 — 사유 · 예상 귀가(약속) · 실제 하원 · 보냈나(확정-⑭). 알림 보내기 자리는 오늘 카드 하나(확정-㊿) — 큐에 넣는다 */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { enqueue } from "./queue.js";
export const PLUS = Object.freeze([["20", "+20분"], ["40", "+40분"], ["60", "+1시간"]]);
export async function setLate(sb, sheetId, { reason, untilAt }) {
  await assertOpen(sb, sheetId);
  const { data: cur } = await db(sb).from("late_stay").select("id").eq("sheet_id", sheetId).maybeSingle();
  const row = { reason: reason ?? null, until_at: untilAt ?? null };
  const { error } = cur ? await db(sb).from("late_stay").update(row).eq("id", cur.id) : await db(sb).from("late_stay").insert({ sheet_id: sheetId, ...row });
  if (error) throw new Error(`늦귀가를 못 씀: ${error.message}`);
}
export async function sendLate(sb, sheetId) {
  await assertOpen(sb, sheetId);
  const { data: cur } = await db(sb).from("late_stay").select("id,until_at").eq("sheet_id", sheetId).maybeSingle();
  if (!cur?.until_at) throw new Error("예상 귀가 시각을 먼저 적으세요");
  return enqueue(sb, "late_notice", { sheet_id: sheetId, late_id: cur.id }, { table: "late_stay", id: cur.id });
}
/** 서울 시각에 분을 더한다 — 「+20분」 단추 */
export const plusMinutes = (min, now = new Date()) => { const t = new Date(now.getTime() + min * 60000 + 9 * 3600000); return t.toISOString().slice(11, 16); };
