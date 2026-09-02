/** 메뉴 검사 — 계획 0단계 10번 「어느 화면에서든 늘 손에 닿아야 하는 것」 */
import { SECTIONS, FAMILY, HOME, QUICK, currentOf, menuFor } from "../lib/menu.js";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

console.log("■ 메뉴 한 벌");
ok("역할마다 첫 화면이 셋 다 있다", HOME.staff && HOME.parent && HOME.student);
// ⚠️ 같은 값이 두 곳에 있으면 언젠가 갈린다 — supabase-server 와 글자까지 같아야 한다
const srv = existsSync("lib/supabase-server.js") ? readFileSync("lib/supabase-server.js", "utf8") : "";
for (const [role, href] of Object.entries(HOME))
  ok(`첫 화면이 lib/supabase-server.js 와 같다 — ${role} → ${href}`,
     !srv || new RegExp(`${role}[^\\n]{0,40}["']${href.replace("/", "\\/")}["']`).test(srv)
          || srv.includes(`"${href}"`), "두 곳이 갈리면 로그인 뒤 엉뚱한 화면으로 간다");

console.log("\n■ 지금 어느 메뉴인가");
ok("「/」는 대시보드에만 걸린다 (모든 주소에 안 걸린다)", currentOf("/") === "/" && currentOf("/today") === "/today");
ok("아래 주소도 그 메뉴로 본다", currentOf("/today/2026-09-02") === "/today");
// ⚠️ 짧은 것이 이기면 「/」가 모든 주소에 걸려 메뉴가 늘 「대시보드」로 뜬다
ok("긴 것이 이긴다", currentOf("/schedule/2026-09", [{href:"/"},{href:"/schedule"}]) === "/schedule");
ok("아래 화면도 그 메뉴 안에 있다", currentOf("/parent/upload", FAMILY.parent) === "/parent");
ok("모르는 주소는 아무 것도 안 고른다", currentOf("/zzz") === null);
ok("주소가 없으면 안 터진다", currentOf(null) === null);

console.log("\n■ 누가 무엇을 보나");
ok("원장은 대메뉴를 본다", menuFor("staff").length === SECTIONS.length);
ok("아이는 자기 화면만", menuFor("student").length === 1);
ok("학부모는 자기 화면 하나", menuFor("parent").length === 1);
ok("⚠️ **역할을 모르면 아무것도 안 준다** (짐작해서 열지 않는다)", menuFor(null).length === 0);
ok("⚠️ 아이 메뉴에 원장 화면이 하나도 안 섞였다",
   !menuFor("student").some((m) => SECTIONS.some((s) => s.href === m.href && s.href !== "/me")));

console.log("\n■ 메뉴가 가리키는 화면이 실제로 있나");
const missing = [...SECTIONS, ...FAMILY.student, ...FAMILY.parent]
  .filter((s) => {
    const p = s.href === "/" ? "app/page.js" : `app${s.href}/page.js`;
    return !existsSync(p);
  }).map((s) => `${s.href} (${s.name})`);
ok("메뉴가 **없는 화면을 가리키지 않는다** (누르면 404 다)", missing.length === 0, missing.join(" · "));

console.log("\n■ 늘 손에 닿아야 하는 것 (0단계 10번)");
ok("퀵메모 입력 글씨가 16px 이상이다 (아이폰이 확대하고 **닫아도 확대가 남는다**)", QUICK.minFont >= 16);
// ⚠️ 메뉴를 스크롤로 접는 자리가 있으면 화면이 짧을 때 다시 펼 길이 없다
const walk = (d, out = []) => { for (const f of readdirSync(d)) {
  if (["_tmp","sandbox","node_modules",".next",".git"].includes(f)) continue;
  const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
    : /\.(js|jsx|css)$/.test(f) && out.push(p); } return out; };
const hides = walk("app").filter((f) => /nav|menu|메뉴/i.test(readFileSync(f, "utf8"))
  && /scroll[\s\S]{0,80}(hide|접|translateY)/i.test(readFileSync(f, "utf8")));
ok("**스크롤로 메뉴를 접는 자리가 없다** — 접히면 짧은 화면에서 다시 펼 길이 없다",
   hides.length === 0, hides.join(" "));

/* ══ ⚠️⚠️ **메뉴가 진짜로 화면에 붙어 있나** ══════════════════════════════
 * 이 검사는 오래 **상수와 파일 존재만** 보았다. 그래서 `<Nav>` 를 부르는 곳이
 * **0곳**이던 동안에도 18/18 초록이었다 — 대시보드에서 밖으로 나가는 링크가 하나도 없고
 * /today·/schedule 은 들어가면 못 나오는 상태였는데 아무도 안 잡았다(2026-09-02 전수 훑기).
 * → 이제 **그려지는 자리**를 본다. 상수가 아니라 붙어 있는지를.                        */
console.log("\n■ 메뉴가 **진짜로 붙어 있나** (0-10)");
const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const 앱 = walk("app").filter((f) => /\.jsx?$/.test(f));
const 그리는곳 = 앱.filter((f) => /<Nav\b/.test(코드만(readFileSync(f, "utf8"))));
ok("⚠️ `<Nav>` 를 **그리는 자리가 있다**", 그리는곳.length > 0,
   "0곳이면 메뉴가 아무 화면에도 안 붙는다 — 대시보드에서 아무 데도 못 간다");

// ⚠️ 화면마다 붙이면 **새 화면을 만든 날 그 화면만 메뉴가 없다.** layout 이 한 번 그려야 한다
const 껍데기 = 앱.filter((f) => /app\/(layout|_nav\/)/.test(f) && /<Nav\b/.test(코드만(readFileSync(f, "utf8"))));
ok("⚠️ 메뉴는 **layout 쪽에서 한 번** 그린다 (화면마다 붙이면 새 화면만 빠진다)",
   껍데기.length > 0, `그리는 곳: ${그리는곳.join(" ") || "없음"}`);

// ⚠️ layout 이 그 껍데기를 실제로 쓰는가 — 부품만 있고 안 쓰면 앞 단언이 헛돈다
const lay = existsSync("app/layout.js") ? 코드만(readFileSync("app/layout.js", "utf8")) : "";
ok("⚠️ `app/layout.js` 가 그 껍데기를 **실제로 그린다**",
   /<Nav\b/.test(lay) || /<Shell\b/.test(lay), "layout 이 안 그리면 어느 화면에도 안 붙는다");

// ⚠️ `nav.js` 는 `{onQuick && …}` 이라 **안 넘기면 퀵메모 단추가 아예 안 그려진다**
const nav = existsSync("app/nav.js") ? 코드만(readFileSync("app/nav.js", "utf8")) : "";
const 조건부 = /onQuick\s*&&/.test(nav);
const 넘기는곳 = 앱.filter((f) => /onQuick\s*=\s*\{/.test(코드만(readFileSync(f, "utf8"))));
ok(`⚠️ 퀵메모를 **넘기는 자리가 있다** (nav 가 ${조건부 ? "조건부라 안 넘기면 단추가 안 그려진다" : "무조건 그린다"})`,
   !조건부 || 넘기는곳.length > 0, "onQuick 을 안 넘기면 0-10 의 퀵메모가 화면에 없는 것과 같다");

// ⚠️ 나가는 길 — 홈에 깐 앱에는 주소창도 뒤로가기도 없다(대전제-10)
ok("⚠️ 메뉴에 **나가는 길**이 있다 (홈에 깐 앱엔 주소창이 없다)",
   /\/login/.test(nav), "app/nav.js 에 로그인/나가기 링크가 없다");

console.log(`\n■ 메뉴 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
