/** 파기 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  계획 자동 검사 ⑨ 파기 목록 표에 없는 자리가 없는가
 *       검증 6-a  fixture 로 도는 파기 리허설 (⚠️ 이 검사는 `public` 을 한 번도 안 본다)
 *       대전제 6  지우지 않는다 — 파기는 **비식별화**다
 *
 *  ⚠️ 앞부분은 **가짜 DB** 로 돈다 (진짜 DB 를 안 건드린다).
 *     뒷부분은 진짜 DB 를 **읽기만** 한다 — insert/update/delete 를 한 줄도 안 쓴다.
 */
import { expireGate, readExpireGate,
  planFor, purgeStudent, purgeFiles, filesDueSql, beatsKeep, maskExpr, residue, stampGate,
  coverageGaps, handWork, columnFacts, purgeMap, isExpire, REACH, SHAPED, MASK_CHAR,
} from "../lib/purge.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };
const note = (t) => console.log(`   ⚠️ ${t}`);

const STU = "00000000-0000-4000-9000-000000000001";

// 파기 목록 표 흉내 — 진짜 목록의 모양을 그대로 쓴다
const MAP = [
  { schema_name: "v2",     tbl: "students", col: "name",      how: "mask" },
  { schema_name: "v2",     tbl: "profiles", col: "name",      how: "mask" },
  { schema_name: "v2",     tbl: "profiles", col: "phone",     how: "null" },
  { schema_name: "v2",     tbl: "profiles", col: "login_id",  how: "mask" },
  { schema_name: "v2",     tbl: "day_item", col: "memo",      how: "null" },
  { schema_name: "v2",     tbl: "score",    col: "note",      how: "null" },
  { schema_name: "v2",     tbl: "file",     col: "orig_name", how: "mask" },
  { schema_name: "v2",     tbl: "file",     col: "path",      how: "row"  },
  { schema_name: "v2",     tbl: "notice",   col: "body",      how: "null" },
  { schema_name: "public", tbl: "students", col: "name",      how: "mask" },  // ⚠️ v2 밖
];
const C = (notNull = false, unique = false, checked = false) => ({ notNull, unique, checked });
const FACTS = {
  col: {
    "students.name": C(), "profiles.name": C(), "profiles.phone": C(),
    "profiles.login_id": C(false, true, true),          // ⚠️ 모양 제약이 걸린 칸
    "day_item.memo": C(), "score.note": C(), "notice.body": C(),
    "file.orig_name": C(true), "file.path": C(true, true),
  },
  table: { file: { state: true, id: true }, students: { state: true, id: true },
           profiles: { state: true, id: true } },
};

