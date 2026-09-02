/**
 * 영역 메모 검사 (0079 · 목업 31).
 * ⚠️ 진짜 DB · 트랜잭션 안에서 돌고 되돌린다 — 검사가 진짜 아이 판에 흔적을 남긴 사고가 이미 났다.
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { areaMemos, putAreaMemos } from "../lib/day.js";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await c.connect();
const db = { query: (s, p) => c.query(s, p) };
let n = 0, bad = 0;
const ok = (t, v, m = "") => { n++; console.log(v ? `   ✅ ${t}` : (bad++, `   ❌ ${t}${m ? " — " + m : ""}`)); };

console.log("\n■ 영역 메모 (단어·독해·문법·영작 한 줄씩)");
await c.query("begin");
try {
  const st = (await c.query(`select id from v2.students where import_batch = 'fixture' limit 1`)).rows[0];
  ok("리허설 학생을 찾았다", !!st);
  const sh = (await c.query(
    `insert into v2.day_sheet (student_id, date, attend, import_batch)
     values ($1::uuid, v2.today(), 'present', 'fixture') returning id`, [st.id])).rows[0];

  // ① 적기
  const a = await putAreaMemos(db, sh.id, { 문법: "간접의문문 어순", 독해: "빈칸 2개 놓침" });
  ok("두 영역이 들어갔다", a.wrote === 2, JSON.stringify(a));
  ok("읽으면 그대로 나온다", (await areaMemos(db, sh.id)).문법 === "간접의문문 어순");

  // ② ⚠️ 준 영역만 건드린다
  const b = await putAreaMemos(db, sh.id, { 문법: "관계대명사" });
  const m2 = await areaMemos(db, sh.id);
  ok("⚠️ 안 준 영역은 그대로 있다", m2.독해 === "빈칸 2개 놓침",
     `독해=${m2.독해} — 화면이 한 칸만 고쳤는데 남의 칸이 사라지면 못 알아챈다`);
  ok("준 영역은 바뀌었다", m2.문법 === "관계대명사" && b.wrote === 1);

  // ③ 같은 값이면 안 쓴다 — 그런데 실패도 아니다
  const s = await putAreaMemos(db, sh.id, { 문법: "관계대명사" });
  ok("같은 값이면 안 쓰고, 그것을 실패로 세지 않는다", s.wrote === 0 && s.same === 1, JSON.stringify(s));

  // ④ 빈 줄은 지운다
  const d = await putAreaMemos(db, sh.id, { 독해: "  " });
  ok("빈 줄은 지운다", d.removed === 1 && (await areaMemos(db, sh.id)).독해 === undefined);

  // ⑤ 영역 목록 — 없는 영역은 DB 가 막는다 (0단계 7번)
  // ⚠️ 일부러 내는 오류는 **세이브포인트 안**에서 낸다. 안 그러면 그 오류가 판을 통째로
  //    물어 뒤에 오는 검사가 전부 25P02(중단된 트랜잭션)로 죽는다 — 실제로 그랬다.
  let 막았나 = false;
  await c.query("savepoint bad");
  try { await putAreaMemos(db, sh.id, { 듣기: "x" }); await c.query("release savepoint bad"); }
  catch { 막았나 = true; await c.query("rollback to bad"); }
  ok("⚠️ 없는 영역은 DB 가 막는다 (엑셀이 화면 제약을 뚫는 유일한 길)", 막았나);

  // ⑥ ⚠️⚠️ 마감 전에는 아이·학부모에게 안 보인다 (옛 앱 사고 #7 이 이 술어가 없어서 났다)
  const 아이 = (await c.query(
    `select p.id from v2.profiles p join v2.students s on s.profile_id = p.id
      where s.id = $1::uuid`, [st.id])).rows[0];
  const 아이눈 = async () => {
    await c.query("savepoint v");
    await c.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: 아이.id, role: "authenticated" })]);
    await c.query("set local role authenticated");
    const r = await c.query(`select count(*)::int n from v2.day_area_memo where sheet_id = $1::uuid`, [sh.id]);
    await c.query("rollback to v");
    return r.rows[0].n;
  };
  ok("리허설 아이에게 계정이 있다", !!아이);
  if (아이) {
    ok("⚠️⚠️ **마감 전에는 아이에게 한 줄도 안 보인다**", (await 아이눈()) === 0,
       "옛 앱 사고 #7 — 접근 규칙이 판 존재만 보고 마감 술어가 없어 마감 전 내용이 그대로 나갔다");
    await c.query(`update v2.day_sheet set closed_at = now() where id = $1::uuid`, [sh.id]);
    ok("마감하면 보인다", (await 아이눈()) === 1);
  }

  // ⑦ 파기 목록에 올라 있나 (자동 검사 ⑨)
  const pm = (await c.query(
    `select count(*)::int n from v2.purge_map where tbl = 'day_area_memo'`)).rows[0].n;
  ok("파기 목록에 올라 있다 — 안 올리면 파기 SQL 이 이 표를 안 지나간다", pm > 0);

  // ⑧ 정책과 GRANT 는 **짝**이다
  const g = (await c.query(
    `select count(*)::int n from information_schema.role_table_grants
      where table_schema='v2' and table_name='day_area_memo' and grantee='authenticated'
        and privilege_type in ('SELECT','INSERT','UPDATE')`)).rows[0].n;
  ok("정책과 GRANT 가 짝이다 (하나만 있으면 아무 일도 안 일어난다)", g === 3, `${g}/3`);
  const del = (await c.query(
    `select count(*)::int n from information_schema.role_table_grants
      where table_schema='v2' and table_name='day_area_memo' and grantee='authenticated'
        and privilege_type='DELETE'`)).rows[0].n;
  ok("지우기는 안 준다 (대전제 6)", del === 0);
} finally { await c.query("rollback"); }

const 남은 = (await c.query(`select count(*)::int n from v2.day_area_memo`)).rows[0].n;
ok("⚠️ 검사가 흔적을 안 남겼다", 남은 === 0, `${남은}줄`);

const 코드만 = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const 쓰는곳 = readdirSync("lib").filter((f) => f.endsWith(".js") && f !== "day.js")
  .filter((f) => /(insert\s+into|update|delete\s+from)\s+v2\.day_area_memo\b/i.test(코드만(readFileSync(`lib/${f}`, "utf8"))));
ok("영역 메모를 쓰는 곳은 lib/day.js 뿐이다", 쓰는곳.length === 0, 쓰는곳.join(" "));

console.log(`\n■ 영역 메모 검사 ${n}건 · 실패 ${bad}`);
await c.end(); process.exit(bad ? 1 : 0);
