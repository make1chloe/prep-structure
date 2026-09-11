/** 검사 — 화면에 **들어갈 길**이 있나(원장님 2026-09-11 「누락된 페이지나 메뉴 … 불편한 동선」).
 *  첫 주 돌려보기에서 「📄 내신 자료(04)」가 상단 메뉴에서 두 번 눌러도 못 닿았다 — 회차 카드의 링크 하나뿐이라,
 *  회차가 아직 없는 첫 주에는 길이 아예 없었다. 그 일을 다시 잡는다.
 *  글자만 본다(DB·브라우저 없이) — 탭(lib/menu) + 각 화면 board/page 가 걸어 둔 내부 링크로 걸음 수를 센다. */
import fs from "node:fs";
import path from "node:path";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");   // 폰-5: 주석을 먼저 지운다(주석 속 주소는 길이 아니다)
const 화면들 = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name);
  if (f.isDirectory()) { if (!["api", "_shell", "login", "logout", "password", "push"].includes(f.name)) walk(p); }
  else if (f.name === "page.js") 화면들.push("/" + path.relative("app", d).replace(/\\/g, "/")); } })("app");
const 원장쪽 = 화면들.map((x) => (x === "/." ? "/" : x)).filter((x) => !x.startsWith("/me") && !x.startsWith("/parent")).sort();

// 탭 = 한 걸음
const menu = strip(fs.readFileSync("lib/menu.js", "utf8"));
const perm = strip(fs.readFileSync("lib/perm.js", "utf8"));
const 한걸음 = new Set([...menu.matchAll(/href:\s*"([^"]+)"/g), ...perm.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]));

// 화면이 걸어 둔 내부 링크 — 한 갈래 링크(_shell/sibs.js)도 편다
const sibs = strip(fs.readFileSync("app/_shell/sibs.js", "utf8"));
const 갈래 = [...sibs.matchAll(/\[\s*\[[\s\S]*?\]\s*\]/g)].map((m) => [...m[0].matchAll(/"(\/[^"]*)"/g)].map((x) => x[1]));
const 링크 = new Map();   // 화면 → 그 화면에서 갈 수 있는 곳
for (const s of 원장쪽) {
  const dir = s === "/" ? "app" : "app" + s;
  const 글 = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => strip(fs.readFileSync(path.join(dir, f), "utf8"))).join("\n");
  const out = new Set([...글.matchAll(/href=\{?["'`](\/[^"'`?]*)/g)].map((m) => m[1]));
  if (/<Sibs\s+here="([^"]+)"/.test(글)) { const here = 글.match(/<Sibs\s+here="([^"]+)"/)[1]; for (const fam of 갈래) if (fam.includes(here)) for (const h of fam) out.add(h); }
  링크.set(s, out);
}
const 걸음 = (to) => { if (한걸음.has(to)) return 1;
  for (const from of 한걸음) if (링크.get(from)?.has(to)) return 2;
  for (const [from, out] of 링크) if (out.has(to)) for (const f2 of 한걸음) if (링크.get(f2)?.has(from)) return 3;
  return 0; };

console.log("■ 원장 쪽 화면마다 들어갈 길(탭 1걸음 · 화면 링크 2걸음)");
const 멀다 = [];
for (const s of 원장쪽) { const g = 걸음(s); if (g === 0 || g > 2) 멀다.push([s, g]); }
ok(`화면 ${원장쪽.length}개가 모두 **두 걸음 안**에 있다`, !멀다.length, 멀다.map(([s, g]) => `${s}(${g || "못 닿음"})`).join(" · "));
ok("갈래 링크는 lib 이 아니라 app/_shell/sibs.js 한 곳에(원칙-1)", 갈래.length > 0 && 갈래[0].length >= 3, `갈래 ${갈래.length}`);
for (const fam of 갈래) for (const h of fam) ok(`갈래 안의 ${h} 가 실재하는 화면이다`, 원장쪽.includes(h), `화면 목록에 없음`);
// 갈래에 든 화면은 서로 다 오갈 수 있어야 한다 — 하나만 빠져도 첫 주에 길이 끊긴다
for (const fam of 갈래) for (const from of fam) ok(`${from} 에서 같은 갈래 ${fam.length - 1}곳으로 다 간다`, fam.every((to) => to === from || 링크.get(from)?.has(to)), `못 가는 곳 ${fam.filter((to) => to !== from && !링크.get(from)?.has(to)).join(",")}`);

// ── 화면의 말 — 원장님 2026-09-11 「불필요한 설명 … 사용자가 파악하기 어려운 구조」
console.log("\n■ 화면이 하는 말");
{ // ① 「못 열었습니다」 카드를 화면마다 베끼지 않는다 — 한 벌(app/_shell/oops.js). 베낀 15벌에는 **옛 마이그레이션 번호**가 박혀 있었다(0118~0128, 실제는 0160)
  const 제손 = [];
  for (const f of 화면들.map((x) => (x === "/." ? "app/page.js" : `app${x}/page.js`))) { const 글 = strip(fs.readFileSync(f, "utf8"));
    if (/못 열었습니다/.test(글) && !/<Oops\b/.test(글)) 제손.push(f); }
  ok("「…을 못 열었습니다」 카드는 app/_shell/oops.js 한 벌만(원칙-1)", !제손.length, 제손.join(" · "));
  ok("마이그레이션 번호를 화면에 박아 두지 않는다(번호는 늘 옛것이 된다)", !제손.length && ![...fs.readdirSync("app", { recursive: true })].some((f) => String(f).endsWith(".js") && /마이그레이션을 먼저 돌립니다/.test(fs.readFileSync(`app/${f}`, "utf8"))));
}
{ // ② 개발 메모(규칙 번호 · 원장님 말씀 날짜)가 **보이는 글**로 새지 않는다 — 주석에는 얼마든지 적는다
  const 인용 = /원장님\s*(답\s*)?\d{1,2}\/\d{1,2}|원장님\s*20\d\d-\d\d-\d\d|원장님 답 기다림|확정-[⑤-⑳㉑-㊿]|대전제-\d|원칙-\d|속도-\d|뼈대-\d|검사-[⑤-⑳]|목업 \d\d?\b/;
  const 샌곳 = [];
  for (const f of [...fs.readdirSync("app", { recursive: true })].filter((x) => String(x).endsWith(".js"))) {
    const 글 = strip(fs.readFileSync(`app/${f}`, "utf8"));
    for (const m of 글.matchAll(/>([^<>{}]{3,300})</g)) if (인용.test(m[1])) 샌곳.push(`app/${f}: ${m[1].trim().slice(0, 60)}`);
    for (const m of 글.matchAll(/(?:placeholder|title)=["']([^"']{3,300})["']/g)) if (인용.test(m[1])) 샌곳.push(`app/${f}(placeholder): ${m[1].trim().slice(0, 60)}`);
  }
  ok("규칙 번호·원장님 말씀 날짜가 **화면 글**에 안 나온다(주석·문서에만)", !샌곳.length, `${샌곳.length}곳 — ${샌곳.slice(0, 4).join(" / ")}`);
}
console.log(`\n■ 들어갈 길 · 화면의 말 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