// 가짜 DB — 무엇이 실제로 돌았는지 센다
function fakeDb({ siblings = [], noCount = false } = {}) {
  const seen = [];
  return { seen, async query(sql, p) {
    seen.push({ sql, p });
    if (sql.includes("join v2.parent_student")) return { rows: siblings, rowCount: siblings.length };
    if (sql.includes("from v2.students where id")) return { rows: [{ profile_id: "pf-s" }], rowCount: 1 };
    if (sql.includes("from v2.parent_student")) return { rows: [{ parent_profile_id: "pf-mom" }], rowCount: 1 };
    if (sql.startsWith("select path from v2.file")) return { rows: [{ path: "h/1.jpg" }, { path: "h/2.jpg" }], rowCount: 2 };
    // ⚠️ 어댑터에 따라 「몇 줄 바뀌었나」를 안 주는 것이 있다 (supabase-js 가 그렇다)
    if (sql.startsWith("update v2.")) return noCount ? { rows: [] } : { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  } };
}
const OPTS = { map: MAP, facts: FACTS };
const ups = (db) => db.seen.filter((s) => s.sql.startsWith("update v2."));
const stepFor = (r, tbl, col) => r.ran.find((x) => x.tbl === tbl && x.col === col);
const sqlFor = (db, tbl, col) => ups(db).find((s) => s.sql.startsWith(`update v2.${tbl} `) && s.sql.includes(col))?.sql ?? "";

console.log("■ 파기 — 가짜 DB 에 끼워 실제로 돌린다");

const db1 = fakeDb();
const r1 = await purgeStudent(db1, STU, OPTS);

ok("목록의 닿는 칸을 하나도 안 빠뜨리고 돈다 (8칸)", r1.ran.length === 8, `${r1.ran.length}칸`);
ok("파기는 삭제가 아니다 — delete·drop 문이 한 개도 없다",
   db1.seen.every((s) => !/^\s*(delete|drop|truncate)\b/i.test(s.sql)));
ok("줄과 숫자는 남는다 — 점수·금액·상태를 건드리는 문장이 없다",
   ups(db1).every((s) => !/set\s+(raw|amount|full_score|status|attend)\s*=/.test(s.sql)));
ok("이름은 가린다 (mask)", sqlFor(db1, "students", "name").includes(`repeat('${MASK_CHAR}'`),
   sqlFor(db1, "students", "name"));
ok("전화는 비운다 (null)", /set phone = null/.test(sqlFor(db1, "profiles", "phone")));
ok("⚠️ 모양 제약이 걸린 아이디는 **가리지 않고 비운다** (가리면 UPDATE 가 터져 파기가 중간에 멈춘다)",
   stepFor(r1, "profiles", "login_id")?.as === "null"
   && !sqlFor(db1, "profiles", "login_id").includes(MASK_CHAR),
   JSON.stringify(stepFor(r1, "profiles", "login_id")));
// ⚠️ 도장(`v2_masked_at is null`)도 **같은 뜻의 자물쇠**다 — 이미 찍힌 줄은 안 건드린다.
//    그래야 두 번 돌려도 **첫 파기일이 안 바뀐다.** 안 넣으면 다시 돌릴 때마다 날짜가 바뀐다
ok("안 지운 줄은 안 건드린다 — 모든 문장에 `is not null` · `state <> 'purged'` · `v2_masked_at is null` 중 하나가 붙는다",
   ups(db1).every((s) => /is not null|state <> 'purged'|v2_masked_at is null/.test(s.sql)),
   ups(db1).filter((s) => !/is not null|state <> 'purged'|v2_masked_at is null/.test(s.sql)).map((s) => s.sql).join(" | "));

console.log("\n■ 남의 아이 · 남의 집을 안 건드리는가");
ok("학생으로 닿는 문장은 그 아이만 겨눈다",
   ups(db1).filter((s) => s.sql.includes("student_id = $1")).every((s) => s.p[0] === STU));
ok("그날 판 조각은 sheet 를 타고 그 아이에게만 닿는다",
   REACH.day_item.by === "sheet" && REACH.late_stay.by === "sheet");

const held = fakeDb({ siblings: [{ id: "sib", name: "동생", state: "active" }] });
const rh = await purgeStudent(held, STU, OPTS);
ok("⚠️ 형제가 재원 중이면 학부모 계정은 못 지운다",
   rh.parents[0].held === true && !(sqlFor(held, "profiles", "name") &&
     ups(held).find((s) => s.sql.startsWith("update v2.profiles"))?.p[0]?.includes("pf-mom")),
   JSON.stringify(ups(held).find((s) => s.sql.startsWith("update v2.profiles"))?.p[0]));
ok("그때도 아이 본인 줄은 지운다",
   ups(held).find((s) => s.sql.startsWith("update v2.profiles"))?.p[0]?.includes("pf-s"));
ok("형제가 다 퇴원했으면 학부모 계정도 지운다",
   ups(db1).find((s) => s.sql.startsWith("update v2.profiles"))?.p[0]?.includes("pf-mom"),
   JSON.stringify(ups(db1).find((s) => s.sql.startsWith("update v2.profiles"))?.p[0]));

console.log("\n■ 조용히 건너뛰지 않는가");
ok("학생으로 안 닿는 표는 notReached 로 내놓는다 (공지)",
   r1.notReached.some((x) => x.tbl === "notice"), JSON.stringify(r1.notReached.map((x) => x.tbl)));
ok("⚠️ v2 밖(public)은 문장을 안 만들고 outside 로 내놓는다",
   r1.outside.length === 1 && ups(db1).every((s) => !s.sql.includes("public.")),
   JSON.stringify(r1.outside));
ok("닿는 길이 없는 표는 blocked 로 세운다 (조용히 안 넘어간다)",
   planFor({ map: [{ tbl: "짓지도않은표", col: "name", how: "mask" }], facts: FACTS,
             target: { kind: "student", studentId: STU, profileIds: [] } }).blocked.length === 1);
ok("not null 인 칸에 null 을 넣으라 하면 안 돌고 세운다",
   (() => { const p = planFor({ map: [{ tbl: "score", col: "note", how: "null" }],
     facts: { col: { "score.note": C(true) }, table: {} },
     target: { kind: "student", studentId: STU, profileIds: [] } });
     return p.steps.length === 0 && p.blocked.length === 1; })());
ok("⚠️ 어댑터가 rowCount 를 안 주면 터진다 (막혔는데 「성공」이라 말하지 않는다)",
   await (async () => { try { await purgeStudent(fakeDb({ noCount: true }), STU, OPTS); return false; }
                        catch (e) { return /rowCount/.test(String(e.message)); } })());

console.log("\n■ 파일 — v2 밖을 안 건드리는가");
ok("Storage 는 안 건드리고 **경로 목록만** 낸다",
   r1.storagePaths.join(",") === "h/1.jpg,h/2.jpg"
   && db1.seen.every((s) => !/storage\./i.test(s.sql)), JSON.stringify(r1.storagePaths));
ok("⚠️ 경로를 **덮기 전에** 읽는다 (덮은 뒤엔 진짜 파일을 영영 못 찾는다)",
   db1.seen.findIndex((s) => s.sql.startsWith("select path from v2.file"))
   < db1.seen.findIndex((s) => s.sql.includes("update v2.file set state = 'purged'")));
ok("줄 내리기는 맨 뒤에 돈다", r1.ran[r1.ran.length - 1].how === "row", r1.ran.at(-1)?.how);
ok("줄은 지우지 않고 state='purged' 로 내린다",
   /set state = 'purged'/.test(sqlFor(db1, "file", "path")));
ok("겹치면 안 되는 path 는 비우지 않고 무덤값으로 덮는다 (비우면 unique 가 터진다)",
   /path = 'purged:' \|\| id::text/.test(sqlFor(db1, "file", "path")));
ok("⚠️ 자료함 묶음에 붙은 파일은 줄을 안 내린다 (다른 아이도 본다)",
   sqlFor(db1, "file", "path").includes("select file_id from v2.file_link where bin_id is not null"));

console.log("\n■ 파일 정리는 자동이 기본이다");
const dbf = fakeDb();
const rf = await purgeFiles(dbf, "2026-09-02",
  { ...OPTS, due: [{ id: "f1", path: "h/1.jpg" }, { id: "f2", path: "h/2.jpg" }] });
ok("승인 단추 없이 그냥 돈다 (인자에 승인이 없다)", rf.ran.length === 2 && rf.due === 2,
   JSON.stringify(rf.ran.map((x) => x.col)));
ok("파일 정리는 그 파일들만 겨눈다",
   ups(dbf).every((s) => s.sql.includes("id = any($1)") && s.p[0].join(",") === "f1,f2"));
ok("lib/purge.js 안에 승인 단추가 없다",
   !/approve|승인/.test(readFileSync("lib/purge.js", "utf8").replace(/승인 단추를 만들지 마라[\s\S]*?없다\./g, "")
     .replace(/승인 인자가 없다/g, "")));
ok("⚠️ 파기가 보관을 이긴다 — 「남겨 둘래요」가 남아 있어도 파기 예정일이 오면 지운다",
   beatsKeep({ purgeOn: "2026-09-01", keepUntil: "2027-01-01", today: "2026-09-02" }) === true);
ok("보관 기한 안이면 안 지운다",
   beatsKeep({ purgeOn: null, keepUntil: "2027-01-01", today: "2026-09-02" }) === false);
ok("고른 문장의 where 에 keep_until 이 없다 (넣으면 보관이 파기를 이긴다)",
   !/keep_until/.test(filesDueSql()) && /purge_on <= \$1/.test(filesDueSql()));

console.log("\n■ 손으로 하는 자리 — 목록으로 나오는가");
const hw = handWork(MAP).map((h) => h.where).join(" | ");
for (const w of ["auth.users", "Storage 버킷", "옛 public 스키마", "바깥 단어 서비스 원본 3표", "public.students"])
  ok(`「${w}」 가 목록에 있다`, hw.includes(w), hw);

console.log("\n■ 목록 대 닿는 길 — 진짜 DB 를 **읽기만** 한다");
let c = null;
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; }
    catch (e) { if (i >= 3) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
} catch (e) { c = null; ok("DB 에 붙는다 (못 붙으면 목록 정합성을 **확인 못 한 것**이다)", false, String(e.message)); }

