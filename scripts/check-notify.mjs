/** 발송 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  계획 자동 검사 ① 밖으로 나가는 길이 notify 한 곳을 지나는가
 *                ⑦ NOTIFY_SINK 를 안 보고 쏘는 자리가 없는가
 *                ⑤ 잠금화면에 내용이 안 실리는가 (서비스워커 계약서 ⑤) */
import { notify, sinkOf, findHole, pushPayload, OPEN_TO_SEE } from "../lib/notify.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0, n = 0;
const ok = (t, c, why="") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why?" — "+why:""}`); }
                               else console.log(`   ✅ ${t}`); };

// 가짜 DB — 실제로 무엇이 나갔는지 센다
function fakeDb() {
  const rows = []; let i = 0;
  return { rows, async query(sql, p) {
    if (sql.includes("insert into v2.notify_log")) { rows.push({ sql, p }); return { rows: [{ id: ++i }] }; }
    if (sql.includes("from v2.push_sub")) return { rows: [{ endpoint: "e1", p256dh: "a", auth: "b" }] };
    return { rows: [] };
  } };
}

const T = (role="parent") => [{ profileId:"p1", studentId:"s1", role }];

console.log("■ 발송 — 실제로 돌려 본다");
{ const db=fakeDb(); const shot=[];
  const r = await notify(db, {kind:"daily",title:"데일리",body:"단어 6/20",tag:"send-daily",targets:T()},
    { env:{}, push:(s,p)=>shot.push(p) });
  ok("환경변수가 없으면 한 발도 안 나간다", shot.length===0 && r.sink==="off"); }

{ const db=fakeDb(); const shot=[];
  await notify(db, {kind:"daily",title:"데일리",body:"x",targets:T("parent")},
    { env:{NOTIFY_SINK:"self"}, push:(s,p)=>shot.push(p) });
  ok("self 는 학부모에게 안 나간다", shot.length===0); }

{ const db=fakeDb(); const shot=[];
  await notify(db, {kind:"daily",title:"보강",body:"x",targets:T("staff")},
    { env:{NOTIFY_SINK:"self"}, push:(s,p)=>shot.push(p) });
  ok("self 는 선생님에게 나간다", shot.length===1); }

{ const db=fakeDb(); const shot=[];
  const r = await notify(db, {kind:"daily",title:"{{학생}} 리포트",body:"x",targets:T()},
    { env:{NOTIFY_SINK:"live"}, push:(s,p)=>shot.push(p) });
  ok("안 채운 치환 자리는 못 나간다", shot.length===0 && r.hole==="{{학생}}");
  ok("못 나간 것은 자취에도 안 남는다 (안 보낸 판으로 남는다)", db.rows.length===0); }

{ const db=fakeDb(); const shot=[];
  await notify(db, {kind:"daily",title:"데일리",body:"단어 6/20 · 태도 좋았어요",targets:T("parent")},
    { env:{NOTIFY_SINK:"live"}, push:(s,p)=>shot.push(p) });
  const got = JSON.parse(shot[0]);
  ok("잠금화면에 내용이 안 실린다", got.body===OPEN_TO_SEE, JSON.stringify(got.body));
  ok("옛 SW 가 읽는 다섯 칸이 다 있다",
     ["title","body","tag","url","r"].every(k=>k in got), Object.keys(got).join(",")); }

{ const db=fakeDb(); const shot=[];
  await notify(db, {kind:"daily",title:"t",body:"b",targets:[
    {profileId:"p1",studentId:"s1",role:"parent"},{profileId:"p1",studentId:"s2",role:"parent"}]},
    { env:{NOTIFY_SINK:"live"}, push:(s,p)=>shot.push(p) });
  // 형제 둘이면 **두 통이 맞다** (아이마다 다른 얘기). 사고는 tag 가 같아 뒤 통이 앞 통을 덮는 것
  const tags = shot.map(x=>JSON.parse(x).tag);
  ok("형제 둘이면 두 통이 간다", shot.length===2, `${shot.length}번`);
  ok("형제 두 통의 tag 가 다르다 (같으면 한 통이 덮인다)",
     new Set(tags).size===2, tags.join(" = ")); }

console.log("\n■ 나가는 길이 하나뿐인가 — 파일을 훑는다");
const walk = (d, out=[]) => { for (const f of readdirSync(d)) {
  if (["node_modules", ".next", ".git", "backup", "_tmp", "sandbox"].includes(f)) continue;
  const p=join(d,f); statSync(p).isDirectory() ? walk(p,out)
    : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
const files = walk(".");
/** ⚠️ **주석은 코드가 아니다.** 통째로 훑으면 「여기서 NOTIFY_SINK 를 읽으면 안 된다」고
 *  적어 둔 **경고 주석**이 위반으로 잡힌다 (실제로 app/send/actions.js 가 그렇게 걸렸다).
 *  그러면 담당자는 규칙을 지키는 대신 **경고를 지운다** — 검사가 문서를 갉아먹는 꼴이다.
 *  → 주석만 있는 줄은 뺀다. 코드 줄은 그대로 두므로 **진짜로 읽는 자리는 그대로 걸린다.** */
const codeOf = (f) => readFileSync(f, "utf8").split("\n")
  .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
// ⚠️ **실제로 쏘는 손은 `lib/push.js` 다** (2026-09-02 신설). `notify` 는 판단만 하고
//    `opts.push` 로 손을 받는다 — 그래서 web-push 를 부르는 **한 자리**는 그 파일이다.
//    두 자리가 되면 한쪽만 잠금화면 글을 갈아 끼우게 되므로 여기서 하나로 묶어 둔다.
const pushers = files.filter(f => !f.endsWith("lib/push.js") && !/check-(notify|push)\.mjs$/.test(f)
  && /require\(["']web-push|from ["']web-push|webpush\.send|sendNotification\(/.test(codeOf(f)));
ok("web-push 를 부르는 곳은 lib/push.js 하나뿐이다", pushers.length===0, pushers.join(" "));
// ⚠️ **검사는 앱이 아니다.** `scripts/check-push.mjs` 는 스위치를 켠 판을 진짜 DB 로 돌려 봐야 해서
//    가짜 env 에 이 이름을 쓴다. 앱 코드(`lib/`·`app/`)에서 읽는 곳은 여전히 notify 뿐이어야 한다.
const sinkers = files.filter(f => !f.endsWith("lib/notify.js") && !/check-(notify|push)\.mjs$/.test(f)
  && /NOTIFY_SINK/.test(codeOf(f)));
ok("NOTIFY_SINK 를 읽는 곳도 lib/notify.js 뿐이다", sinkers.length===0, sinkers.join(" "));

// ⚠️⚠️ **진짜 DB 로 한 번 돌린다.** 가짜 DB 는 제약이 없어서 원리적으로 못 잡는 사고가 있다 —
//    `notify_log.sent_at` 이 not null 이던 시절, 막힌 발송(off·self)이 **그 자리에서 터졌다.**
//    기본값이 off 이므로 **모든 발송이 실패했다.** 검사 11건은 전부 초록이었다.
console.log("\n■ 진짜 DB 로 — 막힌 발송이 자취를 남길 수 있나 (한 글자도 안 쓰고 되돌린다)");
try {
  const { Client } = await import("pg");
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const db = { query: (q, p) => c.query(q, p) };
  const who = (await c.query("select id from v2.profiles limit 1")).rows[0]?.id;
  await c.query("begin");
  const msg = { kind: "test", title: "검사", body: "내용", tag: "t",
                targets: [{ profileId: who, role: "parent" }] };
  for (const [label, env] of [["환경변수 없음(기본 off)", {}], ["self", { NOTIFY_SINK: "self" }],
                              ["live", { NOTIFY_SINK: "live" }]]) {
    let threw = null;
    try { await notify(db, msg, { env, push: async () => {} }); } catch (e) { threw = e.message.split("\n")[0]; }
    ok(`진짜 DB — ${label} 에서 발송이 **안 터진다**`, threw === null, threw ?? "");
  }
  const rows = (await c.query(
    "select sink, sent_at is null as blocked from v2.notify_log where kind = 'test' order by id")).rows;
  ok("막힌 것은 「안 보냄」으로 남는다 (off·self 는 sent_at 이 비어 있다)",
     rows.filter(r => r.sink !== "live").every(r => r.blocked), JSON.stringify(rows));
  ok("live 만 보낸 때가 찍힌다", rows.some(r => r.sink === "live" && !r.blocked));
  await c.query("rollback");
  await c.end();
} catch (e) {
  fail++; console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 발송 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
