/** 단어시험 멈춤 검사 — 교재멈춤이면 시험도 멈추는가 (원장님 9/2) */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const ok=[],bad=[];
const t=(n,got,want)=>((got===want?ok:bad).push(`${got===want?"✅":"❌"} ${n} — ${got} (바라는 값 ${want})`));
const S="00000000-0000-4000-9000-000000000001", B="00000000-0000-4000-b000-000000000001";
await c.query("begin");
await c.query(`update v2.books set area='단어' where id=$1`,[B]);
await c.query(`insert into v2.student_book(student_id,book_id,from_date,stop_mode)
  values($1,$2,'2026-01-01','running') on conflict (student_id,book_id,from_date)
  do update set stop_mode='running'`,[S,B]);
t("돌아감 — 시험 보나", (await c.query(`select v2.word_test_on($1,$2) v`,[S,B])).rows[0].v, true);
t("돌아감 — 오늘 시험 목록", (await c.query(`select count(*)::int n from v2.word_tests_today($1)`,[S])).rows[0].n, 1);

await c.query(`update v2.student_book set stop_mode='hw_off' where student_id=$1 and book_id=$2`,[S,B]);
t("숙제멈춤 — 시험은 계속 보나", (await c.query(`select v2.word_test_on($1,$2) v`,[S,B])).rows[0].v, true);

await c.query(`update v2.student_book set stop_mode='book_off' where student_id=$1 and book_id=$2`,[S,B]);
t("⭐ 교재멈춤 — 시험도 멈추나", (await c.query(`select v2.word_test_on($1,$2) v`,[S,B])).rows[0].v, false);
t("교재멈춤 — 오늘 시험 목록에서 빠지나", (await c.query(`select count(*)::int n from v2.word_tests_today($1)`,[S])).rows[0].n, 0);

// 멈춘 교재로 시험을 억지로 넣으면 막히는가
await c.query(`insert into v2.day_sheet(id,student_id,date) values
  ('00000000-0000-4000-d000-000000000001',$1,v2.today()) on conflict do nothing`,[S]);
let blocked=false;
await c.query("savepoint sp1");
try { await c.query(`insert into v2.quiz(student_id,kind,source,book_id,assigned_sheet_id,total)
  values($1,'word','book',$2,'00000000-0000-4000-d000-000000000001',20)`,[S,B]); }
catch(e){ blocked = /멈춘 교재/.test(e.message); await c.query("rollback to savepoint sp1"); }
t("멈춘 교재로 시험을 억지로 넣으면 막히나", blocked, true);

// ⭐ 내신 범위로 낸 시험은 **교재멈춤과 상관없다**
let prepOk=false;
await c.query("savepoint sp2");
try {
  const ex=(await c.query(`insert into v2.exams(scope,name,source) values('national','zz시험','manual') returning id`)).rows[0].id;
  const sc=(await c.query(`insert into v2.prep_scope(exam_id,free_note) values($1,'2과 본문') returning id`,[ex])).rows[0].id;
  await c.query(`insert into v2.quiz(student_id,kind,source,scope_id,total,way)
    values($1,'sentence','prep',$2,10,'구두')`,[S,sc]);
  prepOk=true;
} catch(e){ prepOk=false; console.log("      (왜:", e.message.split("\n")[0].slice(0,60)+")"); await c.query("rollback to savepoint sp2"); }
t("⭐ 내신 범위로 **문장시험**을 낼 수 있나", prepOk, true);
await c.query("rollback");
console.log("■ 단어시험 멈춤");
[...ok,...bad].forEach(x=>console.log("  ",x));
console.log(`\n합계 — 맞음 ${ok.length} · 틀림 ${bad.length}`);
await c.end(); process.exit(bad.length?1:0);