if (c) {
  /* ══ ⚠️⚠️ 목록은 **`purgeMap()` 을 불러서** 받는다 — 제 SQL 로 읽지 않는다. ══════════════
   * 2026-09-03 까지 이 자리는 제 select 를 썼고 거기엔 `after_days` 가 있었다.
   * 그래서 **이 검사는 날마다 초록**인데 `lib/purge.js` 의 `purgeMap()` 은 그 칸을 안 물어,
   * 진짜 크론에서는 expire 두 줄이 「기한이 없다」로 막혀 **밤 8시마다 터졌다**(어긋난곳 ⑲).
   * ⚠️ 검사가 제 SQL 로 읽으면 **lib 이 무엇을 안 읽는지 원리적으로 못 본다** —
   *    오늘 같은 사고를 영영 못 잡는다. 부르는 함수를 그대로 부르는 것이 요점이다.
   * ⚠️ `c` 는 pg Client 라 `{query}` 를 이미 갖췄지만, 어댑터 모양을 분명히 하려고 감싼다.
   * ══════════════════════════════════════════════════════════════════════════════════ */
  const db = { query: (sql, p = []) => c.query(sql, p) };
  const map = await purgeMap(db);
  const v2rows = map.filter((r) => r.schema_name === "v2");
  const gaps = coverageGaps(map);
  ok(`파기 목록의 v2 줄 ${v2rows.length}개가 전부 닿는 길을 갖는다`,
     gaps.noReach.length === 0, gaps.noReach.join(" "));
  ok("닿는 길 표에 죽은 줄이 없다 (목록에 없는 표를 겨누지 않는다)",
     gaps.dead.length === 0, gaps.dead.join(" "));

  const facts = await columnFacts(c);
  const missing = v2rows.filter((r) => !facts.col[`${r.tbl}.${r.col}`]);
  ok("목록이 가리키는 칸이 진짜로 있다", missing.length === 0,
     missing.map((r) => `${r.tbl}.${r.col}`).join(" "));

  // 가리기 식을 **진짜 DB 에서 평가한다** (SELECT 뿐 — 아무것도 안 바꾼다)
  const got = (await c.query(`select ${maskExpr("$1::text")} v`, ["최윤정"])).rows[0].v;
  ok("가리기 식을 진짜 DB 에서 돌려 본다 — 「최윤정」 → 「최○○」", got === `최${MASK_CHAR}${MASK_CHAR}`, got);

  const shapedReal = v2rows.filter((r) => ["mask", "blank"].includes(r.how)
    && facts.col[`${r.tbl}.${r.col}`]?.checked).map((r) => `${r.tbl}.${r.col}`);
  ok("⚠️ 제약이 걸린 칸을 가리려 드는 자리가 없다 (있으면 그 UPDATE 에서 파기가 멈춘다)",
     (() => { const p = planFor({ map: v2rows, facts,
        target: { kind: "student", studentId: STU, profileIds: [] } });
       return shapedReal.every((k) => !p.steps.some((s) => `${s.tbl}.${s.col}` === k && s.as === "mask")); })(),
     shapedReal.join(" "));
  ok("SHAPED 바닥값이 진짜 제약과 안 어긋난다",
     [...SHAPED].every((k) => facts.col[k]?.checked === true), [...SHAPED].join(" "));

  const plan = planFor({ map, facts, target: { kind: "student", studentId: STU, profileIds: [] } });
  ok("진짜 목록으로 계획을 세워도 막히는 자리가 없다", plan.blocked.length === 0,
     plan.blocked.map((b) => `${b.tbl}.${b.col}(${b.why})`).join(" · "));

  /* ══ 날짜로 지우는 갈래(kind=expire) — **크론이 밤마다 도는 바로 그 길** ═══════════════
   * ⚠️ 위 `kind: "student"` 만 봐서는 부족하다. 사람 파기 계획에서는 expire 줄이
   *    `expired` 로 빠져나가 `steps` 에 안 실리므로, 기한이 null 이어도 **막힘으로만** 남고
   *    사람 파기는 멀쩡히 돈다. 크론만 터진다 — 그 자리를 여기서 따로 문다.
   * ⚠️ 안 하면 무엇이 터지나 — `purgeMap()` 이 다시 `after_days` 를 빠뜨려도
   *    이 검사가 초록이고, 밤 8시 크론만 날마다 조용히 운다(어긋난곳 ⑲ 그대로).       */
  const 기한줄 = map.filter(isExpire);
  ok("파기 목록에 날짜로 지우는 줄이 있다 (0줄이면 아래 단언이 헛통과한다)",
     기한줄.length > 0, `${기한줄.length}줄`);
  ok("⚠️⚠️ purgeMap() 이 **기한(after_days)을 실어 온다** — 빠지면 크론이 날마다 터진다",
     기한줄.every((m) => m.after_days != null),
     기한줄.map((m) => `${m.tbl}.${m.col}=${m.after_days}`).join(" · "));
  const 기한계획 = planFor({ map, facts, target: { kind: "expire" } });
  ok("⚠️⚠️ kind=expire 로 계획해도 **막힌 자리가 0** 이다 (크론의 「기한파기」가 도는 조건)",
     기한계획.blocked.length === 0,
     기한계획.blocked.map((b) => `${b.tbl}.${b.col}(${b.why})`).join(" · "));
  ok("기한 파기 문장이 목록 줄 수만큼 만들어진다",
     기한계획.expired.length === 기한줄.length,
     `${기한계획.expired.length} ≠ ${기한줄.length}`);
  // ⚠️ 만들어진 문장을 **진짜 DB 에 PREPARE 해 본다** — 표·칸 이름이 실행할 때 정해져
  //    `scripts/check-sql.mjs` 가 「못 물어봄」으로 건너뛴 자리다 (돌려 보지는 않는다)
  for (const s of 기한계획.expired) {
    let e = null;
    try { await c.query(`prepare zz_expire_chk as ${s.sql}`); await c.query("deallocate zz_expire_chk"); }
    catch (err) { e = err; await c.query("deallocate all").catch(() => {}); }
    ok(`기한파기 문장이 진짜 스키마에 선다 — ${s.tbl}.${s.col} (${s.afterDays}일)`, !e, String(e?.message).split("\n")[0]);
  }

  console.log("\n   — 검사가 아니라 **알림** (고칠 사람이 봐야 하는 것) —");
  note(`학생으로 안 닿아 **나이로 돌아야 하는데 기한이 없는** 자리 ${plan.notReached.length}칸: `
     + plan.notReached.map((x) => `${x.tbl}.${x.col}`).join(" "));
  const pub = map.filter((r) => r.schema_name !== "v2");
  note(`파기 목록의 public 줄 ${pub.length}개 — 0 이면 **검증 6-b(D+30 두 벌 확인)를 못 돈다**`);
  note("이 검사는 v2 만 본다 — **`public` 을 한 번도 안 봤다.** 이 초록을 DB 전체로 읽으면 안 된다 (검증 6-a 함정)");
  await c.end();
}

