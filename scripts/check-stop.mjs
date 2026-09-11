/** 검사 — 「이 교재가 이 날 멈췄나」를 **JS 와 SQL 이 똑같이** 말하나 (원칙-1).
 *  2026-09-11 첫 주 돌려보기에서 잡힘: 판단이 두 벌이라 어긋나 있었다 —
 *  JS(lib/routine-plan.js stopOn)는 stop_from 전이면 「진행중」, SQL(v2.word_test_on)은 stop_from 을
 *  아예 안 봐서 「멈춤」. 그래서 시험 회차를 넣는 순간부터 몇 주 동안 **시험을 못 내는** 상태가 됐다.
 *  둘을 같은 경우표에 넣고 답을 맞대어 본다(0161 v2.book_off_on). DB 가 없으면 건너뜀으로 센다(초록 아님). */
import pg from "pg";
import { stopOn } from "../lib/routine-plan.js";
const URL = process.env.DATABASE_URL;
if (!URL) { console.log("check-stop ⏭ DATABASE_URL 이 없어 건너뜀 — 초록이 아닙니다"); process.exit(0); }

// 경우표 — 가장자리를 다 넣는다(하루 전·그날·하루 뒤 · 빈 값 · 세 상태)
const 경우 = [];
for (const mode of ["running", "hw_off", "book_off"])
  for (const [from, until] of [[null, null], ["2026-09-12", "2026-10-12"], [null, "2026-10-12"], ["2026-09-12", null]])
    for (const on of ["2026-09-11", "2026-09-12", "2026-10-12", "2026-10-13"])
      경우.push({ mode, from, until, on });

const c = new pg.Client({ connectionString: URL }); await c.connect();
const has = (await c.query("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='v2' and p.proname='book_off_on'")).rowCount;
if (!has) { console.log("check-stop ✗\n  v2.book_off_on 이 없습니다 — 0161_stop_one_rule.sql 을 아직 안 돌린 DB 입니다"); await c.end(); process.exit(1); }
const { rows } = await c.query(
  `select i, v2.book_off_on(mode, nullif(f,'')::date, nullif(u,'')::date, d::date) as sql_off
   from unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[]) as t(i, mode, f, u, d)`,
  [경우.map((_, i) => i), 경우.map((x) => x.mode), 경우.map((x) => x.from ?? ""), 경우.map((x) => x.until ?? ""), 경우.map((x) => x.on)]);
await c.end();

const bad = [];
for (const r of rows) {
  const x = 경우[r.i];
  const js = stopOn({ stop_mode: x.mode, stop_from: x.from, stop_until: x.until }, x.on) === "book_off";
  if (js !== r.sql_off) bad.push(`${x.mode} · from ${x.from ?? "—"} · until ${x.until ?? "—"} · ${x.on} → JS ${js ? "멈춤" : "진행중"} / SQL ${r.sql_off ? "멈춤" : "진행중"}`);
}
// 읽는 자리가 정말 그 한 곳을 부르나 — 글자로도 본다(다시 두 벌이 되면 잡는다)
import { readFileSync } from "node:fs";
const m = readFileSync("supabase/migrations/0161_stop_one_rule.sql", "utf8");
if (!/create or replace function v2\.word_test_on[\s\S]*?v2\.book_off_on\(/.test(m)) bad.push("word_test_on 이 v2.book_off_on 을 안 부릅니다 — 판단이 또 두 벌이 됩니다");
if (/stop_mode\s*(<>|!=)\s*'book_off'/.test(m)) bad.push("0161 에 옛 판단(stop_mode <> 'book_off')이 남아 있습니다");

if (bad.length) { console.log(`check-stop ✗ (${bad.length}/${경우.length} 어긋남)\n  ` + bad.join("\n  ")); process.exit(1); }
console.log(`check-stop ✓ 멈춤 판단이 JS·SQL 한 규칙 — 경우 ${경우.length}가지가 다 같다(stop_from 전 · stop_until 뒤 · 빈 값 · 상태 셋)`);
