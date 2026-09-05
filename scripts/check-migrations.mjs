/** 마이그레이션 검사 — **파일은 있는데 안 돌린 것**과 **고치고 다시 안 돌린 것**을 잡는다.
 *  계획이 짚은 함정: 등록하는 자리가 둘이라 하나를 빠뜨리면 「안 돌린 SQL 을 화면이 모른다」. */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { sha } from "./_ap.mjs";

const url = (process.env.DATABASE_URL ?? readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

const all = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
// ⚠️ 9xxx 는 **전환일에 손으로 한 번** 돌리는 파일이다 (v2 밖을 만진다).
//    평소에 돌리면 구앱이 그날 저녁부터 반쯤 죽고, 그 사고는 도메인 원복으로 못 되돌린다.
//    그래서 「안 돌렸다」가 **정상**이다 — 돌린 것으로 세면 안 된다.
const SWITCH = all.filter(f => /^9\d{3}_/.test(f));
const files = all.filter(f => !/^9\d{3}_/.test(f));
const rows = (await c.query("select file, sha from v2.migration")).rows;
const applied = new Map(rows.map(r => [r.file, r.sha]));
await c.end();

const never = files.filter(f => !applied.has(f));
const stale = files.filter(f => applied.has(f) && applied.get(f) !== sha(f));
const ghost = [...applied.keys()].filter(n => !all.includes(n));
const ranSwitch = SWITCH.filter(f => applied.has(f));

let fail = 0;
const ok = (t, c, list = []) => { if (!c) { fail++; console.log(`   ❌ ${t}`); list.forEach(x => console.log(`        ${x}`)); }
                                  else console.log(`   ✅ ${t}`); };
console.log(`■ 마이그레이션 ${files.length}개 · 돌린 것 ${[...applied.keys()].filter(n => !/^9\d{3}_/.test(n)).length}개`);
ok("파일은 있는데 **안 돌린 것**이 없다 — 있으면 화면이 없는 표를 부른다", never.length === 0, never);
ok("고치고 **다시 안 돌린 것**이 없다 — 있으면 DB 가 파일보다 낡았다", stale.length === 0, stale);
ok("DB 에만 있고 파일이 없는 것이 없다 — 있으면 되돌릴 수가 없다", ghost.length === 0, ghost);
// ⚠️ 전환일 파일을 **실수로 돌렸으면** 그것이 사고다 — 반대로 잡는다
ok("전환일 파일(9xxx)을 아직 안 돌렸다 — 돌렸으면 구앱을 만진 것이다",
   ranSwitch.length === 0, ranSwitch);
if (SWITCH.length) {
  console.log(`\n   ⏸️  전환일에 손으로 한 번 돌리는 파일 ${SWITCH.length}개 (지금 돌리면 안 된다)`);
  SWITCH.forEach(f => console.log(`        psql "$DATABASE_URL" -f supabase/migrations/${f}`));
}
console.log(`\n■ 마이그레이션 검사 3건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
