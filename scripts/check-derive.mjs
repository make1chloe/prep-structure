/** 세어 나오는 값 검사 — 커서·회차·분량이 실제로 맞는가 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const ok=[],bad=[];
const S="00000000-0000-4000-9000-000000000001", B="00000000-0000-4000-b000-000000000001",
      C="00000000-0000-4000-a000-000000000001";
const t=(n,got,want)=>((JSON.stringify(got)===JSON.stringify(want)?ok:bad)
  .push(`${JSON.stringify(got)===JSON.stringify(want)?"✅":"❌"} ${n} — ${JSON.stringify(got)} (바라는 값 ${JSON.stringify(want)})`));

await c.query("begin");
// 앞서 넣어 둔 fixture 단원은 이 검사에서 비켜 둔다
await c.query(`update v2.units set state='hidden' where book_id=$1 and chapter='CHAPTER 1'`,["00000000-0000-4000-b000-000000000001"]);
// 시험용 판 — 롤백한다
await c.query(`insert into v2.student_book(student_id,book_id,from_date,round,per_session,order_basis)
  values($1,$2,'2026-03-01',1,2,'chapter') on conflict do nothing`,[S,B]);
await c.query(`insert into v2.units(book_id,chapter,sub,activity,is_workbook,sort,page_start,page_end,q_count)
  values ($1,'CH1','01','본책',false,10,1,4,16),($1,'CH1','02','본책',false,11,5,8,14),
         ($1,'CH1','01','워크북',true,12,9,10,8),($1,'CH2','01','본책',false,20,11,14,20)
  on conflict do nothing`,[B]);

// ① 커서 — 대단원 기준이면 본책 전부 → 워크북 전부
let r=(await c.query(`select * from v2.cursor_of($1,$2)`,[S,B])).rows[0];
t("커서 — 처음엔 CH1 본책", [r.chapter, r.is_workbook], ["CH1", false]);

// CH1 본책 두 줄을 끝냈다
await c.query(`insert into v2.progress(student_id,unit_id,round,status)
  select $1,id,1,'done' from v2.units where book_id=$2 and chapter='CH1' and not is_workbook`,[S,B]);
r=(await c.query(`select * from v2.cursor_of($1,$2)`,[S,B])).rows[0];
t("커서 — 본책 끝나면 **같은 대단원 워크북**", [r.chapter, r.is_workbook], ["CH1", true]);

// 워크북도 끝냈다
await c.query(`update v2.progress set status='done' where student_id=$1`,[S]);
await c.query(`insert into v2.progress(student_id,unit_id,round,status)
  select $1,id,1,'done' from v2.units where book_id=$2 and chapter='CH1' and is_workbook`,[S,B]);
r=(await c.query(`select * from v2.cursor_of($1,$2)`,[S,B])).rows[0];
t("커서 — 대단원이 끝나면 다음 대단원", [r.chapter, r.is_workbook], ["CH2", false]);

// ② 회차 — 월수반 10월. 휴강 하루 넣어 본다
let n=(await c.query(`select v2.session_count($1,'2026-10') n`,[C])).rows[0].n;
t("회차 — 2026-10 월·수 (월 5·12·19·26 · 수 7·14·21·28)", n, 8);
await c.query(`insert into v2.holiday(date,class_id) values('2026-10-07',$1)`,[C]);
n=(await c.query(`select v2.session_count($1,'2026-10') n`,[C])).rows[0].n;
t("회차 — 휴강 하루 빼면", n, 7);

// ③ 진도율
const p=(await c.query(`select * from v2.book_progress($1,$2)`,[S,B])).rows[0];
t("진도율 — 3/4", [p.done,p.total], [3,4]);

// ④ 「며칠째 열려 있나」
await c.query(`update v2.progress_edit set is_open=true, opened_on=v2.today()-12 where scope='academy'`);
const d=(await c.query(`select v2.progress_open_days() n`)).rows[0].n;
t("진도 체크 — 켠 날이 1일째라 13일째", d, 13);
await c.query("rollback");

console.log("■ 세어 나오는 값");
ok.forEach(x=>console.log("  ",x));
if (bad.length) { console.log("\n■ 틀린 것"); bad.forEach(x=>console.log("  ",x)); }
console.log(`\n합계 — 맞음 ${ok.length} · 틀림 ${bad.length}`);
await c.end(); process.exit(bad.length?1:0);
