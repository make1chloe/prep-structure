/** 권한 검사 — 「누가 무엇을 보나」는 lib/perm.js 한 벌 + v2.role_access 의 값. 기본값은 코드에 없다.
 *    1. 열쇠(page.* ops.* me.* parent.*) 글자가 lib/perm.js 밖에 없다 — 화면이 열쇠를 지어내지 않는다
 *    2. 칸 수 = 34 (원장님이 2026-09-03 에 정하신 32칸 + 2026-09-09 「학생학부모는 따로 권한두기」의 학교별 표 둘(me.grid · parent.grid) — 이름이 바뀌면 그 답이 사라진다)
 *    3. DB 의 v2.can 은 줄이 없으면 거짓(fail closed) · principal 은 role_access 에 못 들어간다
 *    4. 코드에 allowed: true 같은 기본값이 없다
 *    5. **열쇠마다 소비처가 있다**((서2) 2026-09-10) — 원장님이 켜고 끄는 칸이 아무것도 안 바꾸면 화면이 거짓말을 한다(대전제-0).
 *       ME.x · PARENT.x · KEYS 의 page 열쇠(메뉴 BUILT)로 실제로 쓰이는지 센다. 안 쓰는 열쇠는 lib/perm.js 의 그 줄에
 *       `unused: "…"` 를 적어야 하고(화면이 그 글을 그대로 보인다), 쓰기 시작하면 그 줄을 지워야 한다 — 양쪽 다 여기서 잡는다 */
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
if (CELLS !== 34) bad.push(`칸 수 ${CELLS} ≠ 34 — 원장님이 정하신 32칸 + 학교별 표 둘(9/9)과 어긋난다`);
if (new Set(KEYS.map((k) => k.key)).size !== KEYS.length) bad.push("열쇠가 겹친다");
const sql = readFileSync("supabase/migrations/0088_role_access.sql", "utf8");   // v2.can · role_access 가 사는 곳
if (!/coalesce\(\(select a\.allowed[\s\S]*?\), false\)/.test(sql)) bad.push("v2.can 이 fail closed 가 아니다");
if (!/role_access_role_check\s*\n?\s*check \(role in \('instructor','assistant','student','parent'\)\)/.test(sql)) bad.push("role_access 가 principal 을 안 막는다");
// 6. 아이·학부모의 **모든** 화면이 열쇠로 잠긴다((서2)) — 카드는 끄면 사라지는데 주소로 들어가면 그대로 열리던 곳이 둘 있었다(/me/book · /me/videos).
//    07·09 의 카드와 **같은 열쇠**여야 한다: 화면마다 decide(…) 가 한 번은 나온다
for (const f of [...files("app/me"), ...files("app/parent")].filter((f) => f.endsWith("page.js"))) {
  const s2 = strip(readFileSync(f, "utf8"));
  if (!/\bdecide\s*\(/.test(s2)) bad.push(`${f}: 아이·학부모 화면인데 열쇠를 안 본다 — 카드를 끄면 사라지지만 주소로 들어가면 열린다. 07·09 의 그 카드와 같은 열쇠로 decide(…) 를 한 번 부른다`);
}
// 5. 열쇠마다 소비처 — 이름(ME.books · PARENT.recent …)이 app·lib 어딘가에서 불리나. page 열쇠는 lib/menu.js 의 BUILT 가 소비처다
const code = [...files("app"), ...files("lib")].filter((f) => /\.(js|jsx)$/.test(f) && !f.endsWith("lib/perm.js")).map((f) => strip(readFileSync(f, "utf8"))).join("\n");
for (const k of KEYS) {
  const [grp, name] = k.key.split(".");
  const used = grp === "page" ? new RegExp(`BUILT[\\s\\S]{0,400}?["'\`]${k.href ?? "@@"}["'\`]`).test(code) : new RegExp(`\\b${grp === "ops" ? "OPS" : grp.toUpperCase()}\\.${name}\\b`).test(code);
  if (used && k.unused) bad.push(`${k.key}: 이제 쓰이는데 lib/perm.js 에 unused 가 남아 있다 — 그 줄을 지워라(화면이 「켜도 달라지는 것이 없습니다」라고 거짓말한다)`);
  if (!used && !k.unused) bad.push(`${k.key}(${k.name}): 켜고 끄는 칸인데 **보는 화면이 없다** — 쓰거나, lib/perm.js 의 그 줄에 unused: "까닭" 을 적어 화면이 말하게 하라(대전제-0)`);
}
if (bad.length) { console.log("check-perm ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log(`check-perm ✓ 열쇠 ${KEYS.length} · 칸 ${CELLS} · 열쇠 글자는 lib/perm.js 에만 · v2.can fail closed · principal 은 못 들어감 · 소비처 없는 열쇠 ${KEYS.filter((k) => k.unused).length}(화면이 그렇게 말한다)`);
