/** 걷기가 **사전이 금한 말**을 기다리고 있나 — (어88) · 원칙 6.
 *
 *  2026-09-18 사고: 「빼기·내림 → 삭제」로 앱 글 56곳을 고쳤는데 **걷기가 옛 글자를 기다리고 있어**
 *  통째 게이트가 두 번 터졌다(각 25분 · 한 번에 하나씩만 드러나 두 바퀴를 버렸다).
 *  글자 파수꾼 77종은 10초에 통과했다 — 그 구멍이 여기다: check-words 는 **app·lib 만** 보고 걷기는 안 본다.
 *
 *  그래서 같은 사전(docs/말-사전.md)으로 **걷기 파일까지** 잰다. 앱 글을 고치면 걷기도 같이 고쳐야 한다.
 *  ⚠️ 걷기의 씨앗 데이터·셈한 글(「zz_리허설 문법책」 · 「12문항」)은 사전 말이 아니라 안 걸린다. */
import { readFileSync, readdirSync, statSync } from "node:fs";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const md = readFileSync("docs/말-사전.md", "utf8");
const dict = md.split("\n").filter((l) => /^\| /.test(l) && !/^\| 지금 \|/.test(l) && !/^\|---/.test(l))
  .map((l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()))
  .map(([now, later, find]) => ({ now, later, re: find ? new RegExp(find.replace(/^`|`$/g, "").replace(/\\\|/g, "|")) : null }))
  .filter((d) => d.re);
const WALKS = readdirSync("scripts/e2e").filter((f) => f.endsWith(".mjs")).map((f) => "scripts/e2e/" + f);

console.log("■ 걷기도 같은 말을 쓴다(앱 글을 고치면 걷기도 — (어88) 사고: 게이트를 두 번 버렸다)");
const hits = [];
for (const f of WALKS) {
  const t = readFileSync(f, "utf8");
  /* 걷기가 **견주는 글**만 본다 — 주석·console.log 의 우리끼리 말은 안 센다 */
  const wants = [...t.matchAll(/(?:includes|startsWith|endsWith)\("([^"]{2,60})"/g),
                 ...t.matchAll(/hasText:\s*"([^"]{2,60})"/g),
                 ...t.matchAll(/===\s*"([^"]{2,60})"/g)].map((m) => m[1]);
  for (const v of new Set(wants)) for (const d of dict) if (d.re.test(v)) hits.push(`${f.replace("scripts/e2e/", "")}: 「${v}」 → ${d.later}`);
}
ok(`걷기 ${WALKS.length}개가 견주는 글에 사전 말 0 (사전 ${dict.length}줄)`, hits.length === 0, hits.slice(0, 10).join(" · "));
console.log(`\n■ 걷기 말 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
