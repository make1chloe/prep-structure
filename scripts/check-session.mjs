/** 세션 검사(속도 대원칙 2) — 로그인 확인은 lib/session.js 한 벌. auth.getUser() 는 부를 때마다 인증 서버 왕복이라 금지.
 *  화면(app 아래 모든 page.js)은 guard() 또는 whoami() 로 시작한다 — 로그인 화면만 whoami 로 「이미 들어왔나」를 본다.
 *  글자로 훑는 검사라 주석을 먼저 지운다(폰-5), 일부러 어긴 본보기를 스스로 잡는지 본다 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const bad = [];
for (const f of [...files("app"), ...files("lib")].filter((f) => /\.(js|mjs|jsx)$/.test(f))) {
  const s = strip(readFileSync(f, "utf8"));
  if (/auth\.getUser\s*\(/.test(s)) bad.push(`${f}: auth.getUser() — 인증 서버 왕복 (lib/session.js 의 sessionUser 로)`);
  if (/\/page\.js$/.test(f) && !/(guard|whoami)\s*\(/.test(s)) bad.push(`${f}: guard()/whoami() 없이 그리는 화면`);
  if (/\.schema\(\s*["']/.test(s) && !f.endsWith("lib/supabase.js")) bad.push(`${f}: .schema("…") 를 따로 적음 — lib/supabase.js 의 db() 한 벌`);
}
const 본보기 = strip("// x\nconst u = await sb.auth.getUser();");
if (!/auth\.getUser\s*\(/.test(본보기)) { console.log("⚠️ 검사 자신이 고장났다"); process.exit(1); }
if (bad.length) { console.log("check-session ✗\n  " + bad.join("\n  ")); process.exit(1); }
console.log("check-session ✓ auth.getUser 0 · 모든 화면이 guard/whoami 로 시작 · 스키마는 db() 한 벌");
