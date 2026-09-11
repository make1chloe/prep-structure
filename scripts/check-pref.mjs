/** 카드 순서·접기 검사((어2) 검사-82 · 확정-⑮ · 목업 07 「오늘 접기」) — 순수 셈(lib/pref-plan.js)과 규칙 셋:
 *    · 부분만 보내도 나머지가 안 지워진다(⇅ 는 order 만 · ▾ 는 fold 하나만)
 *    · **접기는 다시 조회하지 않는다**(속도-1) — fold.js 에 router.refresh·revalidate 가 없다
 *    · 세 화면(07·09·17)이 **같은 조각**을 쓴다 — 접기를 두 벌로 그리지 않는다(원칙-1)
 *    · 접혀도 **머리와 알약(개수)** 은 보인다(확정-⑮ 「끝낸 것은 접고 개수만」) — CSS 가 머리만 남긴다
 *  글자로 훑는 곳은 주석을 먼저 지운다(폰-5) */
import { readFileSync } from "node:fs";
import { orderCards, moveId, parseLayout, foldedOf, toggleFold, applyPatch, SCREENS } from "../lib/pref-plan.js";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };

console.log("■ 차례(있던 것)");
const cards = [{ id: "a" }, { id: "b" }, { id: "c" }];
ok("저장한 차례가 앞 · 모르는 카드는 기본 차례로 뒤에", orderCards(cards, { order: ["c"] }).map((x) => x.id).join("") === "cab");
ok("저장한 것이 없으면 기본 차례 그대로", orderCards(cards, null).map((x) => x.id).join("") === "abc");
ok("▲▼ — 끝에서 더 못 간다", moveId(["a", "b"], "a", "up").join("") === "ab" && moveId(["a", "b"], "a", "down").join("") === "ba");

console.log("■ 접기(어2)");
ok("양식 읽기 — 빈 것·겹친 것·40개 넘는 것을 거른다", JSON.stringify(parseLayout({ order: ["a", "a", " ", "b"], folded: ["x", "x"] })) === JSON.stringify({ order: ["a", "b"], folded: ["x"] }));
ok("foldedOf — 접힌 카드를 집합으로(없으면 빈 집합)", foldedOf({ folded: ["a"] }).has("a") && foldedOf(null).size === 0);
ok("toggleFold — 켜면 들어가고 끄면 빠진다 · 두 번 켜도 하나", toggleFold(["a"], "b", true).join("") === "ab" && toggleFold(["a", "b"], "a", false).join("") === "b" && toggleFold(["a"], "a", true).join("") === "a");
const p1 = applyPatch({ order: ["x", "y"], folded: [] }, { fold: { id: "x", on: true } });
const p2 = applyPatch(p1, { order: ["y", "x"] });
ok("**부분만 보내도 나머지는 그대로** — ▾ 가 차례를 안 지우고, ⇅ 가 접은 것을 안 편다", JSON.stringify(p1) === JSON.stringify({ order: ["x", "y"], folded: ["x"] }) && JSON.stringify(p2) === JSON.stringify({ order: ["y", "x"], folded: ["x"] }), JSON.stringify(p2));
ok("화면 이름은 셋뿐(me · parent · dash)", Object.keys(SCREENS).join(",") === "me,parent,dash");

console.log("■ 규칙 — 접기는 조회를 안 한다 · 한 벌로 그린다");
const fold = strip(readFileSync("app/_shell/fold.js", "utf8"));
ok("속도-1 접기는 **다시 조회하지 않는다** — fold.js 에 router.refresh·revalidate 가 없다", !/router\.refresh|revalidate/.test(fold), fold.match(/router\.refresh|revalidate/)?.[0] ?? "");
ok("누른 그 자리에서 카드에 data-folded 를 찍는다(화면 먼저 · 저장은 뒤에서 — 속도-3)", /closest\("\[data-card\]"\)/.test(fold) && /setAttribute\("data-folded"/.test(fold));
const screens = [["app/me/page.js", "me"], ["app/parent/page.js", "parent"], ["app/page.js", "dash"]];
for (const [f, screen] of screens) {
  const s = strip(readFileSync(f, "utf8"));
  ok(`${f} — 접기 조각 하나(Fold)를 쓰고 화면 이름이 "${screen}" 이다(두 벌로 안 그린다 · 원칙-1)`, /from "[^"]*_shell\/fold\.js"/.test(s) && new RegExp(`<Fold screen="${screen}"`).test(s), s.match(/<Fold[^/]*/)?.[0] ?? "없음");
  ok(`${f} — 카드마다 접혔나를 붙인다(data-folded) · 접은 목록은 foldedOf 한 곳에서 읽는다`, /data-folded=\{folded \? "1" : "0"\}/.test(s) && /foldedOf\(/.test(s));
}
const css = readFileSync("app/globals.css", "utf8");
ok("확정-⑮ 접혀도 **머리와 알약(개수)** 은 보인다 — CSS 가 머리(.h · .ctitle)만 남긴다", /\[data-card\]\[data-folded="1"\]>\*:not\(\.h\):not\(\.ctitle\)\{display:none\}/.test(css), css.match(/\[data-card\]\[data-folded[^\n]*/)?.[0] ?? "없음");
ok("겉은 **목업에서** 갈라낸 것이다 — 손으로 globals.css 를 고치지 않는다(디자인-3 · check-mockup 이 지킨다)", readFileSync("docs/목업/클로이영어-화면-목업.html", "utf8").includes('[data-card][data-folded="1"]'));

console.log(`\n■ 카드 순서·접기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
