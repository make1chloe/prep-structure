/** 화면 이동 검사(검사-71 · (나)-①② · (다)) — 내부 이동은 앱 전체가 Next <Link>·go() 로만: 내부 <a href="/…">·window.location.href 가 0 이어야 한다(/api·바깥 링크·다운로드는 <a> 그대로) · router.push 는 app/_shell/going.js 안에만(판 화면은 go() 로 — 띠가 켜진다).
 *  루트 loading.js 는 두지 않는다 — Suspense 경계 안의 redirect() 가 클라이언트 리다이렉트로 바뀌어 guard() 가 흔들린다(게이트 61 이 잡음) — 그 자리는 상단 띠(going.js)다.
 *  누른 즉시 표시(다): 띠는 문서 click 하나로 듣고 새 화면이 붙으면(주소) 꺼지며 LIMIT_MS 뒤엔 스스로 내린다 · 탭은 지금 탭이 파랗고(lib/menu currentTab 한 곳) 누르면 먼저 파랗다. 주석은 먼저 지운다(폰-5) */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"; import { join } from "node:path";
import { menuFor, currentTab } from "../lib/menu.js";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith(".js")) out.push(p); } return out; };
const src = walk("app").map((f) => [f, strip(readFileSync(f, "utf8"))]);
const hits = [], locs = [], pushes = [];
for (const [f, s] of src) {
  for (const t of s.match(/<a\b[^>]*>/g) ?? []) if (/href=("\/(?!api\/)|\{)/.test(t) && !/target=|download|\/api\//.test(t)) hits.push(`${f}: ${t.slice(0, 60)}`);
  for (const m of s.match(/window\.location\.href\s*=/g) ?? []) locs.push(f);
  if (f !== "app/_shell/going.js") for (const m of s.match(/router\.push\(/g) ?? []) pushes.push(f); }
ok("내부 이동 <a href=\"/…\"> 0곳(전부 <Link>)", hits.length === 0, hits.slice(0, 3).join(" | "));
ok("window.location.href = 0곳", locs.length === 0, locs.slice(0, 3).join(", "));
ok("router.push 는 app/_shell/going.js 안에만 — 판 화면은 go() 로(띠가 켜진다 · (다))", pushes.length === 0, pushes.slice(0, 3).join(", "));
ok("모든 <Link> 는 prefetch={false}(동적 화면 — 미리 당겨오기가 서버에서 그 화면을 그려 DB 를 부른다 · 게이트 62 가 발송 조회 +1 로 잡음)", src.reduce((a, [, s]) => a + (s.match(/<Link (?!prefetch=)/g) ?? []).length, 0) === 0);
for (const f of ["app/_shell/shell.js", "app/_shell/calview.js", "app/_shell/tabs.js"]) ok(`${f} — next/link`, /from "next\/link"/.test(strip(readFileSync(f, "utf8"))));
ok("달력 날짜 칸은 prefetch 를 끈다(42칸)", /<Link prefetch=\{false\}/.test(strip(readFileSync("app/_shell/calview.js", "utf8"))));
ok("루트 app/loading.js 는 없다(Suspense 안의 redirect() — 게이트 61)", !existsSync("app/loading.js"));
const going = strip(readFileSync("app/_shell/going.js", "utf8")), tabs = strip(readFileSync("app/_shell/tabs.js", "utf8")), shell = strip(readFileSync("app/_shell/shell.js", "utf8"));
ok("띠(going.js) — 문서 click 하나로 듣고(a[href] 내부만) · go() 사건도 듣고 · 주소(pathname·search)가 바뀌면 끄고 · LIMIT_MS 뒤 스스로 내린다", /^"use client"/.test(going) && /addEventListener\("click"/.test(going) && /addEventListener\(GOING/.test(going) && /usePathname\(\)/.test(going) && /useSearchParams\(\)/.test(going) && /setTimeout\([\s\S]*?LIMIT_MS\)/.test(going) && /startsWith\("\/api\/"\)/.test(going));
ok("탭(tabs.js) — 지금 탭은 lib/menu currentTab 한 곳 · 누르면 먼저 aria-current · LIMIT_MS 뒤 내린다", /^"use client"/.test(tabs) && /currentTab\b.*from "@\/lib\/menu"/.test(tabs) && /aria-current=/.test(tabs) && /setPressed\(m\.href\)/.test(tabs) && /LIMIT_MS/.test(tabs));
ok("껍질(shell.js) — <Tabs> 와 <Going>(Suspense 안 · useSearchParams) 을 상단바에 그린다", /<Tabs items=/.test(shell) && /<Suspense fallback=\{null\}><Going \/><\/Suspense>/.test(shell));
const items = menuFor("principal", []);
ok("currentTab 판단 — / 는 꼭 같을 때만(/today 가 대시보드로 안 잡힘) · 아래 주소는 가장 긴 앞머리(/schedule/todo → 일정 · /ops/students → 운영) · 메뉴에 없는 화면(/scores)·아이 화면(/me)은 null", items.length === 7 && currentTab(items, "/") === "/" && currentTab(items, "/today") === "/today" && currentTab(items, "/schedule/todo") === "/schedule" && currentTab(items, "/schedule") === "/schedule" && currentTab(items, "/ops/students") === "/ops" && currentTab(items, "/settings/routine") === "/settings" && currentTab(items, "/scores") === null && currentTab(items, "/me") === null && currentTab([], "/") === null, `items ${items.length} · ${["/", "/today", "/schedule/todo", "/scores"].map((p) => currentTab(items, p)).join(",")}`);
console.log(`\n■ 화면 이동 검사 ${n}건 · 실패 ${bad}`); process.exit(bad ? 1 : 0);
