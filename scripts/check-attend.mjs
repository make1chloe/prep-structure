/** 출결 검사(검사-②) — 출결(day_sheet.attend)을 쓰는 길은 lib/attend.js 의 attendanceWrite 하나다. 다른 파일이 attend 를 직접 쓰면 실패.
 *  글자로 훑는 검사라 주석을 먼저 지운다(폰-5). 일부러 어긴 본보기를 스스로 잡는지 본다 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const writesAttend = (s) => /\.(update|insert|upsert)\(\s*\{[^}]*\battend\s*:/.test(s);
const bad = [];
for (const f of [...files("app"), ...files("lib")].filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith("lib/attend.js"))) {
  const s = strip(readFileSync(f, "utf8"));
  if (writesAttend(s)) bad.push(`${f}: attend 를 직접 쓴다. lib/attend.js attendanceWrite 로`);
}
const att = strip(readFileSync("lib/attend.js", "utf8"));
if (!writesAttend(att)) bad.push("lib/attend.js 가 attend 를 안 쓴다. 쓰는 길이 사라졌다");
if (!/assertOpen\(/.test(att)) bad.push("lib/attend.js 가 마감을 안 본다(검사-⑤)");
if (!/ATTEND\.some/.test(att)) bad.push("lib/attend.js 가 값을 안 거른다. CHECK 와 어긋난 값이 DB 까지 간다");
// (어44) 지각·결석 까닭 · 쓰는 길은 attendReasonWrite 하나 · 출석으로 돌리면 까닭도 비운다 · 「지각(진료)」 글은 attendText 한 벌(두 벌이던 ATTEND_NAME 0)
{ const writesReason = (s) => /\.(update|insert|upsert)\(\s*\{[^}]*\battend_reason\s*:/.test(s);
  for (const f of [...files("app"), ...files("lib")].filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith("lib/attend.js"))) if (writesReason(strip(readFileSync(f, "utf8")))) bad.push(`${f}: attend_reason 을 직접 쓴다. lib/attend.js attendReasonWrite 로`);
  if (!/export async function attendReasonWrite/.test(att) || !/ATTEND_REASON\.some/.test(att) || !/REASON_ON\.includes\(cur\?\.attend\)/.test(att)) bad.push("lib/attend.js attendReasonWrite 가 없거나 값·출결을 안 거른다");
  if (!/attend_reason: null/.test(att)) bad.push("lib/attend.js attendanceWrite 가 출석으로 돌릴 때 까닭을 안 비운다");
  const dp = strip(readFileSync("lib/day-plan.js", "utf8"));
  if (!/export const ATTEND_REASON = Object\.freeze\(\[\["sick", "질병"\], \["clinic", "진료"\], \["family", "가족 일정"\], \["school", "학교 일정"\]\]\)/.test(dp) || !/export const attendText/.test(dp)) bad.push("lib/day-plan.js 에 까닭 넷(ATTEND_REASON)·attendText 한 벌이 없다");
  for (const f of ["lib/cal-plan.js", "lib/comment-plan.js", "lib/parent-plan.js"]) { const s = strip(readFileSync(f, "utf8")); if (/ATTEND_NAME\s*=/.test(s) || !/attendText\(/.test(s)) bad.push(`${f}: 출결 글을 제 손으로 갖는다(attendText 한 벌로)`); }
  const rowJs = strip(readFileSync("app/today/row.js", "utf8"));
  if (!/data-g="att-reason"/.test(rowJs) || !/REASON_ON\.includes\(attend\)/.test(rowJs) || !/setAttendReason\(sheet\.id, next\)/.test(rowJs)) bad.push("app/today/row.js 에 까닭 칩(att-reason · 지각·결석일 때만 · setAttendReason)이 없다");
  const sql = readFileSync("supabase/migrations/0166_attend_reason.sql", "utf8");
  if (!/attend_reason in \('sick', 'clinic', 'family', 'school'\)/.test(sql) || !/'warn\.excused', 'clinic,school'/.test(sql) || !/any \(r\.excused\)/.test(sql)) bad.push("0166: 까닭 CHECK 넷 · 규칙 warn.excused(clinic,school) · warn_days 의 제외가 어긋난다"); }
// 결석한 날이 지난 숙제를 삼키지 않는다 — 2026-09-11 첫 주 돌려보기에서 잡힘(9/9 결석 판이 검사 줄 2개를 끌어가 9/10 수업의 검사가 0이 됐다).
// 「아직 검사 안 한 지난 숙제」를 세는 자리(lib/day.js unchecked)의 둘째 조회는 **결석한 날의 검사 줄을 빼야** 한다.
{ const day = strip(readFileSync("lib/day.js", "utf8"));
  const 둘째 = day.match(/export function unchecked[\s\S]*?\n\}/)?.[0] ?? "";
  if (!/day_sheet!inner\([^)]*attend[^)]*\)/.test(둘째)) bad.push("lib/day.js unchecked: 검사 줄 조회가 attend 를 안 읽는다. 결석한 날을 가릴 수 없다");
  if (!/\.neq\(\s*"day_sheet\.attend"\s*,\s*"absent"\s*\)/.test(둘째)) bad.push("lib/day.js unchecked: 결석한 날의 검사 줄을 안 뺀다. 안 온 날이 지난 숙제를 삼켜 다음 수업에 검사가 0이 된다"); }
if (!writesAttend(strip("// x\nawait db(sb).from(\"day_sheet\").update({ attend: v }).eq(\"id\", id)"))) { console.log("⚠️ 검사 자신이 고장났다"); process.exit(1); }
if (bad.length) { console.log("check-attend ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-attend ✓ 출결을 쓰는 길은 attendanceWrite 하나 · 마감을 본다 · 값을 거른다 · (어44) 까닭은 attendReasonWrite 하나 · 넷 · 「지각(진료)」 글 한 벌 · 01 칩");
