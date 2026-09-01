/** 아이디 규칙 검사 — 학생 chloe+4자리 · 학부모 전화번호 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const odd=(await c.query("select * from v2.login_id_odd()")).rows;
const mk=(await c.query(`select v2.make_login_id('student','010-1234-0515') s, v2.make_login_id('parent','010-1234-0515') p`)).rows[0];
console.log("■ 아이디 짓기");
console.log(`   학생   chloe+폰 뒤 4자리 → ${mk.s}   ${mk.s==='chloe0515'?'✅':'❌'}`);
console.log(`   학부모 전화번호        → ${mk.p}  ${mk.p==='01012340515'?'✅':'❌'}`);
console.log(`\n■ 규칙에 안 맞는 아이디 ${odd.length}건`);
odd.forEach(r=>console.log(`   ⚠️ ${r.role} ${String(r.name).slice(0,2)}** — ${r.why}`));
const noPhone=(await c.query(`select count(*)::int n from v2.profiles
  where role='student' and login_id is not null and phone is null`)).rows[0].n;
if (noPhone) console.log(`\n■ ⚠️ 전화번호가 없는 학생 ${noPhone}명 — 아이디를 **다시 지을 수 없다**`);
const bad = odd.length + (mk.s!=='chloe0515'?1:0) + (mk.p!=='01012340515'?1:0);
// ⚠️ 옛 데이터의 어긋난 줄은 **원장님이 고치실 자리**다 — 검사는 세워 두기만 한다.
// 새로 만든 아이디가 규칙을 어기면 그건 **실패**다.
process.exit((mk.s!=='chloe0515'||mk.p!=='01012340515') ? 1 : 0);
