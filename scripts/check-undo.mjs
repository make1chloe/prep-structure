/** 묶음 되돌리기 검사(검사-69 · 5단계-④) — SQL 한 곳 undo_excel_run 이 맞게 도나(진짜 DB · 한 트랜잭션 안에서 만들고 끝에 되돌린다):
 *  update → before 로 · insert → 지움 · 걸린 insert(문법 분류가 이어진 단원) → 숨김(지우지 않는다) · ② 지우고 새로(replace_book_units p_run)가 적은 delete(before = 줄 전체) → 같은 id 로 되살림(같은 열쇠의 줄이 살아 있으면 그 줄을 before 내용으로) ·
 *  뒤 묶음이 살아 있으면 막힘 · 이미 되돌린 묶음은 막힘 · before 가 비면 막힘(0087 파기) · 교재 시트 묶음(insert → 지움 · 단원이 걸린 교재는 안 씀으로 · update → before) · book_board.runs 의 can_undo 는 같은 표의 마지막 살아 있는 묶음만 · 학원 사람이 아니면 막힘 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const J = (x) => JSON.stringify(x);
const q = async (sql, args = []) => (await c.query(sql, args)).rows;
/** 막히나 — 막히면 오류 글, 안 막히면 "" (savepoint 로 트랜잭션은 살린다) */
const fails = async (sql, args = []) => { try { await c.query("savepoint f"); await c.query(sql, args); await c.query("release savepoint f"); return ""; } catch (e) { await c.query("rollback to savepoint f"); return e.message; } };
const STAFF = "00000000-0000-4000-8000-000000000001";   // 0004 fixture 원장
console.log("■ undo_excel_run — 진짜 DB(끝에 되돌린다)");
await c.query("begin");
try {
  if (!(await q(`select 1 from v2.profiles where id = $1 and role = 'principal' and state = 'active'`, [STAFF])).length) { console.log("   ⏭ 검사용 원장이 없다(0004_fixture)"); process.exit(1); }
  ok("학원 사람이 아니면 못 되돌린다", /학원 사람만/.test(await fails(`select v2.undo_excel_run(1)`)));
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [J({ sub: STAFF, role: "authenticated" })]);
  const bk = (await q(`insert into v2.books(name, area, import_batch) values ('zz_검사 되돌리기책', '문법', 'fixture') returning id`))[0].id;
  const [u1, u2] = (await q(`insert into v2.units(book_id, chapter, sub, activity, sort, q_count, import_batch) values ($1, 'CH 1', '1-1', '본책', 1, 10, 'fixture'), ($1, 'CH 1', '1-2', '본책', 2, 12, 'fixture') returning id`, [bk])).map((r) => r.id);
  // ① 덮어쓰기 묶음 — 1-2 고침(before = 줄 전체) · 1-3 새 줄 · 1-4 새 줄(분류를 이어 못 지우게)
  const run1 = (await q(`insert into v2.excel_run(tbl, sheet, who) values ('units', 'zz.xlsx', $1) returning id`, [STAFF]))[0].id;
  const before2 = (await q(`select to_jsonb(u) b from v2.units u where id = $1`, [u2]))[0].b;
  await c.query(`update v2.units set q_count = 99, sort = 20 where id = $1`, [u2]);
  const [u3, u4] = (await q(`insert into v2.units(book_id, chapter, sub, activity, sort, q_count, import_batch) values ($1, 'CH 1', '1-3', '본책', 30, 5, 'excel'), ($1, 'CH 1', '1-4', '본책', 40, 6, 'excel') returning id`, [bk])).map((r) => r.id);
  await c.query(`insert into v2.excel_row(run_id, tbl, row_id, op, before) values ($1, 'units', $2, 'update', $3), ($1, 'units', $4, 'insert', null), ($1, 'units', $5, 'insert', null)`, [run1, u2, before2, u3, u4]);
  const tp = (await q(`insert into v2.grammar_topics(name) values ('zz_검사 분류') returning id`))[0].id;
  await c.query(`insert into v2.unit_topic(unit_id, topic_id) values ($1, $2)`, [u4, tp]);
  // ② 뒤 묶음이 살아 있으면 막힌다 · 판의 can_undo
  const run2 = (await q(`insert into v2.excel_run(tbl, sheet, who) values ('units', 'zz2.xlsx', $1) returning id`, [STAFF]))[0].id;
  ok("뒤에 올린 단원 묶음이 살아 있으면 앞 묶음은 못 되돌린다(「뒤에 올린 묶음 #N 을 먼저」)", new RegExp(`뒤에 올린 묶음 #${run2}`).test(await fails(`select v2.undo_excel_run($1)`, [run1])));
  const board = (await q(`select v2.book_board(current_date, $1) b`, [bk]))[0].b;
  const rr = (board?.runs ?? []).find((r) => r.id === Number(run1)), r2 = (board?.runs ?? []).find((r) => r.id === Number(run2));   // bigserial 은 pg 가 글자로 준다 · jsonb 는 수
  ok("book_board.runs — 최근 묶음에 둘 다 · 앞 묶음 can_undo false · 뒤 묶음 true · 앞 묶음 셈 새로 2 · 고침 1 · 올린 사람 이름", Boolean(rr && r2) && rr?.can_undo === false && r2?.can_undo === true && Number(rr?.n_insert) === 2 && Number(rr?.n_update) === 1 && rr?.who === "zz_시험_원장", J((board?.runs ?? []).slice(0, 2)));
  const res2 = (await q(`select v2.undo_excel_run($1) r`, [run2]))[0].r;
  ok("빈 묶음(줄 0)을 되돌리면 셈 0 · undone_at 이 선다", res2.restored === 0 && res2.removed === 0 && (await q(`select undone_at from v2.excel_run where id = $1`, [run2]))[0].undone_at !== null, J(res2));
  ok("이미 되돌린 묶음은 다시 못 되돌린다", /이미 되돌린/.test(await fails(`select v2.undo_excel_run($1)`, [run2])));
  const res1 = (await q(`select v2.undo_excel_run($1) r`, [run1]))[0].r;
  const after = await q(`select id, sub, sort, q_count, state from v2.units where book_id = $1 order by sort`, [bk]);
  ok("① 되돌리기 — 1-2 는 before 로(문항 12 · 차례 2) · 1-3 은 지워짐 · 1-4 는 분류가 걸려 숨김(지우지 않는다) · 셈 되살림 1 · 지움 1 · 숨김 1", res1.restored === 1 && res1.removed === 1 && res1.hidden === 1 && after.length === 3 && after.find((u) => u.id === u2)?.q_count === 12 && after.find((u) => u.id === u2)?.sort === 2 && !after.find((u) => u.id === u3) && after.find((u) => u.id === u4)?.state === "hidden", J([res1, after]));
  // ③ 지우고 새로(replace_book_units p_run) — delete(before 줄 전체) + insert 를 적는다 → 되돌리면 같은 id 로 되살아난다 · 같은 열쇠의 새 줄이 걸려 있으면 그 줄을 before 내용으로
  await c.query(`delete from v2.unit_topic where unit_id = $1`, [u4]); await c.query(`update v2.units set state = 'active' where id = $1`, [u4]);
  const run3 = (await q(`insert into v2.excel_run(tbl, sheet, who) values ('units', 'zz3.xlsx', $1) returning id`, [STAFF]))[0].id;
  const cnt = (await q(`select v2.replace_book_units($1, $2::jsonb, 'excel', $3) n`, [bk, J([{ chapter: "CH 9", sub: "9-1", activity: "본책", sort: 10, q_count: 1 }, { chapter: "CH 1", sub: "1-1", activity: "본책", sort: 20, q_count: 77 }]), run3]))[0].n;
  const ops3 = await q(`select op, count(*)::int n from v2.excel_row where run_id = $1 group by op order by op`, [run3]);
  ok("② 지우고 새로 — 파일 2줄 · 묶음에 delete 3(before = 줄 전체) · insert 2", cnt === 2 && J(ops3) === J([{ op: "delete", n: 3 }, { op: "insert", n: 2 }]) && (await q(`select before->>'sub' s from v2.excel_row where run_id = $1 and op = 'delete' order by id`, [run3])).map((x) => x.s).join() === "1-1,1-2,1-4", J(ops3));
  const new11 = (await q(`select id from v2.units where book_id = $1 and sub = '1-1'`, [bk]))[0].id;
  await c.query(`insert into v2.unit_topic(unit_id, topic_id) values ($1, $2)`, [new11, tp]);   // 새 1-1 에 분류를 이어 못 지우게
  const res3 = (await q(`select v2.undo_excel_run($1) r`, [run3]))[0].r;
  const after3 = await q(`select id, sub, sort, q_count, state from v2.units where book_id = $1 order by sort`, [bk]);
  ok("②를 되돌리면 — 새 9-1 은 지워지고(1) · 새 1-1 은 분류가 걸려 못 지워 숨겼다가 같은 열쇠의 옛 1-1 이 그 줄을 before 내용으로 되살린다(문항 10 · 차례 1 · 쓰는 중 · 새 id 그대로) · 1-2·1-4 는 같은 id 로 되살아남 · 셈 되살림 3 · 지움 1 · 숨김 1", res3.revived === 3 && res3.removed === 1 && res3.hidden === 1 && after3.length === 3 && after3.find((u) => u.sub === "1-1")?.id === new11 && after3.find((u) => u.sub === "1-1")?.q_count === 10 && after3.find((u) => u.sub === "1-1")?.sort === 1 && after3.find((u) => u.sub === "1-1")?.state === "active" && after3.find((u) => u.id === u2)?.q_count === 12 && after3.find((u) => u.id === u4)?.sub === "1-4", J([res3, after3]));
  // ④ before 가 비워진 묶음(0087 파기 뒤)은 못 되돌린다
  const run4 = (await q(`insert into v2.excel_run(tbl, sheet, who) values ('units', 'zz4.xlsx', $1) returning id`, [STAFF]))[0].id;
  await c.query(`insert into v2.excel_row(run_id, tbl, row_id, op, before) values ($1, 'units', $2, 'update', null)`, [run4, u2]);
  ok("before 가 비워진 묶음은 못 되돌린다(90일 파기 — 「비워져 있습니다」)", /비워져/.test(await fails(`select v2.undo_excel_run($1)`, [run4])));
  // ⑤ 교재 시트 묶음 — 새 교재 지움 · 단원이 걸린 새 교재는 안 씀으로 · 고친 교재는 before 로
  const bkb = (await q(`insert into v2.books(name, area, import_batch) values ('zz_검사 시트책', '독해', 'excel') returning id`))[0].id;
  const bk3 = (await q(`insert into v2.books(name, area, import_batch) values ('zz_검사 시트책2', '독해', 'excel') returning id`))[0].id;
  await c.query(`insert into v2.units(book_id, chapter, sub, activity, sort, import_batch) values ($1, 'U1', '1', '본책', 1, 'excel')`, [bk3]);
  const run5 = (await q(`insert into v2.excel_run(tbl, sheet, who) values ('books', 'zzb.xlsx', $1) returning id`, [STAFF]))[0].id;
  const beforeBk = (await q(`select to_jsonb(b) b from v2.books b where id = $1`, [bk]))[0].b;
  await c.query(`update v2.books set level = '중2', price = 15000 where id = $1`, [bk]);
  await c.query(`insert into v2.excel_row(run_id, tbl, row_id, op, before) values ($1, 'books', $2, 'insert', null), ($1, 'books', $3, 'update', $4), ($1, 'books', $5, 'insert', null)`, [run5, bkb, bk, beforeBk, bk3]);
  ok("단원 묶음 #4(before 없음)가 살아 있어도 교재 묶음은 되돌릴 수 있다 — 표마다 따로 센다", (await q(`select v2.book_board(current_date, $1) b`, [bk]))[0].b?.runs?.find((r) => r.id === Number(run5))?.can_undo === true);
  const res5 = (await q(`select v2.undo_excel_run($1) r`, [run5]))[0].r;
  const bkNow = (await q(`select level, price from v2.books where id = $1`, [bk]))[0];
  ok("교재 시트 묶음 되돌리기 — 새 교재는 지워지고(1) · 단원이 걸린 새 교재는 「안 씀」으로(숨김 1 · 지우지 않는다) · 고친 교재는 before 로(레벨·교재비 없음) · 되살림 1", res5.removed === 1 && res5.hidden === 1 && res5.restored === 1 && (await q(`select 1 from v2.books where id = $1`, [bkb])).length === 0 && (await q(`select state from v2.books where id = $1`, [bk3]))[0].state === "stopped" && bkNow.level === null && bkNow.price === null, J([res5, bkNow]));
} finally { await c.query("rollback"); await c.end(); }
console.log(`\n■ 되돌리기 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
