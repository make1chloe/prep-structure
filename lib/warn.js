/** 경고 · 반성문(확정-㊼) 한 벌 — 경고는 저장하지 않고 SQL 이 사실에서 센다(v2.warn_days · warn_states). 여기는 읽어 넘기고, 원장님이 정한 것 둘(반성문 처분 · 달 정리)만 쓴다.
 *  처분 셋: homework 다음 시간 숙제(숙제 줄로 선다) · stay 오늘 남아서 쓰기(늦귀가 사유에 붙는다) · defer 유예(미룬 것 — 다음 경고에 다시 묻는다). 면제는 없다.
 *  기준 횟수는 학원 기본 3(규칙) 이되 아이마다 따로(students.warn_report_at). 한 번 쓰면 그 뒤로 다시 N회를 센 뒤 또 한 번(확정-63) — 세는 것은 SQL warn_states */
import { db } from "./supabase.js";
import { assertOpen } from "./day.js";
import { tagReason } from "./late.js";
import { DISPOSAL } from "./warn-plan.js";
export { DISPOSAL };
export const REFLECT_TAG = "반성문";
/** 오늘 아이들의 경고 상태 — 한 조회(rpc) */
export async function warnStates(sb, studentIds, date) {
  if (!studentIds.length) return [];
  const { data, error } = await db(sb).rpc("warn_states", { p_students: studentIds, p_on: date });
  if (error) throw new Error(`경고를 못 셈: ${error.message}`);
  return data ?? [];
}
/** 월초 띠 — 이 달 정리를 아직 안 정했고 지난 달들에 경고가 남아 있나 */
export async function warnBand(sb, date) {
  const { data, error } = await db(sb).rpc("warn_band", { p_on: date });
  if (error) throw new Error(`월초 정리를 못 읽음: ${error.message}`);
  const r = Array.isArray(data) ? data[0] : data;
  return r?.need ? { month: r.month, prevMonth: r.prev_month } : null;
}
/** 반성문 처분 — 오늘 판에서 원장님이 고른다. 남아서면 늦귀가 사유에, 숙제면 숙제 줄에 선다. 같은 날 다시 고르면 바꾼다 */
export async function reflect(sb, sheetId, disposal, by) {
  if (!DISPOSAL.some(([k]) => k === disposal)) throw new Error(`처분 값이 아닙니다: ${disposal}`);
  await assertOpen(sb, sheetId);
  const { data: sheet, error } = await db(sb).from("day_sheet").select("id,student_id,date").eq("id", sheetId).single();
  if (error || !sheet) throw new Error(`판을 못 읽음: ${error?.message ?? "없음"}`);
  const [st] = await warnStates(sb, [sheet.student_id], sheet.date);
  if (!st?.due && !st?.today_disposal) throw new Error("오늘은 반성문을 물을 때가 아닙니다 — 경고 횟수를 봅니다");
  const row = { student_id: sheet.student_id, sheet_id: sheetId, asked_on: sheet.date, count_at: st.count, disposal, decided_by: by ?? null };
  const { error: e2 } = await db(sb).from("reflection").upsert(row, { onConflict: "student_id,asked_on" });
  if (e2) throw new Error(`반성문 처분을 못 씀: ${e2.message}`);
  const tag = `${REFLECT_TAG} — 오늘 남아서 (경고 ${st.count}회째)`;
  await tagReason(sb, sheetId, tag, disposal === "stay");
  // 다음 시간 숙제 — 숙제 줄 하나(손으로 더한 줄과 같은 꼴). 이미 있으면 그대로, 다른 처분으로 바꾸면 뺀다(off)
  const note = `${REFLECT_TAG} 쓰기 — 경고 ${st.count}회째`;
  const { data: had } = await db(sb).from("day_item").select("id,off").eq("sheet_id", sheetId).eq("slot", "home").eq("range_note", note).maybeSingle();
  if (disposal === "homework") {
    if (!had) { const { error: e3 } = await db(sb).from("day_item").insert({ sheet_id: sheetId, slot: "home", range_note: note, sort: 950 }); if (e3) throw new Error(`반성문 숙제 줄을 못 세움: ${e3.message}`); }
    else if (had.off) await db(sb).from("day_item").update({ off: false }).eq("id", had.id);
  } else if (had && !had.off) await db(sb).from("day_item").update({ off: true }).eq("id", had.id);
  return { count: st.count, disposal };
}
/** 달 정리 — 전원: reset 이면 횟수만 0(그 달 1일부터 센다) · keep 이면 띠만 내린다. 기록은 남는다 */
export async function resetWarnings(sb, month, action, by) {
  if (!["reset", "keep"].includes(action)) throw new Error(`정리 값이 아닙니다: ${action}`);
  const m = String(month ?? "").slice(0, 10); if (!/^\d{4}-\d{2}-01$/.test(m)) throw new Error(`달의 1일이 아닙니다: ${m}`);
  const { error } = await db(sb).from("warn_reset").upsert({ student_id: null, month: m, action, by_who: by ?? null }, { onConflict: "student_id,month" });
  if (error) throw new Error(`정리를 못 적음: ${error.message}`);
}
/** 이 아이의 반성문 기준 횟수 — 비우면 학원 기본(규칙 warn.report_at). 원장님이 고친다(확정-63) */
export async function setLimit(sb, studentId, n) {
  const v = n === null || n === "" || n === undefined ? null : Number(n);
  if (v !== null && (!Number.isInteger(v) || v < 1 || v > 99)) throw new Error("기준 횟수는 1~99, 비우면 학원 기본");
  const { data, error } = await db(sb).from("students").update({ warn_report_at: v }).eq("id", studentId).select("id");
  if (error) throw new Error(`기준 횟수를 못 씀: ${error.message}`);
  if (!data?.length) throw new Error("아이 줄이 없거나 고칠 권한이 없습니다");
}
