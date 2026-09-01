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
// 보류를 「원장님이 정한 것」과 「아직 안 정한 것」으로 가른다 — 전환을 막는 것은 뒤엣것뿐
const H=(await c.query(`select m.skip_why, count(*)::int n,
    (select d.decided from v2.hold_decision d where m.skip_why like d.why_like) decided
  from v2.import_map m where m.skip_why like '⚠️%' group by 1 order by 2 desc`)).rows;
const open_=H.filter(x=>!x.decided), done=H.filter(x=>x.decided);
const sum=a=>a.reduce((t,x)=>t+x.n,0);
if (done.length) { console.log(`\n■ ✅ 정한 보류 ${sum(done)}건 — 원장님이 결정하심`);
  done.forEach(x=>console.log(`   ${String(x.n).padStart(4)}  ${x.skip_why.slice(0,50)}\n         → ${x.decided}`)); }
console.log(`\n■ ${open_.length?"⚠️":"✅"} 아직 안 정한 보류 ${sum(open_)}건 — 계획: 「보류 0 이 아니면 전환하지 않는다」`);
open_.forEach(x=>console.log(`   ${String(x.n).padStart(4)}  ${x.skip_why.slice(0,64)}`));
await c.end();
process.exit(bad.length ? 1 : 0);  // 안 정한 보류는 전환 게이트이지 검사 실패가 아니다
