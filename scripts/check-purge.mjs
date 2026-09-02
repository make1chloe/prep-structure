/** 파기 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  계획 자동 검사 ⑨ 파기 목록 표에 없는 자리가 없는가
 *       검증 6-a  fixture 로 도는 파기 리허설 (⚠️ 이 검사는 `public` 을 한 번도 안 본다)
 *       대전제 6  지우지 않는다 — 파기는 **비식별화**다
 *
 *  ⚠️ 앞부분은 **가짜 DB** 로 돈다 (진짜 DB 를 안 건드린다).
 *     뒷부분은 진짜 DB 를 **읽기만** 한다 — insert/update/delete 를 한 줄도 안 쓴다.
 */
import {
  planFor, purgeStudent, purgeFiles, filesDueSql, beatsKeep, maskExpr,
  coverageGaps, handWork, columnFacts, REACH, SHAPED, MASK_CHAR,
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
ok("안 지운 줄은 안 건드린다 — 모든 문장에 `is not null` 이나 `state <> 'purged'` 가 붙는다",
   ups(db1).every((s) => /is not null|state <> 'purged'/.test(s.sql)));

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
  const map = (await c.query(`select schema_name, tbl, col, how, after_days, note from v2.purge_map order by tbl, col`)).rows;
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

console.log(`\n■ 파기 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
