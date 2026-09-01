/**
 * v2 전수 검사 — 표 전부를 리허설 계정으로 훑는다.
 * ⚠️ 「막힘」을 통과로 세지 않는다 — 권한이 없어서 막힌 것과 규칙이 막은 것을 가른다.
 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const P={학생:"00000000-0000-4000-8000-000000000003", 학부모:"00000000-0000-4000-8000-000000000004"};

/** 표마다 「아이·부모에게 보여도 되는가」 — 안 적으면 멀쩡한 것을 사고로 읽는다 */
const 보여도됨 = new Set(["learn_items","area_routine","material_type","books","units","book_alias",
  "grammar_topics","unit_topic","video","progress_edit","exams","schools","stop_rule"]);
/** 원장만 봐야 하는 자리 — 여기서 한 줄이라도 나오면 **사고** */
const 원장만 = new Set(["consult","payment","fee_rule","todo","inquiry","notify_log","job_queue",
  "auto_rule","auto_key","day_ran","prep_scope","material_item","holiday","makeup",
  "msg_template","file_bin","audit","purge_map"]);

const tabs=(await c.query(`select tablename from pg_tables where schemaname='v2' order by 1`)).rows.map(r=>r.tablename);
async function seen(pid, t) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:pid,role:"authenticated"})]);
  await c.query("set local role authenticated");
  let n=0, err=null;
  try { n=(await c.query(`select count(*)::int n from v2."${t}"`)).rows[0].n; } catch(e){ err=e.message.split("\n")[0]; }
  finally { await c.query("rollback"); }
  return {n, err};
}
const leak=[], fine=[], note=[];
for (const t of tabs) {
  const total=(await c.query(`select count(*)::int n from v2."${t}"`)).rows[0].n;
  for (const [who,pid] of Object.entries(P)) {
    const r=await seen(pid,t);
    if (r.err && /permission denied/.test(r.err)) { note.push(`${t}/${who} 권한으로 막음`); continue; }
    if (r.n===0) { fine.push(`${t}/${who}`); continue; }
    if (원장만.has(t)) leak.push(`❌ ${t} — ${who}에게 ${r.n}/${total}줄 **원장만 봐야 하는 자리**`);
    else if (보여도됨.has(t)) fine.push(`${t}/${who} (보여도 됨 ${r.n})`);
    else note.push(`${t}/${who} ${r.n}/${total} — 자기 것만인지 눈으로`);
  }
}
console.log(`■ v2 표 ${tabs.length}개\n`);
console.log(`■ ❌ 새는 자리 ${leak.length}건`); leak.forEach(x=>console.log("  ",x)); if(!leak.length) console.log("   없음");
console.log(`\n■ 🔎 자기 것만인지 눈으로 볼 것 ${note.filter(x=>x.includes("/")).length}건`);
note.filter(x=>!x.includes("권한으로")).forEach(x=>console.log("  ",x));
console.log(`\n■ ✅ 0줄이거나 보여도 되는 자리 ${fine.length}건`);
await c.end(); process.exit(leak.length?1:0);
