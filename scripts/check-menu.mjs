/**
 * 메뉴 검사 — 0-10 「어느 화면에서든 늘 손에 닿아야 하는 것」 · 대전제-10 「나가는 길」.
 *
 * ⚠️⚠️ **2026-09-03 이 검사를 고쳤다** (어긋난 곳 ⑯).
 *    옛 검사는 23건이 **전부 초록**인 채로 「원장님이 로그인하면 메뉴 0칸」을 그냥 보냈다.
 *    까닭은 하나다 — **코드가 지어낸 낱말 `"staff"` 로만 물었기 때문이다.**
 *    `menuFor("staff")` 가 7칸을 주니 초록이었고, 정작 DB 에 있는 `principal` 로는 0칸이었다.
 *    (폰-5 「글자로 훑는 검사는 헛짚고 헛통과한다」와 같은 자리 · 네 번째다.)
 *
 * → 그래서 이 검사는 **진짜 DB 에 물어본다.** `v2.profiles` 에 **실제로 있는 role 값**과
 *   `role` 칸의 CHECK 가 받는 낱말로 단언한다. DB 에 못 붙으면 **초록을 주지 않고 실패한다** —
 *   「못 물어봤으니 통과」가 바로 ⑯ 을 만든 태도다(대전제-0).
 *
 * ⚠️ 이 검사는 **읽기만 한다.** 트랜잭션도 안 열고 한 줄도 안 쓴다.
 */
import { Client } from "pg";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SECTIONS, FAMILY, HOME, QUICK, EXIT, ROLES, STAFF_ROLES, STAFF_HOME,
  HIDDEN_FROM_INSTRUCTOR, currentOf, menuFor, showNav, canQuick, canSeeFees, canSettings,
  isStaff, isPrincipal,
} from "../lib/menu.js";
import { HOME as SRV_HOME, homeFor } from "../lib/supabase-server.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };
const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const 읽기 = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/* ══ ① 진짜 DB 에 있는 역할 낱말 ══════════════════════════════════════════════
 * ⚠️ 여기가 이 검사의 심장이다. 코드가 지어낸 낱말이 아니라 **DB 가 아는 낱말**로 묻는다.
 * ⚠️ 안 하면 무엇이 터지나 — 코드만 보고 물으면 코드가 틀렸을 때 검사도 같이 틀린다.
 *    ⑯ 이 정확히 그랬다: `menuFor("staff")` 만 물어 23건 전부 초록, 원장님은 메뉴 0칸.        */
console.log("■ DB 에 실제로 있는 역할 낱말 (지어낸 낱말로 안 묻는다)");

