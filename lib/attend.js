/** 출결 쓰기 한 벌(검사-②) — 출결을 바꾸는 길은 이 함수 하나다. 값은 v2.day_sheet.attend 의 CHECK(0101)와 같다 */
import { db } from "./supabase.js";
import { ATTEND, assertOpen, ensureSheet } from "./day.js";
import { changed } from "./sqlError.js";
export async function attendanceWrite(sb, sheetId, value) {
  if (!ATTEND.some(([v]) => v === value) && value !== "makeup") throw new Error(`출결 값이 아닙니다: ${value}`);   // makeup 은 보강으로 온 날 — 보강 무리의 판을 세울 때 앱이 채운다(lib/day.js, CHECK 는 0101)
  await assertOpen(sb, sheetId);
  changed(await db(sb).from("day_sheet").update({ attend: value }, { count: "exact" }).eq("id", sheetId), "출결을 못 씀");
}
/** 여럿 한 번에 출결((어28)-② · 대전제-20) · 줄의 손과 같은 길: 판이 없으면 세우고(ensureSheet) 적는다(attendanceWrite). 막히면 그 아이부터 멈춘다 */
export async function attendMany(sb, list = [], date, value) {
  const rows = (list ?? []).filter((r) => r?.studentId); if (!rows.length) throw new Error("고른 아이가 없습니다");
  let n = 0;
  for (const r of rows) { const s = await ensureSheet(sb, String(r.studentId), r.classId ?? null, date); await attendanceWrite(sb, s.id, value); n++; }
  return { n };
}
