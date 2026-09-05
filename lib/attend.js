/** 출결 쓰기 한 벌(검사-②) — 출결을 바꾸는 길은 이 함수 하나다. 값은 v2.day_sheet.attend 의 CHECK(0101)와 같다 */
import { db } from "./supabase.js";
import { ATTEND, assertOpen } from "./day.js";
export async function attendanceWrite(sb, sheetId, value) {
  if (!ATTEND.some(([v]) => v === value) && value !== "makeup") throw new Error(`출결 값이 아닙니다: ${value}`);   // makeup 은 보강으로 온 날 — 보강 무리의 판을 세울 때 앱이 채운다(lib/day.js, CHECK 는 0101)
  await assertOpen(sb, sheetId);
  const { error } = await db(sb).from("day_sheet").update({ attend: value }).eq("id", sheetId);
  if (error) throw new Error(`출결을 못 씀: ${error.message}`);
}