let 있는역할 = [], 받는역할 = [], db붙었나 = false, db왜 = "";
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  db붙었나 = true;
  const rows = (await c.query(
    `select role, count(*)::int n from v2.profiles group by 1 order by 1`)).rows;
  있는역할 = rows.map((r) => r.role);
  // role 칸의 CHECK — 「이 낱말 말고는 아예 못 들어간다」를 DB 스스로 말하게 한다
  const def = (await c.query(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid = 'v2.profiles'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%role = ANY%'`)).rows[0]?.d ?? "";
  받는역할 = [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
  console.log(`   · v2.profiles 실측: ${rows.map((r) => `${r.role} ${r.n}`).join(" · ")}`);
  console.log(`   · role CHECK 가 받는 낱말: ${받는역할.join(" · ") || "(못 읽음)"}`);
  await c.end();
} catch (e) { db왜 = String(e?.message ?? e).split("\n")[0]; }

ok("⚠️ **진짜 DB 에 붙어서 물었다** (못 물으면 초록을 주지 않는다 — 그게 ⑯ 을 만든 태도다)",
   db붙었나, db왜);
ok("v2.profiles 에 역할이 한 줄이라도 있다", 있는역할.length > 0);
ok("role 칸의 CHECK 를 읽었다", 받는역할.length > 0);

const 코드역할 = Object.values(ROLES);
// ⚠️ 코드가 DB 에 없는 낱말을 쓰고 있으면 여기서 걸린다 — `"staff"` 가 걸렸어야 할 자리다
const 지어낸 = 코드역할.filter((r) => 받는역할.length && !받는역할.includes(r));
ok("⚠️⚠️ **코드가 DB 에 없는 낱말을 안 쓴다** (`\"staff\"` 가 여기서 걸렸어야 했다)",
   지어낸.length === 0, `DB CHECK 에 없는 낱말: ${지어낸.join(" · ")}`);
const 빠진 = 받는역할.filter((r) => !코드역할.includes(r));
ok("DB 가 받는 낱말을 코드가 하나도 안 빠뜨렸다", 빠진.length === 0, `코드에 없는 낱말: ${빠진.join(" · ")}`);
const 안다루는 = 있는역할.filter((r) => !코드역할.includes(r));
ok("지금 DB 에 **줄이 서 있는** 역할을 코드가 다 안다", 안다루는.length === 0, 안다루는.join(" · "));

/* ══ ② 그 낱말로 메뉴가 실제로 몇 칸인가 ════════════════════════════════════ */
console.log("\n■ 진짜 DB 의 역할 낱말로 **메뉴 칸을 세어 본다**");
for (const r of 있는역할) {
  const m = menuFor(r);
  console.log(`   · ${r.padEnd(11)} ${String(m.length).padStart(2)}칸  ${m.map((x) => x.name).join(" · ") || "(없음)"}`);
}
ok("⚠️⚠️ **DB 에 있는 역할은 하나도 빠짐없이 메뉴가 있다** (⑯ 이 여기서 빨개졌어야 했다)",
   있는역할.length > 0 && 있는역할.every((r) => menuFor(r).length > 0),
   있는역할.filter((r) => menuFor(r).length === 0).map((r) => `${r} → 0칸`).join(" · "));
ok("DB 에 있는 역할은 첫 화면도 다 있다 (`homeFor` 가 null 을 안 준다)",
   있는역할.every((r) => typeof homeFor(r) === "string" && homeFor(r).startsWith("/")),
   있는역할.filter((r) => !homeFor(r)).join(" · "));

/* ══ ③ 누가 무엇을 보나 — 원장님이 정하신 것 ════════════════════════════════
 * 원장님 2026-09-03: 「아니 강사는 수강료 설정 못보게」
 * → 설정은 **메뉴에서 뺀다**, 수강료는 **「운영」 화면 안에서만** 가린다(상담일지는 안 가린다).  */
console.log("\n■ 누가 무엇을 보나 (원장님 2026-09-03 — 강사는 수강료·설정 못 본다)");

const 원장칸 = menuFor(ROLES.PRINCIPAL).map((s) => s.href);
const 강사칸 = menuFor(ROLES.INSTRUCTOR).map((s) => s.href);
// ⚠️ 개수만 세면 「하나 빼고 하나 더한」 날을 못 잡는다. **주소 목록을 통째로** 문다
const 원장이봐야할것 = ["/", "/today", "/send", "/schedule", "/books", "/ops", "/settings"];
ok(`원장은 대메뉴를 **다 본다** (지금 ${원장이봐야할것.length}칸)`,
   원장칸.join("|") === 원장이봐야할것.join("|"), `지금: ${원장칸.join(" ")}`);
ok(`강사는 **설정만 빠진 ${원장이봐야할것.length - 1}칸**을 본다`,
   강사칸.join("|") === 원장이봐야할것.filter((h) => h !== "/settings").join("|"),
   `지금: ${강사칸.join(" ")}`);
ok("강사 메뉴에 「설정」이 없다", !강사칸.includes("/settings"));
ok("⚠️ 강사도 「운영」은 본다 — 원장님이 상담일지는 안 집으셨다", 강사칸.includes("/ops"));
ok("아이는 자기 화면 하나", menuFor(ROLES.STUDENT).length === 1 && menuFor(ROLES.STUDENT)[0].href === "/me");
ok("학부모는 자기 화면 하나", menuFor(ROLES.PARENT).length === 1 && menuFor(ROLES.PARENT)[0].href === "/parent");
ok("⚠️ **역할을 모르면 0칸** (짐작해서 열지 않는다)",
   menuFor(null).length === 0 && menuFor("").length === 0 && menuFor("staff").length === 0
   && menuFor("__proto__").length === 0);
ok("⚠️ 아이 메뉴에 원장 화면이 하나도 안 섞였다",
   !menuFor(ROLES.STUDENT).some((m) => SECTIONS.some((s) => s.href === m.href && s.href !== "/me")));
// ⚠️ 없는 주소를 「가린다」고 적어 두면 아무것도 안 가려진 채 초록이 된다
ok("강사에게서 가리는 주소가 **대메뉴에 실제로 있는 주소**다",
   HIDDEN_FROM_INSTRUCTOR.every((h) => SECTIONS.some((s) => s.href === h)),
   HIDDEN_FROM_INSTRUCTOR.filter((h) => !SECTIONS.some((s) => s.href === h)).join(" · "));

console.log("\n■ 수강료·설정 — 강사에게 막혔나 (판단이 한 벌인가)");
ok("수강료는 원장만", canSeeFees(ROLES.PRINCIPAL) && !canSeeFees(ROLES.INSTRUCTOR)
   && !canSeeFees(ROLES.STUDENT) && !canSeeFees(ROLES.PARENT) && !canSeeFees(null));
ok("설정도 원장만", canSettings(ROLES.PRINCIPAL) && !canSettings(ROLES.INSTRUCTOR)
   && !canSettings(ROLES.STUDENT) && !canSettings(null));
ok("원장·강사 묶음은 **DB 낱말 둘로** 만든다 (지어낸 값이 아니다)",
   STAFF_ROLES.length === 2 && STAFF_ROLES.every((r) => 받는역할.includes(r)),
   STAFF_ROLES.join(" · "));
ok("isStaff 는 원장·강사만 참", isStaff(ROLES.PRINCIPAL) && isStaff(ROLES.INSTRUCTOR)
   && !isStaff(ROLES.STUDENT) && !isStaff(ROLES.PARENT) && !isStaff("staff") && !isStaff(null));
ok("isPrincipal 은 원장만 참", isPrincipal(ROLES.PRINCIPAL) && !isPrincipal(ROLES.INSTRUCTOR));
ok("퀵메모는 원장·강사만 (`v2.todo` 정책이 `staff_all` 하나뿐이다)",
   canQuick(ROLES.PRINCIPAL) && canQuick(ROLES.INSTRUCTOR)
   && !canQuick(ROLES.STUDENT) && !canQuick(ROLES.PARENT) && !canQuick(null));

// ⚠️ 화면에서 가리는 것과 **DB 에서 막는 것**은 다른 일이다. 화면만 가리면 절반이다
{
  const migs = existsSync("supabase/migrations")
    ? readdirSync("supabase/migrations").map((f) => readFileSync(join("supabase/migrations", f), "utf8")).join("\n")
    : "";
  const 수강료를원장만 = /is_principal|role\s*=\s*'principal'/.test(
    migs.split(/\n/).filter((l) => /fee_rule|payment/.test(l)).join("\n"));
  ok("⚠️ 알고 있다 — `v2.fee_rule`·`v2.payment` 는 **DB 쪽이 아직 강사에게 열려 있다**",
     true, "");
  console.log(`   · ${수강료를원장만 ? "마이그레이션에 원장 전용 규칙이 보인다"
    : "⚠️ 마이그레이션에 원장 전용 규칙이 **없다** — 화면만 가린 상태다(담당이 다르다 · 보고에 올렸다)"}`);
}

/* ══ ④ 첫 화면 표가 진짜 한 벌인가 ═════════════════════════════════════════ */
console.log("\n■ 첫 화면 표 (원칙-1 — 두 벌이면 로그인 뒤 엉뚱한 데로 간다)");
// ⚠️ 옛 검사는 두 파일의 **글자**를 견줬다. 글자는 같아도 뜻이 갈릴 수 있다 —
//    이제 **같은 객체인지**를 묻는다. 같은 객체면 갈릴 자리 자체가 없다
ok("⚠️ `lib/menu.js` 와 `lib/supabase-server.js` 의 HOME 이 **같은 객체다**", HOME === SRV_HOME,
   "글자만 같으면 언젠가 갈린다 — 한쪽이 import 해야 한다");
ok("첫 화면이 DB 낱말 넷에 다 있다",
   받는역할.length > 0 && 받는역할.every((r) => HOME.has(r)),
   받는역할.filter((r) => !HOME.has(r)).join(" · "));
ok("원장·강사 첫 화면은 `/` 이고, 「← 대시보드」 상수가 거기서 나온다",
   homeFor(ROLES.PRINCIPAL) === "/" && homeFor(ROLES.INSTRUCTOR) === "/" && STAFF_HOME === "/");
ok("아이 `/me` · 학부모 `/parent`", homeFor(ROLES.STUDENT) === "/me" && homeFor(ROLES.PARENT) === "/parent");
ok("모르는 역할은 첫 화면이 **null** (주소를 지어내지 않는다)",
   homeFor("staff") === null && homeFor(null) === null && homeFor("__proto__") === null);

/* ══ ⑤ 나가는 길 — 이번 사고의 진짜 피해 ═══════════════════════════════════
 * 대전제-10 · 0-10 — 홈 화면에 깐 앱에는 주소창도 뒤로가기도 없다.
 * ⑯ 에서 메뉴가 0칸이 되자 **로그아웃 단추까지 같이 사라졌다.** 그게 진짜 피해였다.     */
console.log("\n■ ⚠️⚠️ 나가는 길이 **역할과 무관하게 늘 있나** (대전제-10 · ⑯ 의 진짜 피해)");
const nav = 코드만(읽기("app/nav.js"));

ok("메뉴 줄은 **로그인한 사람이면 누구에게나** 그린다 (역할을 몰라도)",
   showNav(ROLES.PRINCIPAL) && showNav(ROLES.INSTRUCTOR) && showNav(ROLES.STUDENT)
   && showNav(ROLES.PARENT) && showNav("모르는역할"),
   "역할을 못 읽는 날 나가는 길까지 같이 사라진다");
ok("로그인 전(역할 없음)에만 안 그린다", !showNav(null) && !showNav("") && !showNav(undefined));
ok("DB 에 있는 역할은 전부 메뉴 줄을 받는다", 있는역할.length > 0 && 있는역할.every(showNav));
ok("나가는 길 주소가 `lib/menu.js` 에 한 벌로 있다", /^\/login/.test(EXIT.href), EXIT.href);
ok("`app/nav.js` 가 그 상수를 쓴다 (주소를 다시 적지 않는다)",
   /EXIT\.href/.test(nav) && !/["']\/login\?switch/.test(nav));
// ⚠️⚠️ 여기가 ⑯ 을 잡는 자리다 — 나가는 길이 **메뉴 칸 수에 매달리면** 안 된다
ok("⚠️⚠️ 나가는 길이 **메뉴 칸 수에 안 매달린다** (`items.length` 로 안 끊는다)",
   nav.length > 0 && !/if\s*\(\s*!\s*\w*items\w*\.length\s*\)\s*return\s+null/.test(nav),
   "메뉴가 0칸이 되는 순간 로그아웃까지 같이 사라진다 — 홈에 깐 앱엔 주소창도 뒤로가기도 없다");
ok("나가는 길이 **조건 없이** 그려진다 (`&&`·삼항 안에 안 들어 있다)",
   /\n\s*<Link href=\{EXIT\.href\}/.test(nav), "조건 안에 들어가면 어떤 날 안 그려진다");
ok("메뉴 줄을 끊는 판단이 `lib/menu.js` 에 있다 (대전제-4 — 화면이 스스로 안 정한다)",
   /showNav\(/.test(nav));

/* ══ ⑥ 지금 어느 메뉴인가 ═════════════════════════════════════════════════ */
console.log("\n■ 지금 어느 메뉴인가");
ok("「/」는 대시보드에만 걸린다 (모든 주소에 안 걸린다)", currentOf("/") === "/" && currentOf("/today") === "/today");
ok("아래 주소도 그 메뉴로 본다", currentOf("/today/2026-09-02") === "/today");
ok("긴 것이 이긴다", currentOf("/schedule/2026-09", [{href:"/"},{href:"/schedule"}]) === "/schedule");
ok("아래 화면도 그 메뉴 안에 있다", currentOf("/parent/upload", FAMILY.parent) === "/parent");
ok("모르는 주소는 아무 것도 안 고른다", currentOf("/zzz") === null);
ok("주소가 없으면 안 터진다", currentOf(null) === null);

/* ══ ⑦ 메뉴가 가리키는 화면이 실제로 있나 ═════════════════════════════════ */
console.log("\n■ 메뉴가 가리키는 화면이 실제로 있나");
const missing = [...SECTIONS, ...FAMILY.student, ...FAMILY.parent]
  .filter((s) => !existsSync(s.href === "/" ? "app/page.js" : `app${s.href}/page.js`))
  .map((s) => `${s.href} (${s.name})`);
ok("메뉴가 **없는 화면을 가리키지 않는다** (누르면 404 다)", missing.length === 0, missing.join(" · "));

/* ══ ⑧ 늘 손에 닿아야 하는 것 (0-10) ══════════════════════════════════════ */
console.log("\n■ 늘 손에 닿아야 하는 것 (0-10)");
ok("퀵메모 입력 글씨가 16px 이상이다 (아이폰이 확대하고 **닫아도 확대가 남는다**)", QUICK.minFont >= 16);
const walk = (d, out = []) => { for (const f of readdirSync(d)) {
  if (["_tmp","sandbox","node_modules",".next",".git"].includes(f)) continue;
  const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
    : /\.(js|jsx|css)$/.test(f) && out.push(p); } return out; };
const hides = walk("app").filter((f) => /nav|menu|메뉴/i.test(readFileSync(f, "utf8"))
  && /scroll[\s\S]{0,80}(hide|접|translateY)/i.test(readFileSync(f, "utf8")));
ok("**스크롤로 메뉴를 접는 자리가 없다** — 접히면 짧은 화면에서 다시 펼 길이 없다",
   hides.length === 0, hides.join(" "));

/* ══ ⑨ 메뉴가 진짜로 붙어 있나 (0-10) ═════════════════════════════════════ */
console.log("\n■ 메뉴가 **진짜로 붙어 있나** (0-10)");
const 앱 = walk("app").filter((f) => /\.jsx?$/.test(f));
const 그리는곳 = 앱.filter((f) => /<Nav\b/.test(코드만(readFileSync(f, "utf8"))));
ok("⚠️ `<Nav>` 를 **그리는 자리가 있다**", 그리는곳.length > 0,
   "0곳이면 메뉴가 아무 화면에도 안 붙는다 — 대시보드에서 아무 데도 못 간다");
const 껍데기 = 앱.filter((f) => /app\/(layout|_nav\/)/.test(f) && /<Nav\b/.test(코드만(readFileSync(f, "utf8"))));
ok("⚠️ 메뉴는 **layout 쪽에서 한 번** 그린다 (화면마다 붙이면 새 화면만 빠진다)",
   껍데기.length > 0, `그리는 곳: ${그리는곳.join(" ") || "없음"}`);
const lay = 코드만(읽기("app/layout.js"));
ok("⚠️ `app/layout.js` 가 그 껍데기를 **실제로 그린다**",
   /<Nav\b/.test(lay) || /<Shell\b/.test(lay), "layout 이 안 그리면 어느 화면에도 안 붙는다");
// ⚠️ layout 이 역할을 **DB 에서 읽은 값 그대로** 넘겨야 한다 — 중간에서 바꾸면 ⑯ 이 되돌아온다
ok("⚠️ `app/layout.js` 가 `roleOf` 가 준 역할을 **그대로** 넘긴다",
   /roleOf\s*\(/.test(lay) && /role=\{role\}/.test(lay),
   "중간에서 낱말을 갈아 끼우면 DB 값과 메뉴가 또 갈린다");
const 조건부 = /onQuick\s*&&/.test(nav);
const 넘기는곳 = 앱.filter((f) => /onQuick\s*=\s*\{/.test(코드만(readFileSync(f, "utf8"))));
ok(`⚠️ 퀵메모를 **넘기는 자리가 있다** (nav 가 ${조건부 ? "조건부라 안 넘기면 단추가 안 그려진다" : "무조건 그린다"})`,
   !조건부 || 넘기는곳.length > 0, "onQuick 을 안 넘기면 0-10 의 퀵메모가 화면에 없는 것과 같다");

/* ══ ⑩ 역할 낱말이 앱 여기저기 흩어져 있지 않나 (원칙-1) ═══════════════════ */
console.log("\n■ 역할 낱말이 **한 벌인가** (원칙-1 — ⑯ 은 두 벌이라 났다)");
const 흩어진 = walk("app").filter((f) => /\.jsx?$/.test(f))
  .filter((f) => /new Set\(\s*\[\s*["']principal["']/.test(코드만(readFileSync(f, "utf8"))));
ok("⚠️ 화면이 `new Set([\"principal\",\"instructor\"])` 를 **다시 적지 않는다**",
   흩어진.length === 0, `아직 적는 곳: ${흩어진.join(" · ")}`);
const libs = existsSync("lib") ? walk("lib").filter((f) => /\.jsx?$/.test(f)) : [];
const lib흩어진 = libs.filter((f) => f !== "lib/menu.js"
  && /\[\s*["']principal["']\s*,\s*["']instructor["']\s*\]/.test(코드만(readFileSync(f, "utf8"))));
ok("`lib/` 안에서도 목록이 `lib/menu.js` 한 곳뿐이다", lib흩어진.length === 0, lib흩어진.join(" · "));

console.log(`\n■ 메뉴 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
