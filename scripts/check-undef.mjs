// 선언 안 한 이름 검사((어21) — 원장님 「이거 왜 이래?」 뒤엔 검사 하나) — BookBlock 이 받지도 않은 onPrep 을 눌러서 ReferenceError 가 났다.
// 빌드는 이런 것을 못 잡는다(누를 때 터진다). ESLint no-undef 하나만 app/·lib/ 전체에 돌린다 — 설정 파일 없이, 여기서 한 벌.
import { ESLint } from "eslint";
import { readFileSync } from "node:fs";
let n = 0, bad = 0;
const ok = (name, cond, extra = "") => { n++; if (cond) console.log(`   ✅ ${name}`); else { bad++; console.log(`   ❌ ${name}${extra ? ` — ${extra}` : ""}`); } };
const eslint = new ESLint({ useEslintrc: false, overrideConfig: {
  parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  env: { browser: true, node: true, es2022: true },
  globals: { React: "readonly" },
  rules: { "no-undef": "error" },
} });
const results = await eslint.lintFiles(["app/**/*.js", "lib/**/*.js", "scripts/e2e/*.mjs"]);
const hits = results.flatMap((r) => r.messages.filter((m) => m.ruleId === "no-undef" || m.fatal).map((m) => `${r.filePath.replace(process.cwd() + "/", "")}:${m.line} ${m.message}`));
const files = results.length;
ok(`app/ · lib/ · e2e 걷기 ${files}개 파일 — 선언 안 한 이름 0(no-undef · 파싱 실패 0)`, hits.length === 0, hits.slice(0, 8).join(" | "));
console.log(`\n■ 선언 안 한 이름 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
