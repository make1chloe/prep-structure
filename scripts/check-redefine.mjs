/** 함수를 다시 낼 때 앞 정의를 잃지 않았나(검사-74 · 2026-09-09 (너) — 0148 이 grid_board 를 0126 본으로 다시 내며 0131 이 더한 cells_at(0-3 대조)을 잃었다 · check-rules-db 가 그 하나를 잡았지만 다른 판엔 그런 검사가 없다).
 *  판(*_board · *_mine) 함수가 마이그레이션에 두 번 이상 나오면, 뒤 정의의 json 열쇠('id', 'cells' …)가 앞 정의의 열쇠를 전부 품어야 한다. 일부러 뺀 열쇠는 그 파일에 `-- 뺌: 열쇠` 로 적는다. */
import { readFileSync, readdirSync } from "node:fs";
const dir = "supabase/migrations"; const files = readdirSync(dir).filter((f) => /^0\d{3}_.*\.sql$/.test(f)).sort();
const defs = new Map();   // name → [{ file, keys }]
for (const f of files) {
  const s = readFileSync(dir + "/" + f, "utf8");
  const dropped = new Set([...s.matchAll(/--\s*뺌:\s*([^\n]+)/g)].flatMap((m) => m[1].split(/[,\s·]+/).filter(Boolean)));
  for (const m of s.matchAll(/create or replace function v2\.([a-z_]+(?:_board|_mine))\(([^)]*)\)[\s\S]*?\$\$([\s\S]*?)\$\$;/g)) {
    const keys = new Set([...m[3].matchAll(/'([a-z_]+)',/g)].map((x) => x[1]));
    const name = `${m[1]}(${m[2].replace(/\s+/g, " ").trim()})`;
    if (!defs.has(name)) defs.set(name, []); defs.get(name).push({ file: f, keys, dropped });
  }
}
let n = 0, bad = 0; const lost = [];
for (const [name, list] of defs) { for (let i = 1; i < list.length; i++) { const prev = list[i - 1], cur = list[i]; const missing = [...prev.keys].filter((k) => !cur.keys.has(k) && !cur.dropped.has(k)); if (missing.length) lost.push(`${cur.file} ${name} — ${prev.file} 의 열쇠를 잃음: ${missing.join(" ")}`); } }
const again = [...defs.values()].filter((l) => l.length > 1).length;
n++; if (lost.length) { bad++; console.log("   ❌ 다시 낸 판 함수가 앞 정의의 json 열쇠를 잃지 않는다(뺀 것은 -- 뺌: 으로) — " + lost.join(" | ")); } else console.log(`   ✅ 다시 낸 판 함수 ${again}개가 앞 정의의 json 열쇠를 전부 품는다(판 ${defs.size} · 뺀 것은 -- 뺌: 으로 적는다)`);
n++; { const self = "create or replace function v2.zz_board(p date) returns jsonb language sql as $$ select jsonb_build_object('a', 1, 'b', 2) $$;"; const later = "create or replace function v2.zz_board(p date) returns jsonb language sql as $$ select jsonb_build_object('a', 1) $$;"; const k = (s) => new Set([...s.matchAll(/'([a-z_]+)',/g)].map((x) => x[1])); const ok = [...k(self)].some((x) => !k(later).has(x)); if (ok) console.log("   ✅ (검사 자신 확인: 일부러 열쇠를 뺀 본보기를 잡는다)"); else { bad++; console.log("   ❌ 검사 자신 확인 실패"); } }
console.log(`\n■ 다시 낸 함수 검사 ${n}건 · 실패 ${bad}`); process.exit(bad ? 1 : 0);
