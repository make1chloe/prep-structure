/** SQL 함수가 **없어진 칸**을 읽고 있나(검사-㊸) — 0083 이 late_stay.left_at 을 걷어냈는데 0071 의 late_for_family() 가 그 칸을 그대로 읽고 있었다(부르면 「column l.left_at does not exist」).
 *  `language sql` 함수는 몸을 만들 때만 보고, 칸이 사라져도 안 알려 준다. check-sql(SETUP_ALL 3번)도 못 잡는다 — 만들 때는 칸이 있었으니까.
 *  그래서 v2 의 읽기만 하는(stable · immutable) SQL 함수를 전부 **null 인자로 한 번씩 불러** 본다 — 한 트랜잭션 안에서, 끝에 되돌린다. 쓰는 함수(volatile · plpgsql)는 안 부른다 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
const fns = (await c.query(`
  select p.proname name, pg_get_function_identity_arguments(p.oid) args,
         array(select format_type(t, null) from unnest(p.proargtypes) t) types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
   where n.nspname = 'v2' and l.lanname = 'sql' and p.prokind = 'f' and p.provolatile in ('s', 'i')
   order by p.proname`)).rows;
const bad = [];
await c.query("begin"); await c.query("set local statement_timeout = '10s'");
for (const f of fns) {
  const call = `select * from v2.${JSON.stringify(f.name)}(${f.types.map((t) => `null::${t}`).join(", ")})`;
  await c.query("savepoint f");
  try { await c.query(call); } catch (e) { bad.push(`${f.name}(${f.args}) — ${String(e.message).split("\n")[0]}`); await c.query("rollback to savepoint f"); }
}
await c.query("rollback"); await c.end();
console.log(`■ v2 의 읽기만 하는 SQL 함수 ${fns.length}개 — null 인자로 불러 본다`);
if (bad.length) { console.log(`check-sql-funcs ✗ 부르면 죽는 함수 ${bad.length}개 — 없어진 칸·표를 읽고 있다\n  ` + bad.join("\n  ")); process.exit(1); }
console.log(`check-sql-funcs ✓ ${fns.length}개 전부 불린다 — 없어진 칸을 읽는 함수 없음`);
