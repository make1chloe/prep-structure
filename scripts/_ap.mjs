import { Client } from "pg"; import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export const sha = (f) => createHash("sha256").update(readFileSync("supabase/migrations/"+f)).digest("hex").slice(0,16);
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const b=(await c.query("select (select count(*) from pg_tables where schemaname=$1) t,(select count(*) from pg_policies where schemaname=$1) p",["public"])).rows[0];
for (const f of process.argv.slice(2)) {
  try {
    await c.query(readFileSync("supabase/migrations/"+f,"utf8"));
    // ⚠️ 돌린 것을 **저절로** 적는다 — 사람이 목록에 등록하는 자리를 없앤다
    await c.query(`insert into v2.migration(file, sha) values ($1,$2)
      on conflict (file) do update set sha=excluded.sha, applied_at=now()`, [f, sha(f)]).catch(()=>{});
    console.log("  ✅", f);
  }
  catch(e){ console.log("  ❌", f, "—", e.message.split("\n")[0]); process.exitCode=1; }
}
const a=(await c.query("select (select count(*) from pg_tables where schemaname=$1) t,(select count(*) from pg_policies where schemaname=$1) p",["public"])).rows[0];
const v=(await c.query("select (select count(*) from pg_tables where schemaname=$1) t,(select count(*) from pg_policies where schemaname=$1) p",["v2"])).rows[0];
console.log(`■ v2 표 ${v.t} · 규칙 ${v.p}  ·  public ${b.t}→${a.t}/${b.p}→${a.p}`, (b.t===a.t&&b.p===a.p)?"✅":"❌");
await c.end();
