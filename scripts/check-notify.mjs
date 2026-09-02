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
  if (["node_modules",".next",".git","backup"].includes(f)) continue;
  const p=join(d,f); statSync(p).isDirectory() ? walk(p,out)
    : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
const files = walk(".");
const pushers = files.filter(f => !f.endsWith("lib/notify.js") && !f.includes("check-notify")
  && /require\(["']web-push|from ["']web-push|webpush\.send|sendNotification\(/.test(readFileSync(f,"utf8")));
ok("web-push 를 lib/notify.js 밖에서 부르지 않는다", pushers.length===0, pushers.join(" "));
const sinkers = files.filter(f => !f.endsWith("lib/notify.js") && !f.includes("check-notify")
  && /NOTIFY_SINK/.test(readFileSync(f,"utf8")));
ok("NOTIFY_SINK 를 읽는 곳도 lib/notify.js 뿐이다", sinkers.length===0, sinkers.join(" "));

console.log(`\n■ 발송 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
