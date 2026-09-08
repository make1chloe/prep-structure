/** 화면 이동 검사(검사-71 · (나)-①②) — 내부 이동은 앱 전체가 Next <Link>·router.push 로만: 내부 <a href="/…">·window.location.href 가 0 이어야 한다(/api·바깥 링크·다운로드는 <a> 그대로). 루트 loading.js 는 두지 않는다 — Suspense 경계 안의 redirect() 가 클라이언트 리다이렉트로 바뀌어 guard() 가 흔들린다(게이트 61 이 잡음). 주석은 먼저 지운다(폰-5) */
import { readFileSync, readdirSync, statSync } from "node:fs"; import { join } from "node:path";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith(".js")) out.push(p); } return out; };
const hits = [], locs = [];
for (const f of walk("app")) { const s = strip(readFileSync(f, "utf8"));
  for (const t of s.match(/<a\b[^>]*>/g) ?? []) if (/href=("\/(?!api\/)|\{)/.test(t) && !/target=|download|\/api\//.test(t)) hits.push(`${f}: ${t.slice(0, 60)}`);
  for (const m of s.match(/window\.location\.href\s*=/g) ?? []) locs.push(f); }
ok("내부 이동 <a href=\"/…\"> 0곳(전부 <Link>)", hits.length === 0, hits.slice(0, 3).join(" | "));
ok("window.location.href = 0곳(전부 router.push)", locs.length === 0, locs.slice(0, 3).join(", "));
ok("모든 <Link> 는 prefetch={false}(동적 화면 — 미리 당겨오기가 서버에서 그 화면을 그려 DB 를 부른다 · 게이트 62 가 발송 조회 +1 로 잡음)", (() => { let n = 0; for (const f of walk("app")) n += (strip(readFileSync(f, "utf8")).match(/<Link (?!prefetch=)/g) ?? []).length; return n === 0; })());
for (const f of ["app/_shell/shell.js", "app/_shell/calview.js"]) ok(`${f} — next/link`, /from "next\/link"/.test(strip(readFileSync(f, "utf8"))));
ok("달력 날짜 칸은 prefetch 를 끈다(42칸)", /<Link prefetch=\{false\}/.test(strip(readFileSync("app/_shell/calview.js", "utf8"))));
console.log(`\n■ 화면 이동 검사 ${n}건 · 실패 ${bad}`); process.exit(bad ? 1 : 0);
