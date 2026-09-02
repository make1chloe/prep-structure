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
/* ══ 검사-⑱ — 매핑표에 **짝 없는 이관 줄**이 있으면 실패 ═══════════════════
 * ⚠️⚠️ **줄 수 대조로는 이것을 원리적으로 못 잡는다.** 0049 의 대조는 옛·새 **양쪽을
 *    같은 조건으로 좁혀** 늘 같은 수가 나온다(4,131 = 4,131). 매핑표가 **없는 줄을 가리켜도**
 *    그 대조는 초록이다 — 실제로 19줄이 그 초록 밑에 있었다.
 * ⚠️ 매핑표는 「이게 새 앱 어디로 갔지」를 되짚는 장부다. 빈 곳을 가리키면
 *    되짚을 때 아무것도 안 나오고, 재적재가 「이미 옮겼다」로 읽어 **영영 안 옮긴다.**
 * ⚠️ 그래서 **가리키는 새 줄이 진짜 있는지**를 표마다 본다. 새 표가 늘면 여기 한 줄을 더한다 —
 *    안 더하면 그 표는 조용히 안 보게 되므로, 아래에서 **덮은 표 수**도 같이 센다.        */
const 겨눔 = ["day_item", "score", "books", "units", "learn_items", "profiles", "students"];
const 짝없는SQL = `
select m.new_table, count(*)::int n from v2.import_map m
 where m.new_table is not null
   and case m.new_table
     when 'day_item'    then not exists (select 1 from v2.day_item    x where x.id = m.new_id)
     when 'score'       then not exists (select 1 from v2.score       x where x.id = m.new_id)
     when 'books'       then not exists (select 1 from v2.books       x where x.id = m.new_id)
     when 'units'       then not exists (select 1 from v2.units       x where x.id = m.new_id)
     when 'learn_items' then not exists (select 1 from v2.learn_items x where x.id = m.new_id)
     when 'profiles'    then not exists (select 1 from v2.profiles    x where x.id = m.new_id)
     when 'students'    then not exists (select 1 from v2.students    x where x.id = m.new_id)
     else false end
 group by 1 order by 2 desc`;
const 짝없는 = (await c.query(짝없는SQL)).rows;
const 덮은표 = (await c.query(
  `select distinct new_table t from v2.import_map where new_table is not null order by 1`)).rows.map((x) => x.t);
const 안본표 = 덮은표.filter((t) => !겨눔.includes(t));

console.log("\n■ 검사-⑱ — 매핑표가 **진짜 있는 줄**을 가리키나");
let 틀림 = 0;
if (짝없는.length) {
  틀림++;
  console.log(`   ❌ 짝 없는 줄 ${짝없는.reduce((t, x) => t + x.n, 0)}개`);
  짝없는.forEach((x) => console.log(`        ${x.new_table} ${x.n}줄 — 가리키는 새 줄이 없다`));
  console.log("        → 안 옮긴 줄이면 new_table 을 비우고 **사유(skip_why)를 적는다**(0081 이 그 본보기다)");
} else {
  console.log(`   ✅ 짝 없는 줄이 없다 (표 ${겨눔.length}개를 본다)`);
}
if (안본표.length) {
  틀림++;
  console.log(`   ❌ 이 검사가 **안 보는 표**가 있다: ${안본표.join(" ")} — 위 목록에 더해야 한다`);
} else {
  console.log(`   ✅ 매핑표가 가리키는 표를 **하나도 빠짐없이** 본다 (${덮은표.join(" ")})`);
}
// 안 옮긴 줄은 **사유가 있어야** 한다 — 비워만 두면 왜 안 옮겼는지 영영 모른다
const 사유없음 = (await c.query(
  `select count(*)::int n from v2.import_map where new_table is null and skip_why is null`)).rows[0].n;
if (사유없음) { 틀림++; console.log(`   ❌ 안 옮겼는데 **사유가 없는 줄** ${사유없음}개`); }
else console.log("   ✅ 안 옮긴 줄에는 사유가 다 적혀 있다");

await c.end();
// ⚠️ 검사-⑱ 은 **검사 실패**다(전환 게이트가 아니다) — 장부가 거짓이면 되짚을 수가 없다
process.exit((bad.length || 틀림) ? 1 : 0);  // 안 정한 보류는 전환 게이트이지 검사 실패가 아니다
