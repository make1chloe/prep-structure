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
/* ── (어83) 출결을 안 찍어도 수업 일지가 선다 · 기본은 「아직」 · 다시 누르면 취소
   원장님 2026-09-18: 「출석지각결석 표시 다시 누르면 선택 안한 상태로, 취소가능하게 해줘」
                      「애초에 출석처리를 안하면 검사가 불가능하게 되어있어서 그거때문에 그래 …
                        예정된 수업에서도 검사및 학습배정까지 … 미리 해놓고 출결만 당일에 찍고 싶은거임」 */
{ const sql = readFileSync("supabase/migrations/0180_attend_none.sql", "utf8");
  if (!/check \(attend in \([^)]*'none'[^)]*\)\)/.test(sql)) bad.push("0180: attend CHECK 에 'none'(아직 안 찍음)이 없다. 취소할 값이 없어진다");
  if (!/alter column attend set default 'none'/.test(sql)) bad.push("0180: 기본값이 'none' 이 아니다. 판이 서는 순간 「왔다」가 되어 미리 세울 수 없다(원장님 9/18)");
  if (/update v2\.day_sheet set attend/i.test(sql)) bad.push("0180: 이미 있는 줄의 출결을 고친다. 지난 기록을 조용히 바꾸면 안 된다(대전제-0)");
  const plan = strip(readFileSync("lib/day-plan.js", "utf8"));
  if (!/ATTEND_NONE = "none"/.test(plan)) bad.push("lib/day-plan.js: ATTEND_NONE 이 없다. 「아직」을 화면·셈이 제각기 글자로 적게 된다(원칙-1)");
  if (/\["none",/.test(plan.match(/export const ATTEND = [^;]*/)?.[0] ?? "")) bad.push("lib/day-plan.js: ATTEND 목록에 none 이 들었다. 「아직」은 단추가 아니라 상태다");
  if (!/value !== ATTEND_NONE/.test(att)) bad.push("lib/attend.js: attendanceWrite 가 'none' 을 안 받는다. 취소가 값 검사에 걸린다");
  const row = strip(readFileSync("app/today/row.js", "utf8"));
  if (!/next = attend === v \? ATTEND_NONE : v/.test(row)) bad.push("app/today/row.js: 같은 칩을 다시 눌러도 취소가 안 된다(원장님 9/18 「실수로 찍었을때 취소」)");
  if (!/useState\(sheet\?\.attend \?\? ATTEND_NONE\)/.test(row)) bad.push("app/today/row.js: 아직 안 찍은 줄의 칩이 눌려 보인다 — 기본은 아무것도 안 눌림이고 **예정으로도 미리 안 누른다**(예정은 기록이 아니다 · 대전제-0)");
  const sp = strip(readFileSync("lib/student-plan.js", "utf8"));
  if (!/attendPicked\(a\.attend\)/.test(sp) || !/attendPicked\(x\.attend\)/.test(sp)) bad.push("lib/student-plan.js: 출결 셈이 「아직」을 하루로 센다");
  const page = strip(readFileSync("app/today/page.js", "utf8"));
  if (!/open: date >= todayStr/.test(page)) bad.push("app/today/page.js: 오늘 말고는 수업 일지를 안 세운다. 예정된 수업에 미리 검사·배정을 못 한다(원장님 9/18)");
  if (!/preload: date <= todayStr/.test(page)) bad.push("app/today/page.js: **앞날 판을 미리 채운다.** 지난 숙제가 딸려 와 오늘 검사 줄이 비고(day_item_one_per_slot) 앞날 줄이 낡는다(「앞날 숙제는 배정하지 않는다」 · check-residue)");
  { const day = strip(readFileSync("lib/day.js", "utf8"));
    if (!/async function openSheets\(sb, pairs, date, \{ preload = true \} = \{\}\)/.test(day)) bad.push("lib/day.js openSheets: preload 를 안 받는다. 앞날 판이 저절로 채워진다");
    if (!/if \(!preload\) return \(made\.data \?\? \[\]\)\.map/.test(day)) bad.push("lib/day.js openSheets: preload 가 false 여도 속을 채운다(지난 숙제 · 루틴). 앞날 판은 **빈 판**이어야 한다"); }
  const sch = strip(readFileSync("lib/schedule.js", "utf8"));
  if (!/export async function makeupDayFor/.test(sch)) bad.push("lib/schedule.js: 보강을 아이 목록으로 잡는 손(makeupDayFor)이 없다");
  if (!/return makeupDayFor\(sb, \{ studentIds: members\.map/.test(sch)) bad.push("lib/schedule.js: 반 보강이 makeupDayFor 를 안 쓴다. 손이 두 벌이면 어긋난다(원칙-1)");
  if (!/export async function addAbsenceMany/.test(sch)) bad.push("lib/schedule.js: 결석 예정을 여럿·기간으로 넣는 손(addAbsenceMany)이 없다");
  const many = sch.match(/export async function addAbsenceMany[\s\S]*?\n\}/)?.[0] ?? "";
  if (!/rpc\("student_days"/.test(many)) bad.push("lib/schedule.js addAbsenceMany: 그 아이 수업일을 안 보고 날마다 넣는다. 주말·휴강에 결석이 찍힌다");
  const panel = strip(readFileSync("app/schedule/panel.js", "utf8"));
  if (!/<WhoPick /.test(panel) || (panel.match(/<WhoPick /g) ?? []).length < 2) bad.push("app/schedule/panel.js: 결석 예정과 보강이 같은 고르개(WhoPick)를 안 쓴다(원칙-1)");
  if (!/absence-range/.test(panel)) bad.push("app/schedule/panel.js: 결석 예정에 기간(시작일~종료일)이 없다(원장님 9/18)");
  const who = strip(readFileSync("app/_shell/whopick.js", "utf8"));
  for (const [k, w] of [["who-school", "학교 단추"], ["who-class", "반 단추"], ["who-row", "학생 목록 체크박스"]])
    if (!new RegExp(k).test(who)) bad.push(`app/_shell/whopick.js: ${w}(${k})가 없다(원장님 9/18 「학교별(버튼), 반별(버튼), 학생별(목록)」)`);
  const err = readFileSync("lib/sqlError.js", "utf8");
  if (!/day_sheet_attend_check: \["0180"/.test(err)) bad.push("lib/sqlError.js: 0180 을 아직 안 넣으셨을 때 무엇을 하실지 말해 주지 않는다(대전제-27)"); }

if (bad.length) { console.log("check-attend ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-attend ✓ 출결을 쓰는 길은 attendanceWrite 하나 · 마감을 본다 · 값을 거른다 · (어44) 까닭 넷 · (어83) 기본은 「아직」(0180) · 다시 누르면 취소 · 오늘·앞날은 판이 저절로 선다 · 결석 예정·보강이 같은 고르개");
