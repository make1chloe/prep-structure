/** 화면의 **읽을 것** 검사(글자) — 원장님 2026-09-12 「페이지에서 가독성이 떨어져 … 필요없는 설명좀빼」.
 *  한 달 돌려 재 보니 설명문이 **5144자 · 181개 · 폰으로 46화면**이었고, 그중 발송 한 화면이 1503자였다.
 *  까닭 셋을 규칙으로 굳힌다:
 *  ① **줄마다 되풀이되는 문장을 만들지 않는다** — 같은 말은 카드 머리에서 한 번(logStatus 가 그랬다: 같은 문장 26줄 · 768자)
 *  ② **긴 설명은 늘 보이게 두지 않는다** — 90자가 넘으면 `<Tip>`(ⓘ 접기) 안에. 툴팁(title)이 아니라 접기다 — 원장님은 폰으로 쓰신다
 *  ③ **개발 지시문은 화면에 없다** — Vercel·환경변수·Redeploy 같은 말은 문서로
 *  쓰기: node scripts/check-words.mjs */
import { readFileSync, readdirSync } from "node:fs";
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? "\n        " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");   // 폰-5: 주석을 먼저 지운다
const files = [...readdirSync("app", { recursive: true })].filter((f) => String(f).endsWith(".js")).map((f) => [`app/${f}`, strip(readFileSync(`app/${f}`, "utf8"))]);

console.log("■ 늘 보이는 설명문은 짧게 — 긴 것은 <Tip>(ⓘ 접기) 안으로");
{ const 긴것 = [];
  for (const [f, s] of files) {
    // <p|span className="note…">…</p|span> 안의 **글자만** 센다(태그·중괄호는 뺀다)
    for (const m of s.matchAll(/<(p|span) className="note[^"]*"[^>]*>([\s\S]*?)<\/\1>/g)) {
      // 중괄호는 **안쪽부터 되풀이해** 지운다 — `${…}` 가 든 템플릿 때문에 한 번만 지우면 데이터 줄이 설명문으로 잡힌다
      let 안 = m[2].replace(/<Tip[^>]*>[\s\S]*?<\/Tip>/g, "").replace(/<[^>]*>/g, "");   // 접혀 있는 글은 안 센다 — 그게 접은 까닭이다
      for (let i = 0; i < 8; i++) { const 뒤 = 안.replace(/\{[^{}]*\}/g, ""); if (뒤 === 안) break; 안 = 뒤; }
      안 = 안.replace(/\s+/g, " ").trim();
      if (안.length > 90) 긴것.push(`${f}: ${안.length}자 — ${안.slice(0, 70)}…`);
    }
  }
  ok("늘 보이는 설명문이 90자를 넘지 않는다(넘으면 <Tip> 안으로 — 폰에서도 눌러서 편다)", !긴것.length, 긴것.join("\n        ")); }

console.log("■ 같은 문장을 줄마다 되풀이하지 않는다");
{ // 판단 lib 이 **줄마다** 같은 붙박이 문장을 만들면 화면에 그 수만큼 쌓인다(2026-09-12: 리허설 16줄 · 못 보냄 10줄 = 768자)
  const plan = strip(readFileSync("lib/send-plan.js", "utf8"));
  ok("자취 한 줄은 **그 줄만의 것**을 적는다 — 「리허설(…) — 실제로는 안 나감」·「못 보냄 — 까닭」을 줄마다 붙이지 않는다",
    !/text: `리허설\(\$\{l\.sink\}\) — 실제로는 안 나감/.test(plan) && !/text: `못 보냄 — \$\{l\.fail_why/.test(plan),
    "lib/send-plan.js logStatus — 까닭은 failGroups 로 카드 머리에서 한 번");
  ok("못 보낸 까닭을 묶어 세는 한 곳이 있다(failGroups)", /export function failGroups/.test(plan)); }

console.log("■ 개발 지시문은 화면에 없다");
{ const 샌곳 = [];
  const 개발말 = /Environment Variables|Redeploy|환경변수|NODE_ENV|npm |process\.env/;
  for (const [f, s0] of files) {
    const s = s0.replace(/<Tip[^>]*>[\s\S]*?<\/Tip>/g, " ");   // 접혀 있는 글은 뺀다 — 늘 보이는 글만 본다
    for (const m of s.matchAll(/>([^<>{}]{10,300})</g)) if (개발말.test(m[1])) 샌곳.push(`${f}: ${m[1].trim().slice(0, 70)}`);
  }
  ok("Vercel·환경변수·Redeploy 같은 말이 **보이는 글**에 없다(툴팁·주석·문서에는 얼마든지)", !샌곳.length, 샌곳.join("\n        ")); }

console.log("■ 접기 부품은 한 벌");
{ const tip = strip(readFileSync("app/_shell/tip.js", "utf8"));
  ok("ⓘ 접기는 app/_shell/tip.js 하나(원칙-1) · 기본은 접힘 · aria-expanded 가 있다",
    /export default function Tip/.test(tip) && /useState\(false\)/.test(tip) && /aria-expanded=\{on\}/.test(tip));
  const 제손 = files.filter(([f, s]) => f !== "app/_shell/tip.js" && /aria-expanded=\{[a-z]+\}[\s\S]{0,80}ⓘ/.test(s)).map(([f]) => f);
  ok("화면이 제 손으로 ⓘ 접기를 또 만들지 않는다", !제손.length, 제손.join(" · ")); }

console.log("■ 쓴 부품은 가져온다 — 안 가져오면 그 화면이 통째로 죽는다(2026-09-12: <Tip> 을 쓰고 import 를 빼 발송 화면이 백지가 됐다. 빌드도 이 검사도 못 잡았다)");
{ const 빠짐 = [];
  const 부품 = ["Tip", "Sure", "Fold", "AsBand", "Oops", "Sibs", "CardOrder", "NoticeCard", "BellCard", "AskCard"];
  for (const [f, s] of files) for (const c of 부품)
    if (new RegExp(`<${c}[\\s/>]`).test(s) && !new RegExp(`import\\s+${c}\\b|\\b${c}\\s*[,}]|function ${c}\\b|const ${c}\\s*=`).test(s)) 빠짐.push(`${f}: <${c}> 를 쓰는데 가져오지 않았다`);
  ok(`화면이 쓰는 부품 ${부품.length}가지를 다 가져온다`, !빠짐.length, 빠짐.join("\n        ")); }

console.log(`\n■ 읽을 것 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
