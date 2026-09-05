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
  if (writesAttend(s)) bad.push(`${f}: attend 를 직접 쓴다 — lib/attend.js attendanceWrite 로`);
}
const att = strip(readFileSync("lib/attend.js", "utf8"));
if (!writesAttend(att)) bad.push("lib/attend.js 가 attend 를 안 쓴다 — 쓰는 길이 사라졌다");
if (!/assertOpen\(/.test(att)) bad.push("lib/attend.js 가 마감을 안 본다(검사-⑤)");
if (!/ATTEND\.some/.test(att)) bad.push("lib/attend.js 가 값을 안 거른다 — CHECK 와 어긋난 값이 DB 까지 간다");
if (!writesAttend(strip("// x\nawait db(sb).from(\"day_sheet\").update({ attend: v }).eq(\"id\", id)"))) { console.log("⚠️ 검사 자신이 고장났다"); process.exit(1); }
if (bad.length) { console.log("check-attend ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-attend ✓ 출결을 쓰는 길은 attendanceWrite 하나 · 마감을 본다 · 값을 거른다");