console.log("\n■ 파기가 한 벌인가 — 앱 파일을 훑는다");
// ⚠️ **화면(app/)이나 다른 lib 이 스스로 지우기 시작하면 언젠가 한 곳이 빠진다.**
//    빠진 자리는 오류를 안 내므로 아무도 모른 채 이름이 남는다. 검사는 앱만 본다 —
//    scripts/ 의 다른 검사는 목록을 **읽어 보기만** 하므로 여기 걸리면 안 된다.
const walk = (d, out = []) => { for (const f of readdirSync(d)) {
  if (["node_modules", ".next", ".git", "backup", "_tmp", "sandbox"].includes(f)) continue;
  const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
    : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
const MINE = (f) => f.endsWith("lib/purge.js");
const app = [...walk("app"), ...walk("lib")].filter((f) => !MINE(f));
const purgers = app.filter((f) => /state\s*=\s*['"]purged['"]/.test(readFileSync(f, "utf8")));
ok("state='purged' 로 내리는 곳이 lib/purge.js 뿐이다", purgers.length === 0, purgers.join(" "));
const readers = app.filter((f) => /purge_map/.test(readFileSync(f, "utf8")));
ok("파기 목록 표를 읽는 곳도 lib/purge.js 뿐이다", readers.length === 0, readers.join(" "));
// ⚠️ `○` 글자 자체는 진도 표시(○△✕)에도 쓴다 — **가리는 식**만 겨눈다
const maskers = app.filter((f) => new RegExp(`repeat\\('${MASK_CHAR}'`).test(readFileSync(f, "utf8")));
ok("이름을 가리는 식이 lib/purge.js 뿐이다", maskers.length === 0, maskers.join(" "));

/* ══ 「파기한 날」 도장 (처음-3 · 0080) ═══════════════════════════════════
 * ⚠️ **진짜 DB 로, 트랜잭션 안에서 돌고 되돌린다.** 가짜 DB 로는 「이름이 진짜로 남았나」를
 *    원리적으로 못 본다 — 그게 이 도장이 지키는 바로 그것이다.
 * ⚠️ 각 단언은 **일부러 어겨 보고 빨개지는 것**을 확인한 것만 남긴다(폰-5).            */
{
  const url2 = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const rc = new Client({ connectionString: url2, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await rc.connect();
  const rdb = { query: (q, p) => rc.query(q, p) };
  console.log("\n■ 「파기한 날」 도장 — 진짜 DB");
  await rc.query("begin");
  try {
    const st = (await rc.query(`select id, name from v2.students where import_batch = 'fixture' limit 1`)).rows[0];
    ok("리허설 학생을 찾았다 (진짜 아이를 안 건드린다)", !!st);

    // ① 가리기 전에는 이름이 실제로 남아 있다 — 훑기가 **정말 훑는지**부터 본다
    const 전 = await residue(rdb, st.name);
    ok("⚠️ 훑기가 **진짜로 훑는다** — 가리기 전에는 이름이 나온다",
       전.length > 0, "0자리면 훑기가 아무것도 안 보고 있다는 뜻이라 게이트가 늘 열린다");

    // ② 파기 → 도장
    const r = await purgeStudent(rdb, st.id);
    ok("파기가 돌았다 (문장 " + r.ran.length + "개)", r.ran.length > 0);
    ok("⚠️ 가린 뒤에는 이름이 **한 자리도 안 남는다**", r.residue.length === 0, JSON.stringify(r.residue));
    // ⚠️ 게이트는 **남의 표 사정으로 이 아이 파기일이 비면 안 된다**는 규칙을 지킨다.
    //    날짜로 지우는 줄(expire)이 막혀도 도장은 찍혀야 한다 — `stampGate` 가 `isExpire` 를 걸러 낸다.
    //    (2026-09-03 `purgeMap()` 이 기한을 실어 오게 고친 뒤로 이 자리 막힘은 **0개**다.
    //     그래도 단언은 남긴다 — 언젠가 expire 줄 하나가 다시 막혀도 아이 도장이 같이 막히면 안 된다.)
    ok("⚠️⚠️ 날짜로 지우는 줄(expire)이 막혀도 **도장은 찍힌다**",
       r.gate.ok === true && r.stamped !== null,
       `막힘 ${r.blocked.length}개 · 게이트 ${JSON.stringify(r.gate.why)} — 남의 표 사정으로 이 아이 파기일이 비면 안 된다`);
    ok("사람 파기 계획에 expire 줄이 안 섞인다 (남의 되돌리기 자료를 같이 날리지 않는다)",
       !r.ran.some((s) => s.tbl === "excel_row" || s.tbl === "excel_run"),
       JSON.stringify(r.ran.map((s) => `${s.tbl}.${s.col}`)));
    ok("학생과 학부모 둘 다 찍혔다", (r.stamped?.students ?? 0) === 1 && (r.stamped?.profiles ?? 0) >= 1,
       JSON.stringify(r.stamped));

    // ③ 두 번 돌려도 **첫 파기일**이 진실이다
    const 첫 = (await rc.query(`select v2_masked_at a from v2.students where id = $1`, [st.id])).rows[0].a;
    const r2 = await purgeStudent(rdb, st.id);
    const 둘 = (await rc.query(`select v2_masked_at a from v2.students where id = $1`, [st.id])).rows[0].a;
    ok("⚠️ 두 번 돌려도 **첫 파기일이 안 바뀐다**",
       String(첫) === String(둘) && (r2.stamped?.students ?? 0) === 0,
       `${첫} → ${둘} · 두 번째가 고친 줄 ${r2.stamped?.students}`);
    await rc.query("rollback"); await rc.query("begin");

    // ④ ⚠️⚠️ **이름이 남아 있으면 안 찍는다** — 목록에 없는 칸에 일부러 심는다
    const st2 = (await rc.query(`select id, name from v2.students where import_batch = 'fixture' limit 1`)).rows[0];
    const one = (await rc.query(`select id from v2.todo limit 1`)).rows[0];
    await rc.query(`update v2.todo set title = $1 where id = $2`, [st2.name + " 프린트", one.id]);
    const r3 = await purgeStudent(rdb, st2.id);
    ok("⚠️⚠️ 이름이 남아 있으면 **도장을 안 찍는다** (반쪽 파기에 「파기함」은 거짓말이다)",
       r3.stamped === null && r3.gate.ok === false, JSON.stringify(r3.gate));
    ok("못 찍은 **까닭을 말한다** — 조용히 넘어가지 않는다",
       r3.gate.why.some((w) => /이름이 남았다/.test(w)) && r3.residue.some((x) => x.tbl === "todo"),
       JSON.stringify(r3.gate.why));
  } finally {
    await rc.query("rollback").catch(() => {});
    // ⚠️ 되돌렸는지 **믿지 말고 센다** — 앞서 시험이 진짜 DB 에 흔적을 남긴 적이 있다
    const 남 = (await rc.query(`select count(*)::int n from v2.students where v2_masked_at is not null`)).rows[0].n;
    ok("⚠️ 검사가 흔적을 안 남겼다 (도장 찍힌 학생 0명)", 남 === 0, `${남}명`);
    await rc.end();
  }
}

/* ══ 기한 파기 스위치 — **원장님이 켜기 전에는 한 줄도 안 지운다** (0087) ════════════
 * ⚠️ 원장님 답은 **조건부 승낙**이었다: 「백업 따로 만들면 지워」. 백업을 못 지었으므로
 *    조건이 안 채워졌고, 그러면 안 지운다. 이 스위치를 **기본 켜짐으로 바꾸면 빨개진다.**  */
console.log("\n■ 기한 파기 스위치 (0087 — 원장님 조건이 아직 안 채워졌다)");
ok("⚠️⚠️ 값이 없으면 **꺼진 것으로 본다** — 지어내서 켜지 않는다", expireGate(null).on === false);
ok("⚠️ 글자 'true' 로는 안 켜진다 (참 하나만 켠다)", expireGate({ expire_on: "true" }).on === false);
ok("켜면 켜진다", expireGate({ expire_on: true }).on === true);
ok("꺼졌을 때 **왜 꺼졌는지**를 말한다 (원장님이 「고장」으로 안 읽으시게)",
   /백업/.test(expireGate(null).why ?? ""));
{
  const cronSrc = readFileSync("app/api/cron/route.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("⚠️ 크론의 기한파기 걸음이 **그 스위치를 지난다**",
     /readExpireGate\s*\(/.test(cronSrc) && /gate\.on/.test(cronSrc));
  ok("⚠️ 꺼졌다고 **던지지 않는다** — 「고장」과 「안 켜심」은 다른 일이다",
     /if\s*\(!gate\.on\)\s*return/.test(cronSrc));
}
{
  const url2 = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const { Client: C2 } = await import("pg");
  const c2 = new C2({ connectionString: url2, ssl: { rejectUnauthorized: false } });
  await c2.connect();
  const g = await readExpireGate({ query: (q, p) => c2.query(q, p) });
  ok("⚠️ **진짜 DB 에서도 꺼져 있다** — 배포되어도 한 줄도 안 지운다", g.on === false, JSON.stringify(g.on));
  await c2.end();
}

console.log(`\n■ 파기 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
