/** 출결 쓰기 한 벌(검사-②) — 출결을 바꾸는 길은 이 함수 하나다. 값은 v2.day_sheet.attend 의 CHECK(0101)와 같다 */
import { db } from "./supabase.js";
import { ATTEND, assertOpen, ensureSheet } from "./day.js";
import { ATTEND_REASON, REASON_ON } from "./day-plan.js";
import { changed, row } from "./sqlError.js";
export async function attendanceWrite(sb, sheetId, value) {
  if (!ATTEND.some(([v]) => v === value) && value !== "makeup") throw new Error(`출결 값이 아닙니다: ${value}`);   // makeup 은 보강으로 온 날 — 보강 무리의 판을 세울 때 앱이 채운다(lib/day.js, CHECK 는 0101)
  await assertOpen(sb, sheetId);
  changed(await db(sb).from("day_sheet").update({ attend: value, ...(REASON_ON.includes(value) ? {} : { attend_reason: null }) }, { count: "exact" }).eq("id", sheetId), "출결을 못 씀");   // (어44) 까닭은 지각·결석에만 · 출석으로 돌리면 까닭도 비운다
}
/** (어44) 지각·결석 까닭 · 넷 중 하나 또는 없음(null) · 지각·결석이 아닌 날엔 못 붙인다 · 쓰는 길은 여기 하나(검사-②) */
export async function attendReasonWrite(sb, sheetId, reason) {
  const r = reason ? String(reason) : null;
  if (r && !ATTEND_REASON.some(([k]) => k === r)) throw new Error(`까닭 값이 아닙니다: ${r}`);
  await assertOpen(sb, sheetId);
  const cur = row(await db(sb).from("day_sheet").select("attend").eq("id", sheetId).maybeSingle(), "수업 일지를 못 읽음");
  if (r && !REASON_ON.includes(cur?.attend)) throw new Error("지각·결석일 때만 까닭을 붙입니다");
  changed(await db(sb).from("day_sheet").update({ attend_reason: r }, { count: "exact" }).eq("id", sheetId), "까닭을 못 씀");
}
/** 여럿 한 번에 출결((어28)-② · 대전제-20) · 줄의 손과 같은 길: 판이 없으면 세우고(ensureSheet) 적는다(attendanceWrite). 막히면 그 아이부터 멈춘다 */
export async function attendMany(sb, list = [], date, value) {
  const rows = (list ?? []).filter((r) => r?.studentId); if (!rows.length) throw new Error("고른 아이가 없습니다");
  let n = 0;
  for (const r of rows) { const s = await ensureSheet(sb, String(r.studentId), r.classId ?? null, date); await attendanceWrite(sb, s.id, value); n++; }
  return { n };
}
