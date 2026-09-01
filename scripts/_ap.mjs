import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const b=(await c.query("select (select count(*) from pg_tables where schemaname=$1) t,(select count(*) from pg_policies where schemaname=$1) p",["public"])).rows[0];
for (const f of process.argv.slice(2)) {
  try { await c.query(readFileSync("supabase/migrations/"+f,"utf8")); console.log("  ✅", f); }
  catch(e){ console.log("  ❌", f, "—", e.message.split("\n")[0]); process.exitCode=1; }
}
const a=(await c.query("select (select count(*) from pg_tables where schemaname=$1) t,(select count(*) from pg_policies where schemaname=$1) p",["public"])).rows[0];
const v=(await c.query("select (select count(*) from pg_tables where schemaname=$1) t,(select count(*) from pg_policies where schemaname=$1) p",["v2"])).rows[0];
console.log(`■ v2 표 ${v.t} · 규칙 ${v.p}  ·  public ${b.t}→${a.t}/${b.p}→${a.p}`, (b.t===a.t&&b.p===a.p)?"✅":"❌");
await c.end();
