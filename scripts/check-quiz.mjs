/** 시험 검사 — 판정과 리포트 문이 SQL 한 곳에서 맞게 도나(0038~0041, 원장님 9/2) · lib 이 그 판정을 다시 만들지 않나.
 *  진짜 DB(눌러보기 또는 실제)로 트랜잭션 안에서 쓰고 되돌린다. 리허설 학생(fixture)으로만 쓴다(대전제-12). */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
console.log("■ 판정은 SQL 한 곳 — lib 이 통과선을 다시 세지 않는다");
for (const f of ["lib/quiz.js", "lib/quiz-plan.js", "app/today/row.js"]) { const s = strip(readFileSync(f, "utf8")); ok(`${f} 에 「>= cut」 같은 판정이 없다`, !/(>=|<)\s*(q\.)?cut_pct|cut_pct\s*(<=|>)/.test(s) && !/\* 100\s*>=/.test(s)); }
const S = "00000000-0000-4000-9000-000000000001";   // 0004 fixture 학생
const st = (await c.query(`select id from v2.students where id=$1 and import_batch='fixture'`, [S])).rows[0];
if (!st) { console.log("   ⏭ 검사용 학생이 없다(0004_fixture)"); process.exit(1); }
await c.query("begin");
try {
  const sh0 = (await c.query(`insert into v2.day_sheet(student_id, date) values ($1, '2026-10-19') returning id`, [S])).rows[0].id;   // 낸 날
  const sh = (await c.query(`insert into v2.day_sheet(student_id, date) values ($1, '2026-10-20') returning id`, [S])).rows[0].id;    // 본 날
  const style = (await c.query(`select * from v2.style_for($1, null, 1::smallint, 'word')`, [S])).rows[0];
  console.log("■ 통과선·방식은 한 곳(style_for: 아이 → 교재 → 학원 기본값)");
  ok("학원 기본값 1회독 단어 = 통과 90 · 객뜻 50/주뜻 50", style?.cut_pct === 90 && style.mc_meaning === 50 && style.sa_meaning === 50);
  ok("2회독은 더 어렵다(주관식 100)", (await c.query(`select sa_meaning from v2.style_for($1, null, 2::smallint, 'word')`, [S])).rows[0]?.sa_meaning === 100);
  await c.query(`insert into v2.quiz_style(student_id, book_id, round, kind, mc_meaning, sa_meaning, cut_pct) values ($1, null, 1, 'word', 30, 70, 80)`, [S]);
  ok("아이 것이 있으면 아이 것(통과 80)", (await c.query(`select cut_pct from v2.style_for($1, null, 1::smallint, 'word')`, [S])).rows[0]?.cut_pct === 80);
  console.log("■ 틀린 개수만 적는다 — 맞은 개수·%·통과는 세어 나온다(0039)");
  const q = (await c.query(`insert into v2.quiz(student_id, kind, source, free_note, assigned_sheet_id, assigned_on, total, cut_pct, state) values ($1, 'word', 'manual', '검사용 범위', $2, '2026-10-19', 20, 90, 'planned') returning id`, [S, sh0])).rows[0].id;
  const read = async () => (await c.query(`select v2.passed(q) passed, v2.pct(q) pct, v2.quiz_correct(q.id) correct from v2.quiz q where id=$1`, [q])).rows[0];
  ok("틀린 개수를 안 적으면 판정도 없다(「안 봤다」≠「0점」)", (await read()).passed === null);
  await c.query(`update v2.quiz set wrong=2, taken_sheet_id=$2, taken_on='2026-10-20' where id=$1`, [q, sh]);
  let r = await read(); ok("2개 틀림 → 맞은 18 · 90% · 통과(경계값은 통과)", r.correct === 18 && Number(r.pct) === 90 && r.passed === true);
  await c.query(`update v2.quiz set wrong=3, state='failed' where id=$1`, [q]);
  r = await read(); ok("3개 틀림 → 85% · 못 넘음", Number(r.pct) === 85 && r.passed === false);
  console.log("■ 리포트 문 — 값이 없으면 안 나간다(원장님 9/2)");
  const q2 = (await c.query(`insert into v2.quiz(student_id, kind, source, free_note, assigned_sheet_id, assigned_on, cut_pct, state) values ($1, 'sentence', 'manual', '공영2 2과 본문', $2, '2026-10-20', 90, 'planned') returning id`, [S, sh])).rows[0].id;
  ok("다음 시간 — 전체 개수를 안 적은 시험은 리포트에 안 선다", (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='다음 시간'`, [sh])).rows[0].n === 0);
  await c.query(`update v2.quiz set total=14 where id=$1`, [q2]);
  ok("전체 개수를 적으면 선다", (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='다음 시간'`, [sh])).rows[0].n === 1);
  ok("오늘 본 것 — 틀린 개수를 적은 것만 나간다(1건)", (await c.query(`select count(*)::int n from v2.quiz_for_report($1) where part='오늘 본 것'`, [sh])).rows[0].n === 1);
  ok("미통과가 늦귀가 사유 후보로 세어 나온다(quiz_failed_today 1건 · 85%)", (await c.query(`select count(*)::int n, min(pct) pct from v2.quiz_failed_today($1)`, [sh])).rows[0].n === 1);
  console.log("■ 교재멈춤이면 시험도 못 낸다(0037 · quiz_guard) — 내신·직접 범위는 별개");
  const bk = (await c.query(`insert into v2.books(name, area, import_batch) values ('zz_검사 단어책', '단어', 'fixture') returning id`)).rows[0].id;
  await c.query(`insert into v2.student_book(student_id, book_id, from_date, stop_mode) values ($1, $2, '2026-01-01', 'book_off')`, [S, bk]);
  let blocked = false; try { await c.query("savepoint g"); await c.query(`insert into v2.quiz(student_id, kind, source, book_id, assigned_on, state) values ($1, 'word', 'book', $2, '2026-10-20', 'planned')`, [S, bk]); await c.query("release savepoint g"); } catch (e) { blocked = /교재멈춤/.test(e.message); await c.query("rollback to savepoint g"); }
  ok("교재멈춤 교재로 낸 시험은 DB 가 막는다", blocked);
  let free = true; try { await c.query("savepoint h"); await c.query(`insert into v2.quiz(student_id, kind, source, free_note, assigned_on, state) values ($1, 'word', 'manual', '직접 범위', '2026-10-20', 'planned')`, [S]); await c.query("release savepoint h"); } catch (e) { free = false; await c.query("rollback to savepoint h"); }
  ok("직접 범위는 멈춤과 상관없다", free);
} finally { await c.query("rollback"); await c.end(); }
console.log(`\n■ 시험 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
