/** 하원 지연(v2.late_stay) 한 벌 · 사유 · 예상 귀가(약속) · 보냈나(확정-⑭). 실제 하원은 여기 없다 · 등원 표(v2.arrival) 걸음 4 하나뿐(0083, 원칙-1) · 읽기는 SQL v2.late_states, 쓰기는 lib/arrival.js staffStamp((어48) 01 출결 곁에서도 같은 손).
 *  알림 보내기 자리는 오늘 카드 하나(확정-㊿) · 큐에 넣고 「보냄」 때를 찍는다. 문구·차이·반복 띠는 lib/late-plan.js(순수) */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { enqueue } from "./queue.js";
import { changed } from "./sqlError.js";
export const PLUS = Object.freeze([["20", "+20분"], ["40", "+40분"], ["60", "+1시간"]]);
export async function setLate(sb, sheetId, { reason, untilAt }) {
  await assertOpen(sb, sheetId);
  const { data: cur } = await db(sb).from("late_stay").select("id").eq("sheet_id", sheetId).maybeSingle();
  const row = { reason: reason ?? null, until_at: untilAt ?? null };
  changed(cur ? await db(sb).from("late_stay").update(row, { count: "exact" }).eq("id", cur.id) : await db(sb).from("late_stay").insert({ sheet_id: sheetId, ...row }, { count: "exact" }), "하원 지연을 못 씀");
}
/** (어39) 사유만 고치기 · 예상 귀가 시각은 그대로(발송 10 에서 사유가 비어 못 보내던 줄을 그 자리에서) */
export async function setReason(sb, sheetId, reason) {
  await assertOpen(sb, sheetId);
  changed(await db(sb).from("late_stay").update({ reason: String(reason ?? "").trim() || null }, { count: "exact" }).eq("sheet_id", sheetId), "사유를 못 씀");
}
/** 📨 학부모에게 지금 보내기 — 큐(late_notice)에 넣고 sent_at 을 **누른 때**로 찍는다. 학부모 화면(09, late_for_family)은 이때부터 보이고 푸시는 큐가 뒤에서(10). 예정 알림(plan.js notified_at)과 같은 결 */
export async function sendLate(sb, sheetId) {
  await assertOpen(sb, sheetId);
  const { data: cur } = await db(sb).from("late_stay").select("id,until_at").eq("sheet_id", sheetId).maybeSingle();
  if (!cur?.until_at) throw new Error("예상 귀가 시각을 먼저 적으세요");
  const id = await enqueue(sb, "late_notice", { sheet_id: sheetId, late_id: cur.id }, { table: "late_stay", id: cur.id });
  changed(await db(sb).from("late_stay").update({ sent_at: new Date().toISOString() }, { count: "exact" }).eq("id", cur.id), "보낸 때를 못 적음");
  return id;
}
/** 사유에 자동 꼬리표를 붙이거나 뗀다(「단어 재시험이 남음 — …」). 원장님이 적은 말은 그대로 두고 「 · 」 로 잇는다 — 사유는 이 줄 하나가 원본(확정-㊿) */
export async function tagReason(sb, sheetId, tag, on) {
  await assertOpen(sb, sheetId);
  const { data: cur } = await db(sb).from("late_stay").select("id,reason").eq("sheet_id", sheetId).maybeSingle();
  const head = tag.split(" · ")[0];
  const parts = String(cur?.reason ?? "").split(" · ").map((x) => x.trim()).filter((x) => x && !x.startsWith(head));
  if (on) parts.push(tag);
  const reason = parts.join(" · ") || null;
  if (!cur && !on) return;
  changed(cur ? await db(sb).from("late_stay").update({ reason }, { count: "exact" }).eq("id", cur.id) : await db(sb).from("late_stay").insert({ sheet_id: sheetId, reason }, { count: "exact" }), "하원 지연 사유를 못 씀");
}
/** 오늘 화면의 하원 지연 상태 한 줄씩 · SQL(v2.late_states)이 센다: 실제 하원(걸음 4) · 반복(오늘을 넣어 N일 안 N번째) · 묻나. 규칙 줄이 없으면 던진다(뼈대-5) */
export async function lateStates(sb, studentIds, date) {
  if (!studentIds.length) return [];
  const { data, error } = await db(sb).rpc("late_states", { p_students: studentIds, p_on: date });
  if (error) throw new Error(`하원 지연 상태를 못 읽음: ${error.message}`);
  const rows = data ?? [];
  if (rows.length && (rows[0].repeat_at === null || rows[0].window_days === null)) throw new Error("규칙 줄이 없다: late.repeat_count · late.repeat_days · 0113 의 씨앗을 본다");
  return rows;
}
/** 서울 시각에 분을 더한다 — 「+20분」 단추 */
export const plusMinutes = (min, now = new Date()) => { const t = new Date(now.getTime() + min * 60000 + 9 * 3600000); return t.toISOString().slice(11, 16); };
