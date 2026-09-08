/** 화면 이동 검사(검사-71 · (나)-①) — 상단 탭·달력(app/_shell/shell.js · calview.js)은 <Link>(통째로 다시 안 열고 바뀐 부분만 갈아끼움 — 「클릭과 동시」 · 원장님 9/8)로만 움직인다: 생 <a 가 하나도 없어야 한다.
 *  나머지 화면의 내부 <a href="/…">·window.location 은 다음 쓸어담기 대상 — 여기선 세어서 알리기만(빨갛지 않다 · 0이 되면 이 검사를 조여 전체를 지킨다). 주석은 먼저 지운다(폰-5) */
import { readFileSync, readdirSync, statSync } from "node:fs"; import { join } from "node:path";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
for (const f of ["app/_shell/shell.js", "app/_shell/calview.js"]) {
  const s = strip(readFileSync(f, "utf8"));
  ok(`${f} — next/link 를 쓰고 생 <a 가 없다`, /from "next\/link"/.test(s) && !/<a\b/.test(s), (s.match(/<a\b[^>]*/g) ?? []).join(" | ").slice(0, 120));
}
ok("달력 날짜 칸은 prefetch 를 끈다(42칸 — 누르는 건 하루뿐)", /<Link prefetch=\{false\}/.test(strip(readFileSync("app/_shell/calview.js", "utf8"))));
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith(".js")) out.push(p); } return out; };
let rest = 0, loc = 0;
for (const f of walk("app")) { const s = strip(readFileSync(f, "utf8")); rest += (s.match(/<a\b[^>]*href="\/(?!api\/)[^"]*"[^>]*>/g) ?? []).filter((t) => !/target=|download/.test(t)).length; loc += (s.match(/window\.location\.href\s*=/g) ?? []).length; }
console.log(`   ℹ️  다음 쓸어담기 — 내부 <a href="/…"> ${rest}곳 · window.location ${loc}곳(아직 통째로 다시 연다)`);
console.log(`\n■ 화면 이동 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
