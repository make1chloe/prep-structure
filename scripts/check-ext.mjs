/** 🃏 클래스카드 확장 검사((뎌-3) · 검사-78) — extension/ 은 게이트가 못 눌러 보는 자리라(크롬 안에서 돈다)
 *  **글자로라도** 지킨다: 확장은 긁어 보내기만 하고 판정은 앱이 한다 · 열쇠는 머리글에만 · 받는 길은 하나 ·
 *  한 번에 보내는 양은 앱 상한과 같은 수 · 비밀번호는 어디에도 안 적는다. */
import { readFileSync } from "node:fs";
import { MODES, MAX_ROWS, MAX_STUDENTS } from "../lib/cc-plan.js";
const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");   // 주석 먼저(폰-5) — 주석 속 낱말이 검사를 통과시키면 안 된다
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const bg = strip(readFileSync("extension/background.js", "utf8"));
const pop = strip(readFileSync("extension/popup.js", "utf8"));
const html = readFileSync("extension/popup.html", "utf8");
const man = JSON.parse(readFileSync("extension/manifest.json", "utf8"));

console.log("■ 확장은 긁어 보내기만 한다 — 판정은 앱 lib/cc-plan.js 한 곳(원칙-1 · 확정-⑱)");
const named = (k, src) => new RegExp(`(?<![.\\w])${k}(?![\\w])`).test(src);   // 낱말로 쓰인 것만 — label.match(…) 같은 메서드 부름은 모드 이름이 아니다
ok("우리 모드 이름(memorize·scramble·드릴 …)이 확장에 없다 — 클래스카드가 쓰는 이름을 그대로 보내고, 옮김은 앱 ALIAS 한 곳이 한다",
  !MODES.some(([k]) => named(k, bg + pop)), MODES.map(([k]) => k).filter((k) => named(k, bg + pop)).join());
ok("「목표 대 실제」를 확장이 재지 않는다 — 미달 판정·넘기기가 없다(확정-⑱ 앱도 안 넘긴다 · 원장님이 누른다)",
  !/(미달|shortOf|allOk|(got|actual)\s*[<>]=?\s*goal|goal\s*[<>]=?\s*(got|actual))/.test(bg + pop));
ok("3초훈련을 확장이 고르지 않는다 — 짐에 실려 와도 앱이 버린다(확정-⑩)", !/speed|3초/.test(bg));

console.log("■ 열쇠 — 머리글에만 · 주소·자취·화면 어디에도 안 남는다(대전제-9)");
ok("열쇠는 Authorization: Bearer 머리글로만 간다 — 주소(?key=)에 안 붙인다", /Authorization.*Bearer/.test(bg) && !/[?&]key=/.test(bg + pop));
ok("열쇠를 console 에 안 적는다 · 팝업에서는 가려 보인다(●)", !/console\.[a-z]+\([^)]*token/i.test(bg + pop) && /-webkit-text-security/.test(html));
ok("비밀번호는 어디에도 안 적는다 — 크롬에 이미 로그인된 세션(쿠키)만 쓴다", !/password|비밀번호를 저장/.test(bg + pop) && /credentials: "include"/.test(bg));
ok("type=password 를 안 쓴다 — 브라우저 자동완성이 열쇠를 덮던 사고((퍼) 9/10)와 같은 자리다", !/type=["']password/.test(html) && /data-1p-ignore/.test(html));

console.log("■ 받는 길 하나 · 앱과 같은 상한(대전제-7)");
ok("앱을 부르는 자리는 /api/cc 하나뿐이다", (bg.match(/\/api\//g) ?? []).length === 1 && /\/api\/cc/.test(bg));
ok(`한 번에 보내는 양이 앱 상한과 같은 수(아이 ${MAX_STUDENTS} · 줄 ${MAX_ROWS}) — 넘겨 보내면 앱이 짐 전체를 되돌린다`,
  new RegExp(`MAX_ROWS = ${MAX_ROWS}\\b`).test(bg) && new RegExp(`MAX_STUDENTS = ${MAX_STUDENTS}\\b`).test(bg));
ok("상한을 넘으면 짐을 나눠 보낸다(chunk) — 한 아이의 줄이 많아도 나눈다", /function chunk\(/.test(bg) && /MAX_ROWS - rows/.test(bg));

console.log("■ 조용히 멈추지 않는다");
ok("실패는 저장소에 남고 팝업이 그것을 읽는다 — 팝업을 닫았다 열어도 남아 있다", /lastError/.test(bg) && /lastError/.test(pop));
ok("한 아이가 막혀도 나머지는 보낸다(그 아이의 줄이 없는 것으로 드러난다)", /catch \{/.test(bg));
ok("15분마다 저절로 돈다(alarms) · 크롬을 켤 때도 다시 잡는다", /periodInMinutes/.test(bg) && /onStartup/.test(bg));

console.log("■ manifest");
ok("MV3 · 쿠키를 쓰는 곳은 클래스카드와 앱 둘뿐 · 여분 권한이 없다", man.manifest_version === 3
  && man.host_permissions.some((h) => h.includes("classcard.net")) && man.host_permissions.some((h) => h.includes("chloe-english"))
  && JSON.stringify(man.permissions) === JSON.stringify(["alarms", "storage"]), JSON.stringify(man.permissions));
console.log(`\n■ 클래스카드 확장 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
