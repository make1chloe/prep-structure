/**
 * 아이의 「다 했어요」와 원장님의 ○ 이 **다른 칸인가** (0082 · 원칙-1 · 표-9 · 표-10).
 *
 * ⚠️ **진짜 DB 로 돈다.** 이 자리는 「누가 무엇을 쓸 수 있나」라서
 *    가짜 DB 로는 원리적으로 못 본다 — 권한 벽을 한 번도 안 밟기 때문이다.
 * ⚠️ 트랜잭션 안에서 돌고 되돌린다.
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await c.connect();
let n = 0, bad = 0;
const ok = (t, v, m = "") => { n++; console.log(v ? `   ✅ ${t}` : (bad++, `   ❌ ${t}${m ? " — " + m : ""}`)); };
const 해 = async (sql, par) => { await c.query("savepoint s");
  try { const r = await c.query(sql, par); await c.query("release savepoint s"); return { 됨: true, 줄: r.rowCount }; }
  catch (e) { await c.query("rollback to s"); return { 됨: false, 왜: e.message.split("\n")[0] }; } };

console.log("\n■ 아이 「다 했어요」 ↔ 원장님 ○ — 다른 칸인가");
await c.query("begin");
try {
  const st = (await c.query(
    `select id, profile_id from v2.students where import_batch = 'fixture' and profile_id is not null limit 1`)).rows[0];
  const 원장 = (await c.query(
    `select id from v2.profiles where role in ('principal','instructor') and state='active'
      order by (role='principal') desc limit 1`)).rows[0];
  ok("리허설 아이와 원장 계정을 찾았다", !!st && !!원장);

  const u = (await c.query(`select id from v2.units where state='active' limit 1`)).rows[0];
  const it = (await c.query(`select id from v2.learn_items where state='active' limit 1`)).rows[0];
  let sh = (await c.query(`select id from v2.day_sheet where student_id=$1 and date=v2.today()`, [st.id])).rows[0];
  if (!sh) sh = (await c.query(`insert into v2.day_sheet (student_id,date,attend,import_batch,closed_at)
     values ($1,v2.today(),'present','fixture',now()) returning id`, [st.id])).rows[0];
  else await c.query(`update v2.day_sheet set closed_at=now() where id=$1`, [sh.id]);
  const di = (await c.query(`insert into v2.day_item (sheet_id,slot,item_id,unit_id,range_note,sort)
     values ($1,'home',$2,$3,'1-10쪽',77) returning id`, [sh.id, it.id, u.id])).rows[0];

  const 되기 = async (id) => { await c.query(
    `select set_config('request.jwt.claims', '{"sub":"${id}","role":"authenticated"}', true)`);
    await c.query("set local role authenticated"); };
  const 서버로 = async () => { await c.query("reset role");
    await c.query(`select set_config('request.jwt.claims','',true)`); };

  /* ── 아이 ── */
  await 되기(st.profile_id);
  ok("⚠️⚠️ 아이가 **원장님 ○ 을 스스로 못 준다** (예전에는 됐다 — 검사 목록에서 사라졌다)",
     (await 해(`update v2.day_item set status='done' where id=$1`, [di.id])).됨 === false);
  ok("아이가 「다 했어요」는 누를 수 있다",
     (await 해(`update v2.day_item set said_done_at=now() where id=$1`, [di.id])).됨 === true);
  await 해(`update v2.day_item set said_done_at=now() where id=$1`, [di.id]);
  const 값 = (await c.query(`select said_done_at a from v2.day_item where id=$1`, [di.id])).rows[0].a;
  await 해(`update v2.day_item set said_done_at='2020-01-01' where id=$1`, [di.id]);
  const 값2 = (await c.query(`select said_done_at a from v2.day_item where id=$1`, [di.id])).rows[0].a;
  ok("⚠️ **시각은 서버가 정한다** — 아이가 보낸 값을 안 믿는다 (표-10)",
     !String(값2).includes("2020"), String(값2));
  ok("이미 누른 것은 시각이 안 바뀐다", String(값) === String(값2));
  ok("⚠️ 아이 손으로는 **못 내린다** (원장님께 말씀드려야 한다)",
     (await 해(`update v2.day_item set said_done_at=null where id=$1`, [di.id])).됨 === false);
  ok("⚠️⚠️ **그 칸만 빼고 비교한다** — 범위를 몰래 못 고친다 (표-9)",
     (await 해(`update v2.day_item set said_done_at=now(), range_note='1-100쪽' where id=$1`, [di.id])).됨 === false);
  const 남 = await 해(`update v2.day_item set said_done_at=now() where sheet_id <> $1`, [sh.id]);
  ok("남의 줄은 한 줄도 못 건드린다", 남.됨 === true && 남.줄 === 0, JSON.stringify(남));

  /* ── 원장님 ── */
  await 되기(원장.id);
  ok("원장님은 검사 ○ 을 준다",
     (await 해(`update v2.day_item set status='done' where id=$1`, [di.id])).됨 === true);
  const 둘 = (await c.query(
    `select status, said_done_at is not null said from v2.day_item where id=$1`, [di.id])).rows[0];
  ok("⚠️⚠️ **두 사실이 따로 남는다** (한 칸에 두 뜻이 아니다 — 원칙-1)",
     둘.status === "done" && 둘.said === true, JSON.stringify(둘));

  /* ── 서버 (검사·마이그레이션) ── */
  await 서버로();
  ok("⚠️ jwt 없는 자리(검사·마이그레이션)는 **안 막힌다** — 막으면 검사가 통째로 죽는다",
     (await 해(`update v2.day_item set range_note='서버' where id=$1`, [di.id])).됨 === true);
} finally { await c.query("rollback").catch(() => {}); }

const 남은 = (await c.query(`select count(*)::int n from v2.day_item where said_done_at is not null`)).rows[0].n;
ok("⚠️ 검사가 흔적을 안 남겼다", 남은 === 0, `${남은}줄`);

/* ── 앱이 옛 칸을 다시 쓰지 않는가 ── */
{
  const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const me = 코드만(readFileSync("app/me/actions.js", "utf8"));
  ok("⚠️ 아이 화면이 `status` 를 **안 쓴다** (그 칸은 원장님 것이다)",
     !/update\([^)]*status\s*:/.test(me) && /said_done_at/.test(me),
     "아이 화면이 status 를 쓰면 0082 를 통째로 무르는 것이다");
  const day = 코드만(readFileSync("lib/day.js", "utf8"));
  ok("⚠️ 다시 굳혀도 **아이가 누른 줄은 안 건드린다**",
     /said_done_at is null/.test(day),
     "안 넣으면 아이가 「1-10쪽 다 했어요」 한 뒤 범위가 바뀌어도 아무도 못 알아챈다");
}

console.log(`\n■ 아이 「다 했어요」 검사 ${n}건 · 실패 ${bad}`);
await c.end();
process.exit(bad ? 1 : 0);
