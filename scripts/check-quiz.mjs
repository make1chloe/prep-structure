/** 시험 검사 — 틀린 개수·전체 개수, 값 없으면 리포트에 안 나가는가 (원장님 9/2) */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const ok=[],bad=[]; const t=(n,g,w)=>((JSON.stringify(g)===JSON.stringify(w)?ok:bad)
  .push(`${JSON.stringify(g)===JSON.stringify(w)?"✅":"❌"} ${n} — ${JSON.stringify(g)} (바라는 값 ${JSON.stringify(w)})`));
const S="00000000-0000-4000-9000-000000000001";
await c.query("begin");
const sh=(await c.query(`insert into v2.day_sheet(student_id,date) values($1,'2026-10-20') returning id`,[S])).rows[0].id;
const ex=(await c.query(`insert into v2.exams(scope,name,source) values('national','zz','manual') returning id`)).rows[0].id;
const sc=(await c.query(`insert into v2.prep_scope(exam_id,free_note) values($1,'공영2 2과 본문') returning id`,[ex])).rows[0].id;

// ① 다음 시간 — 개수를 **안 적었다** → 리포트에 안 나가야 한다
const q1=(await c.query(`insert into v2.quiz(student_id,kind,source,scope_id,assigned_sheet_id,state)
  values($1,'word','prep',$2,$3,'planned') returning id`,[S,sc,sh])).rows[0].id;
t("다음 시간 — 개수 안 적으면 리포트에 안 나가나",
  (await c.query(`select count(*)::int n from v2.quiz_for_report($1)`,[sh])).rows[0].n, 0);

// ② 개수를 적으면 나간다
await c.query(`update v2.quiz set total=37 where id=$1`,[q1]);
t("다음 시간 — 개수를 적으면 나가나",
  (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='다음 시간'`,[sh])).rows[0].n, 1);

// ③ 오늘 본 것 — 틀린 개수를 **안 적으면** 안 나간다
const q2=(await c.query(`insert into v2.quiz(student_id,kind,source,scope_id,taken_sheet_id,total,state)
  values($1,'sentence','prep',$2,$3,14,'taken') returning id`,[S,sc,sh])).rows[0].id;
t("오늘 본 것 — 틀린 개수 안 적으면 안 나가나",
  (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='오늘 본 것'`,[sh])).rows[0].n, 0);

// ④ 틀린 개수를 적으면 나가고 **맞은 개수·%가 세어 나온다**
await c.query(`update v2.quiz set wrong=2 where id=$1`,[q2]);
const r=(await c.query(`select total, wrong, pct, passed from v2.quiz_for_report($1) where part='오늘 본 것'`,[sh])).rows[0];
t("오늘 본 것 — 14문장에 2개 틀림 → 86%", [r.total, r.wrong, Number(r.pct)], [14,2,86]);
t("통과선 90% 못 넘음", r.passed, false);
t("맞은 개수는 **세어 나온다** (12)", (await c.query(`select v2.quiz_correct($1) n`,[q2])).rows[0].n, 12);
t("`correct` 칸은 없앴다 (두 벌 금지)",
  (await c.query(`select count(*)::int n from information_schema.columns
     where table_schema='v2' and table_name='quiz' and column_name='correct'`)).rows[0].n, 0);

// ⑤ 시험 방식 — 비율로 섞고, 회독이 오르면 어려워진다
const st1=(await c.query(`select v2.style_text(id) t from v2.quiz_style
  where student_id is null and book_id is null and round=1 and kind='word'`)).rows[0].t;
const st2=(await c.query(`select v2.style_text(id) t from v2.quiz_style
  where student_id is null and book_id is null and round=2 and kind='word'`)).rows[0].t;
t("1회독 방식", st1, "객관식 뜻 50% · 주관식 뜻 50%");
t("2회독 방식 — **더 어렵다**", st2, "주관식 뜻 100%");
t("문장 1회독", (await c.query(`select v2.style_text(id) t from v2.quiz_style
  where student_id is null and round=1 and kind='sentence'`)).rows[0].t, "받아쓰기");

// ⑥ 비율 합이 100이 아니면 막힌다
await c.query("savepoint sp3");
let pctBlocked=false;
try { await c.query(`insert into v2.quiz_style(round,kind,mc_meaning,sa_meaning) values(9,'word',80,30)`); }
catch(e){ pctBlocked = /style_pct/.test(e.message); await c.query("rollback to savepoint sp3"); }
t("비율 합이 100이 아니면 막히나", pctBlocked, true);

// ⑦ 학생 것이 학원 기본값을 이긴다
const B2="00000000-0000-4000-b000-000000000001";
await c.query(`insert into v2.quiz_style(student_id,book_id,round,kind,mc_meaning,sa_meaning,sa_word,first_hint)
  values($1,$2,1,'word',0,50,50,true)`,[S,B2]);
const mine=(await c.query(`select v2.style_text((v2.style_for($1,$2,1::smallint,'word')).id) t`,[S,B2])).rows[0].t;
t("학생 것이 학원 기본값을 이기나", mine, "주관식 뜻 50% · 주관식 영어 50% · 첫글자 힌트");

// ⑧ 미통과가 늦귀가·재시험으로 이어지나
t("미통과를 앱이 세어 주나",
  (await c.query(`select count(*)::int n from v2.quiz_failed_today($1)`,[sh])).rows[0].n, 1);

await c.query("rollback");
console.log("■ 시험 — 틀린 개수 · 전체 개수 · 값 없으면 안 나감");
[...ok,...bad].forEach(x=>console.log("  ",x));
console.log(`\n합계 — 맞음 ${ok.length} · 틀림 ${bad.length}`);
await c.end(); process.exit(bad.length?1:0);
