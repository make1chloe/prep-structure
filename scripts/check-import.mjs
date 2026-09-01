/** 이관 대조 — **업무 사실**로 맞춘다. 어긋나면 전환하지 않는다 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:60000, query_timeout:180000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const r=(await c.query("select * from v2.import_verify()")).rows;
const bad=r.filter(x=>!x.ok), byTopic={};
r.forEach(x=>{byTopic[x.topic]=byTopic[x.topic]||{ok:0,bad:0}; x.ok?byTopic[x.topic].ok++:byTopic[x.topic].bad++;});
console.log("■ 이관 대조 — 업무 사실로");
Object.entries(byTopic).sort().forEach(([t,v])=>console.log(`   ${v.bad?"❌":"✅"} ${t.padEnd(14)} 맞음 ${v.ok} · 어긋남 ${v.bad}`));
if (bad.length) { console.log(`\n■ 어긋난 것 ${bad.length}건 (앞 10)`);
  bad.slice(0,10).forEach(x=>console.log(`   ${x.topic} ${x.who||""} — 옛 ${x.old_val} vs 새 ${x.new_val}  ${x.note||""}`)); }
const hold=(await c.query(`select count(*)::int n from v2.import_map where skip_why like '⚠️%'`)).rows[0].n;
console.log(`\n■ ⚠️ 보류 ${hold}건 — 계획: 「보류 0 이 아니면 전환하지 않는다」`);
(await c.query(`select skip_why, count(*)::int n from v2.import_map where skip_why like '⚠️%' group by 1 order by 2 desc`))
  .rows.forEach(x=>console.log(`   ${String(x.n).padStart(4)}  ${x.skip_why.slice(0,64)}`));
await c.end();
process.exit(bad.length ? 1 : 0);
