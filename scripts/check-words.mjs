/** 말 사전 검사 · 검사-93((어39) · 대전제-23 · 원장님 2026-09-15 「하나부터 열까지 단어가 왜 다 이따위로 쓰고있는데 … 메뉴명 설명 좀 어휘선택 업계표준으로좀써」).
 *  docs/말-사전.md 의 「지금」 말이 화면 글(String · Template · JSXText 토큰 · 주석 뺌 · app(api 뺌) + lib/*-plan.js + lib/menu.js)에 남아 있나 센다.
 *  래칫: 총 ≤ MAX · 말마다 ≤ 기준(내려만 간다 · (어40) 전수 치환 뒤 0). 새 말은 사전에 먼저 적는다. */
import { readFileSync, readdirSync, statSync } from "node:fs"; import { join } from "node:path";
const espree = (await import("espree")).default ?? (await import("espree"));
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " · " + why : ""}`); } };
const walk = (d, out = []) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith(".js")) out.push(p); } return out; };
const files = [...walk("app").filter((p) => !p.includes("/api/")), ...readdirSync("lib").filter((f) => /-plan\.js$|^menu\.js$/.test(f)).map((f) => "lib/" + f)];
const toks = (f) => { try { return espree.parse(readFileSync(f, "utf8"), { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, tokens: true }).tokens.filter((t) => ["String", "Template", "JSXText"].includes(t.type)).map((t) => t.value.replace(/\s+/g, " ").trim()).filter(Boolean); } catch (e) { bad++; console.log(`   ❌ 파싱 실패 ${f}: ${e.message}`); return []; } };
console.log("■ 말 사전(docs/말-사전.md) · 화면 글에 우리끼리 말이 남아 있나(대전제-23)");
const md = readFileSync("docs/말-사전.md", "utf8");
const rows = md.split("\n").filter((l) => /^\| /.test(l) && !/^\| 지금 \|/.test(l) && !/^\|---/.test(l)).map((l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()));
const dict = rows.map(([now, later, find]) => ({ now, later, re: find ? new RegExp(find.replace(/^`|`$/g, "").replace(/\\\|/g, "|")) : null }));
ok(`사전 줄 ≥ 25 · 「나중」 비지 않음 (지금 ${dict.length}줄)`, dict.length >= 25 && dict.every((d) => d.now && d.later), dict.filter((d) => !d.now || !d.later).map((d) => d.now).join(", "));
const MAX = 270;   // (어39) 2026-09-15 실측 270 · (어40) 전수 치환 뒤 0
const count = new Map(); const where = new Map();
for (const f of files) for (const t of toks(f)) for (const d of dict) if (d.re && d.re.test(t)) { count.set(d.now, (count.get(d.now) ?? 0) + 1); if (!where.has(d.now)) where.set(d.now, new Set()); where.get(d.now).add(f); }
const total = [...count.values()].reduce((a, b) => a + b, 0);
const line = [...count].sort((a, b) => b[1] - a[1]).map(([w, c]) => `${w}=${c}`).join(" · ");
console.log(`   실측 ${total} · ${line}`);
ok(`화면 글에 남은 사전 말 ≤ ${MAX}(지금 ${total} · 내려만 간다 · (어40) 뒤 0)`, total <= MAX, line);
console.log(`\n■ 말 사전 검사 ${n}건 · 실패 ${bad}`); process.exit(bad ? 1 : 0);
