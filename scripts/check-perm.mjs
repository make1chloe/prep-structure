/** 권한 검사 — 「누가 무엇을 보나」는 lib/perm.js 한 벌 + v2.role_access 의 값. 기본값은 코드에 없다.
 *    1. 열쇠(page.* ops.* me.* parent.*) 글자가 lib/perm.js 밖에 없다 — 화면이 열쇠를 지어내지 않는다
 *    2. 칸 수 = 32 (원장님이 2026-09-03 에 정하신 칸과 같다 — 이름이 바뀌면 그 답이 사라진다)
 *    3. DB 의 v2.can 은 줄이 없으면 거짓(fail closed) · principal 은 role_access 에 못 들어간다
 *    4. 코드에 allowed: true 같은 기본값이 없다 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { KEYS, CELLS } from "../lib/perm.js";
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const bad = [];
for (const f of [...files("app"), ...files("lib")].filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith("lib/perm.js"))) {
  const s = strip(readFileSync(f, "utf8"));
  for (const m of s.matchAll(/["'`](page|ops|me|parent)\.[a-z]+["'`]/g)) bad.push(`${f}: 열쇠 글자 ${m[0]} — lib/perm.js 의 KEYS 로`);
  if (/allowed:\s*true/.test(s) && !f.includes("settings/access")) bad.push(`${f}: allowed: true 기본값`);
}
if (CELLS !== 32) bad.push(`칸 수 ${CELLS} ≠ 32 — 원장님이 정하신 32칸과 어긋난다`);
if (new Set(KEYS.map((k) => k.key)).size !== KEYS.length) bad.push("열쇠가 겹친다");
const sql = readFileSync("supabase/migrations/0088_role_access.sql", "utf8");   // v2.can · role_access 가 사는 곳
if (!/coalesce\(\(select a\.allowed[\s\S]*?\), false\)/.test(sql)) bad.push("v2.can 이 fail closed 가 아니다");
if (!/role_access_role_check\s*\n?\s*check \(role in \('instructor','assistant','student','parent'\)\)/.test(sql)) bad.push("role_access 가 principal 을 안 막는다");
if (bad.length) { console.log("check-perm ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-perm ✓ 열쇠 ${KEYS.length} · 칸 ${CELLS} · 열쇠 글자는 lib/perm.js 에만 · v2.can fail closed · principal 은 못 들어감`);
