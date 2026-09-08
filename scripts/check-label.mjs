/** 소단원 이름 진행 방식대로 검사(검사-70 · (가)-⑪) — v2.unit_label 이 진행 방식(books.mode, 0144)대로 이름 짓나(진짜 DB · 임시로 넣고 되돌린다):
 *  단원(기본)은 옛 이름 그대로 · 지문·세트·단어는 소단원(sub)이 비면 「지문 N」(교재 안 차례 sort) · 소단원이 있으면 그대로(덮지 않음) · 워크북 꼬리 · 전체/짧은 꼴. lib·앱은 이 함수를 부르기만 한다(두 벌 없음).
 *  ⚠️ 소단원이 비면 유일키(book_id,chapter,mid,sub,activity)가 대단원·활동으로 갈려야 한다 — 그래서 씨앗도 대단원을 달리 준다(실제 지문 교재도 그렇다) */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
for (let i = 1; ; i++) { try { await c.connect(); break; } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
let n = 0, bad = 0;
const ok = (what, cond, why = "") => { n++; if (cond) console.log(`   ✅ ${what}`); else { bad++; console.log(`   ❌ ${what}${why ? " — " + why : ""}`); } };
const q = async (sql, args = []) => (await c.query(sql, args)).rows;
const label = async (unit, full = false) => (await q(`select v2.unit_label($1, $2) as l`, [unit, full]))[0].l;
await c.query("begin");
try {
  const bk = (await q(`insert into v2.books(name, area, mode, import_batch) values ('zz_검사 이름책', '독해', 'passage', 'fixture') returning id`))[0].id;
  const [p1, p2, ps, pw] = (await q(
    `insert into v2.units(book_id, chapter, sub, activity, is_workbook, sort, import_batch) values
       ($1, 'U1', '', '본책', false, 1, 'fixture'),
       ($1, 'U2', '', '본책', false, 2, 'fixture'),
       ($1, 'U3', '특별 지문', '본책', false, 3, 'fixture'),
       ($1, 'U4', '', '워크북', true, 4, 'fixture') returning id`, [bk])).map((r) => r.id);
  console.log("■ 지문·세트·단어 — 소단원이 비면 방식대로");
  ok("지문 교재 · 소단원 없는 줄 — 짧은 이름 「지문 1」·「지문 2」(교재 안 차례 sort) · 워크북은 「지문 4 · 워크북」", (await label(p1)) === "지문 1" && (await label(p2)) === "지문 2" && (await label(pw)) === "지문 4 · 워크북", `${await label(p1)} / ${await label(p2)} / ${await label(pw)}`);
  ok("소단원 이름이 있으면 그대로(덮지 않는다) — 「특별 지문」", (await label(ps)) === "특별 지문", await label(ps));
  ok("전체 이름은 대단원을 앞에 — 「U1 · 지문 1」", (await label(p1, true)) === "U1 · 지문 1", await label(p1, true));
  await q(`update v2.books set mode = 'set' where id = $1`, [bk]);
  ok("세트로 바꾸면 말만 바뀐다 — 「세트 1」", (await label(p1)) === "세트 1", await label(p1));
  await q(`update v2.books set mode = 'word' where id = $1`, [bk]);
  ok("단어로 바꾸면 — 「단어 1」", (await label(p1)) === "단어 1", await label(p1));
  console.log("■ 단원(기본) — 옛 이름 그대로(방식 이름 안 붙는다)");
  await q(`update v2.books set mode = 'unit' where id = $1`, [bk]);
  ok("단원 교재 — 소단원 없으면 옛 이름 「U1 · 본책」 · 소단원 있으면 그대로 「특별 지문」(옛 교재는 하나도 안 바뀐다)", (await label(p1)) === "U1 · 본책" && (await label(ps)) === "특별 지문", `${await label(p1)} / ${await label(ps)}`);
} finally { await c.query("rollback"); await c.end(); }
console.log(`\n■ 소단원 이름 검사 ${n}건 · 실패 ${bad}`);
process.exit(bad ? 1 : 0);
