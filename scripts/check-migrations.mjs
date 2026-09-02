/** 마이그레이션 검사 — **파일은 있는데 안 돌린 것**과 **고치고 다시 안 돌린 것**을 잡는다.
 *  계획이 짚은 함정: 등록하는 자리가 둘이라 하나를 빠뜨리면 「안 돌린 SQL 을 화면이 모른다」. */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { sha } from "./_ap.mjs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

const files = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
const rows = (await c.query("select file, sha from v2.migration")).rows;
const applied = new Map(rows.map(r => [r.file, r.sha]));
await c.end();

const never = files.filter(f => !applied.has(f));
const stale = files.filter(f => applied.has(f) && applied.get(f) !== sha(f));
const ghost = [...applied.keys()].filter(n => !files.includes(n));

let fail = 0;
const ok = (t, c, list = []) => { if (!c) { fail++; console.log(`   ❌ ${t}`); list.forEach(x => console.log(`        ${x}`)); }
                                  else console.log(`   ✅ ${t}`); };
console.log(`■ 마이그레이션 ${files.length}개 · 돌린 것 ${applied.size}개`);
ok("파일은 있는데 **안 돌린 것**이 없다 — 있으면 화면이 없는 표를 부른다", never.length === 0, never);
ok("고치고 **다시 안 돌린 것**이 없다 — 있으면 DB 가 파일보다 낡았다", stale.length === 0, stale);
ok("DB 에만 있고 파일이 없는 것이 없다 — 있으면 되돌릴 수가 없다", ghost.length === 0, ghost);
console.log(`\n■ 마이그레이션 검사 3건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
