/** 마감 검사(검사-⑤) — 판에 쓰는 손(lib/day · homework · late 의 update/insert)은 전부 assertOpen(마감된 판이면 던진다)을 지난다.
 *  판을 세우는 ensureSheet(새 판은 마감이 없다)와 assertOpen 자신만 예외 — 안 내보내는 helper 는 안 본다(손은 내보낸 것만 부른다). 화면의 손(app/today/actions.js)은 lib 만 부른다 — DB 를 직접 만지지 않는다 */
import { readFileSync } from "node:fs";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const bad = [];
for (const f of ["lib/day.js", "lib/homework.js", "lib/late.js", "lib/routine.js", "lib/quiz.js"]) {
  const s = strip(readFileSync(f, "utf8"));
  for (const m of s.matchAll(/export (?:async )?function (\w+)\s*\([^)]*\)\s*\{/g)) {
    const name = m[1]; let d = 0, i = m.index + m[0].length - 1, j = i;
    do { if (s[j] === "{") d++; else if (s[j] === "}") d--; j++; } while (d > 0 && j < s.length);
    const body = s.slice(i, j);
    const writes = /\.(update|insert|upsert)\(/.test(body);
    if (writes && !["ensureSheet", "assertOpen"].includes(name) && !/assertOpen\(|sheetOf\(|sheetRow\(/.test(body)) bad.push(`${f} ${name}(): 판에 쓰면서 마감을 안 본다`);
  }
}
const act = strip(readFileSync("app/today/actions.js", "utf8"));
if (/\.from\(["']day_(sheet|item)|\.from\(["']late_stay/.test(act)) bad.push("app/today/actions.js 가 표를 직접 만진다 — 판단은 lib 에");
if (!/assertOpen/.test(strip(readFileSync("lib/day.js", "utf8")))) bad.push("assertOpen 이 없다");
if (bad.length) { console.log("check-close ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-close ✓ 판에 쓰는 손 전부가 마감을 본다 · 화면의 손은 lib 만 부른다");
