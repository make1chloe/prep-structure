/** 경고·반성문 검사(확정-㊼ · 검사-㊱) — 경고는 사실에서 센다(SQL 한 곳). 진짜 DB, 트랜잭션 안에서 쓰고 되돌린다. 리허설 학생(0004 fixture)으로만.
 *  하루 1회(지각+미제출 같은 날 = 1) · 미흡은 규칙 건수부터 · 단어 미통과(재시험·문장은 안 셈) · 정리하면 그 달 1일부터 · 마지막으로 쓴 반성문 뒤 N회째(아이 기준 → 학원 기본)와 유예 중이면 묻는다(확정-63) · 월초 띠 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const S = "00000000-0000-4000-9000-000000000001";
const st = (await c.query(`select id from v2.students where id=$1 and import_batch='fixture'`, [S])).rows[0];
if (!st) { console.log("   ⏭ 검사용 학생이 없다(0004_fixture)"); process.exit(1); }
const days = async (a, b) => (await c.query(`select date::text d, why from v2.warn_days($1, $2, $3) order by 1`, [S, a, b])).rows;
const state = async (on) => (await c.query(`select * from v2.warn_states(array[$1]::uuid[], $2)`, [S, on])).rows[0];
await c.query("begin");
try {
  await c.query(`delete from v2.warn_reset where student_id is null`);   // 검사 안에서만 — 되돌린다
  const sheet = async (d, attend = "present") => (await c.query(`insert into v2.day_sheet(student_id, date, attend) values ($1, $2, $3) returning id`, [S, d, attend])).rows[0].id;
  let k = 0; const item = (sh, status) => c.query(`insert into v2.day_item(sheet_id, slot, range_note, status, sort) values ($1, 'check', $3, $2, 1)`, [sh, status, `검사용 줄 ${++k}`]);   // 같은 자리 같은 글은 하나(0102)
  console.log("■ 경고 하루 1회 — 사실에서 센다");
  const s1 = await sheet("2026-11-03", "late"); await item(s1, "missing");
  ok("지각 + 미제출 같은 날 = 하루 1회, 까닭은 둘", (await days("2026-11-01", "2026-11-30")).length === 1 && (await days("2026-11-01", "2026-11-30"))[0].why === "지각 · 숙제 미제출");
  const s2 = await sheet("2026-11-04"); await item(s2, "weak");
  ok("미흡 1건은 경고가 아니다(규칙 warn.weak_from=2)", (await days("2026-11-04", "2026-11-04")).length === 0);
  await item(s2, "weak");
  ok("미흡 2건부터 경고", (await days("2026-11-04", "2026-11-04")).length === 1);
  const s3 = await sheet("2026-11-05");
  await c.query(`insert into v2.quiz(student_id, kind, source, free_note, taken_sheet_id, taken_on, total, wrong, cut_pct, state) values ($1,'word','manual','범위',$2,'2026-11-05',20,5,90,'failed')`, [S, s3]);
  ok("단어 미통과는 경고", (await days("2026-11-05", "2026-11-05")).length === 1 && (await days("2026-11-05", "2026-11-05"))[0].why === "단어 미통과");
  const s4 = await sheet("2026-11-06");
  await c.query(`insert into v2.quiz(student_id, kind, source, free_note, taken_sheet_id, taken_on, total, wrong, cut_pct, state) values ($1,'sentence','manual','범위',$2,'2026-11-06',20,5,90,'failed')`, [S, s4]);
  ok("문장 미통과는 경고가 아니다(확정-㊼ 단어만)", (await days("2026-11-06", "2026-11-06")).length === 0);
  console.log("■ 3회째면 묻는다(규칙 warn.report_at) · 배수째도 · 유예는 다음 경고에 다시");
  let w = await state("2026-11-05");
  ok("11/5 에 횟수 3 · 오늘 까닭 있음 · due", w.count === 3 && w.today_why === "단어 미통과" && w.due === true && w.report_at === 3, JSON.stringify(w));
  await c.query(`insert into v2.reflection(student_id, sheet_id, asked_on, count_at, disposal) values ($1, $2, '2026-11-05', 3, 'defer')`, [S, s3]);
  const s5 = await sheet("2026-11-10", "late");
  w = await state("2026-11-10");
  ok("유예했으면 다음 경고(4회째)에 다시 묻는다 — pending", w.count === 4 && w.due === true && w.pending !== null);
  await c.query(`insert into v2.reflection(student_id, sheet_id, asked_on, count_at, disposal) values ($1, $2, '2026-11-10', 4, 'stay')`, [S, s5]);
  await sheet("2026-11-11", "late");
  w = await state("2026-11-11");
  ok("한 번 쓴 뒤(11/10) — 5회째는 지난 반성문 뒤 1회째라 안 묻는다(확정-63)", w.count === 5 && w.since_written === 1 && w.due === false && w.pending === null, JSON.stringify(w));
  await sheet("2026-11-12", "late");
  ok("6회째 = 지난 반성문 뒤 2회째 — 아직(기준 3)", (await state("2026-11-12")).due === false);
  await sheet("2026-11-13", "late");
  ok("7회째 = 지난 반성문 뒤 3회째 — 다시 묻는다(1번 쓰면 다시 N번 센 뒤 1번)", (await state("2026-11-13")).due === true && (await state("2026-11-13")).since_written === 3);
  await c.query(`update v2.students set warn_report_at = 2 where id = $1`, [S]);
  ok("아이마다 따로 — 이 아이 기준 2 면 6회째(지난 반성문 뒤 2회째)에 묻는다", (await state("2026-11-12")).due === true && (await state("2026-11-12")).report_at === 2 && (await state("2026-11-12")).own_limit === 2);
  await c.query(`update v2.students set warn_report_at = null where id = $1`, [S]);
  ok("비우면 학원 기본(3)으로 돌아간다", (await state("2026-11-12")).report_at === 3 && (await state("2026-11-12")).own_limit === null);
  console.log("■ 달 정리 — 횟수만 0, 기록은 남는다 · 월초 띠");
  let band = (await c.query(`select month::text as month, prev_month::text as prev_month, need from v2.warn_band('2026-12-02')`)).rows[0];
  ok("12월 초 — 11월 경고가 있고 정리를 안 정했으면 띠가 뜬다", band.need === true && band.month === "2026-12-01" && band.prev_month === "2026-11-30", JSON.stringify(band));
  await c.query(`insert into v2.warn_reset(student_id, month, action) values (null, '2026-12-01', 'keep')`);
  ok("「그냥 두기」면 띠만 내려가고 횟수는 그대로(7)", (await c.query(`select * from v2.warn_band('2026-12-02')`)).rows[0].need === false && (await state("2026-12-02")).count === 7);
  await c.query(`update v2.warn_reset set action = 'reset' where student_id is null and month = '2026-12-01'`);
  ok("「정리」면 12월 1일부터 센다 — 횟수 0, 11월 기록은 그대로 남는다", (await state("2026-12-02")).count === 0 && (await days("2026-11-01", "2026-11-30")).length === 7);
  let blocked = false; try { await c.query("savepoint m"); await c.query(`insert into v2.warn_reset(student_id, month, action) values (null, '2026-12-15', 'reset')`); await c.query("release savepoint m"); } catch (e) { blocked = true; await c.query("rollback to savepoint m"); }
  ok("달의 1일이 아니면 DB 가 막는다", blocked);
} finally { await c.query("rollback"); await c.end(); }
console.log(`\n■ 경고·반성문 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
