/** 루틴 검사 — 엑셀 줄 수와 v2 줄 수가 맞는가, 자리가 뭉개지지 않았는가
 *  ⚠️ 실제로 하나가 조용히 사라진 적이 있다 — 블록구문 「문장훈련」이
 *     학원·숙제 두 줄인데 열쇠가 `(area,item)` 이라 둘째가 첫째를 덮었다. */
import { Client } from "pg"; import { readFileSync, existsSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const ok=[],bad=[];
// ① 원장님이 채운 39줄 + 단어 2줄 = 41
const n=(await c.query("select count(*)::int n from v2.area_routine")).rows[0].n;
(n===41?ok:bad).push(`${n===41?"✅":"❌"} 영역 루틴 줄 수 — ${n} (엑셀 39 + 단어 2 = 41)`);
// ② 같은 항목이 자리만 달리 두 번 서는 것이 살아 있는가
const two=(await c.query(`select r.area, i.name, count(*)::int n from v2.area_routine r
  join v2.learn_items i on i.id=r.item_id group by 1,2 having count(*)>1`)).rows;
(two.length?ok:bad).push(`${two.length?"✅":"❌"} 같은 항목이 자리를 달리해 두 번 — ${two.map(x=>`${x.area}/${x.name}×${x.n}`).join(" · ")||"하나도 없다(뭉개졌을 수 있다)"}`);
// ③ 루틴이 없는 영역
const w=(await c.query("select * from v2.areas_without_routine()")).rows;
(w.length?bad:ok).push(`${w.length?"❌":"✅"} 루틴 없는 영역 — ${w.map(r=>`${r.area}(${r.books}권)`).join(" · ")||"없음"}`);
// ④ 영역별 항목 수 — 하루 총량의 근거
const a=(await c.query(`select area, count(*) filter (where place in ('class','both'))::int c,
  count(*) filter (where place in ('home','both'))::int h from v2.area_routine group by 1 order by 1`)).rows;
console.log("■ 루틴");
[...ok,...bad].forEach(x=>console.log("  ",x));
console.log("\n■ 영역마다 하루에 몇 개 (교재 한 권 기준)");
a.forEach(x=>console.log(`   ${x.area.padEnd(12)} 학원 ${String(x.c).padStart(2)} · 숙제 ${String(x.h).padStart(2)}`));
console.log("   ⚠️ **단어는 학원 0 · 숙제 2** — 다른 영역과 크게 다르다");
await c.end(); process.exit(bad.length?1:0);
