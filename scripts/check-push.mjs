/** 발송 손 검사 — **글자로 훑지 않고 실제로 쏴 본다** (가짜 손으로).
 *
 *  이 검사가 막는 사고 넷:
 *   ① **빈 손** — 자취에는 「보냄」이 남고 폰에는 아무것도 안 간다
 *   ② **열쇠가 없는데 그냥 통과** — 그날 저녁 23통이 조용히 사라진다
 *   ③ **죽은 구독(410)을 안 끈다** — 죽은 기기에 영원히 쏘고 실패 자취만 쌓인다.
 *      거꾸로 **잠깐 탈(500)에 껐다가는** 멀쩡한 학부모 폰이 영영 죽는다
 *   ④ **거짓 도장** — 안 나갔는데 `late_stay.sent_at` 을 찍으면 마감이 안 묻고
 *      학부모는 모른 채 기다린다
 *
 *  ⚠️ **기본값은 「아무것도 안 나감」이다.** 그래서 이 검사도 그렇게 돌아야 한다 —
 *     스위치를 켜는 것은 **가짜 env** 로만 하고, 쏘는 손도 **가짜**다.
 *     진짜 web-push 는 이 검사에서 한 번도 안 불린다 (진짜로 불리면 학부모 폰이 울린다).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import webpush from "web-push";
import {
  makePush, pushReady, vapidFrom, isGone, outcome, hhmm, lateBody,
  sendLate, sendDaily, TTL_SEC,
} from "../lib/push.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

// 진짜 열쇠 모양 (아무 데도 안 보낸다 — 서명만 만든다)
const KEY = webpush.generateVAPIDKeys();
const ENV = { VAPID_SUBJECT: "mailto:x@example.com",
              VAPID_PUBLIC_KEY: KEY.publicKey, VAPID_PRIVATE_KEY: KEY.privateKey };
const gone = (code) => Object.assign(new Error("죽은 구독"), { statusCode: code });
const SUB = { endpoint: "https://push.example/abc", p256dh: "p", auth: "a" };

/** 가짜 DB — 무엇을 물었고 무엇을 껐는지 센다 */
function fakeDb(extra = {}) {
  const asked = [];
  return { asked, async query(sql, p) {
    asked.push({ sql: String(sql).replace(/\s+/g, " ").trim(), p });
    for (const [re, rows] of Object.entries(extra)) if (String(sql).includes(re)) return { rows: rows(p) };
    if (String(sql).includes("insert into v2.notify_log")) return { rows: [{ id: 1 }] };
    if (String(sql).includes("from v2.push_sub")) return { rows: [SUB] };
    return { rows: [] };
  } };
}

// ─────────────────────────────────────────────────────────────
console.log("■ 열쇠 — 없으면 어떻게 하나");
ok("열쇠가 없으면 「못 쏜다」고 말한다", pushReady({}).ok === false && pushReady({}).why === "no_key");
ok("열쇠 모양이 틀리면 web-push 에게 물어 잡는다",
   pushReady({ ...ENV, VAPID_PUBLIC_KEY: "짧다" }).why === "bad_key",
   JSON.stringify(pushReady({ ...ENV, VAPID_PUBLIC_KEY: "짧다" })));
ok("열쇠가 다 있으면 통과한다", pushReady(ENV).ok === true, pushReady(ENV).msg);
ok("공개키 이름을 두 벌 다 받는다 (옛 앱 이름이 확인 안 됨)",
   vapidFrom({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "k" }).publicKey === "k");
ok("연락 자리가 없으면 배포 주소를 쓴다 (지어내지 않는다)",
   vapidFrom({ VERCEL_URL: "a.vercel.app" }).subject === "https://a.vercel.app");

{ // ⚠️ ② 「열쇠가 없으니 그냥 통과」가 제일 나쁘다 — 던져야 한다
  const db = fakeDb(); let threw = null;
  try { await makePush(db, { env: {}, send: async () => {} })(SUB, "{}"); }
  catch (e) { threw = e.message; }
  ok("열쇠가 없으면 **쏘는 척을 하지 않는다** (던진다)", threw !== null && /열쇠/.test(threw), String(threw)); }

console.log("\n■ 손 — 받은 글을 그대로 쏘나");
{ const db = fakeDb(); const shot = [];
  const payload = JSON.stringify({ title: "t", body: "앱에서 확인해주세요.", tag: "send-late-abc", url: "/parent", r: 7 });
  await makePush(db, { env: ENV, send: (s, p, o) => { shot.push({ s, p, o }); } })(SUB, payload);
  ok("보낸 글이 **한 글자도 안 바뀐다**", shot[0].p === payload, shot[0].p);
  ok("구독을 web-push 모양으로 넘긴다",
     shot[0].s.endpoint === SUB.endpoint && shot[0].s.keys.p256dh === "p" && shot[0].s.keys.auth === "a",
     JSON.stringify(shot[0].s));
  ok("열쇠와 살아 있는 시간을 같이 싣는다",
     shot[0].o.TTL === TTL_SEC && shot[0].o.vapidDetails.publicKey === KEY.publicKey);
  ok("쏘기만 하고 DB 는 안 건드린다", db.asked.length === 0, JSON.stringify(db.asked)); }

console.log("\n■ 죽은 구독 — 끄나 (그리고 잠깐 탈에는 안 끄나)");
for (const code of [410, 404]) {
  const db = fakeDb(); let threw = null;
  try { await makePush(db, { env: ENV, send: async () => { throw gone(code); } })(SUB, "{}"); }
  catch (e) { threw = e.message; }
  const upd = db.asked.find((a) => /update v2\.push_sub set revoked_at/.test(a.sql));
  ok(`${code} 이면 **그 기기를 끈다** (revoked_at)`, Boolean(upd) && upd.p[0] === SUB.endpoint,
     JSON.stringify(db.asked));
  ok(`${code} 이라도 **실패로 올린다** (자취에 까닭이 남아야 한다)`, threw !== null && threw.includes(String(code)), String(threw));
}
for (const code of [500, 429, 408]) {
  const db = fakeDb(); let threw = null;
  try { await makePush(db, { env: ENV, send: async () => { throw gone(code); } })(SUB, "{}"); }
  catch (e) { threw = e; }
  ok(`${code}(잠깐 탈) 에는 **절대 안 끈다** — 끄면 멀쩡한 폰이 영영 죽는다`,
     !db.asked.some((a) => /revoked_at/.test(a.sql)), JSON.stringify(db.asked));
  ok(`${code} 은 오류를 그대로 올린다`, threw?.statusCode === code);
}
{ // 진짜 web-push 오류 클래스로도 잡히나
  const e = new webpush.WebPushError("gone", 410, {}, "", SUB.endpoint);
  ok("web-push 가 진짜로 던지는 오류(WebPushError)도 죽은 구독으로 읽는다", isGone(e) === true); }
{ const db = fakeDb(); let threw = null;
  const bad = { query: async (sql) => { if (/revoked_at/.test(sql)) throw new Error("권한 없음"); return { rows: [] }; } };
  try { await makePush(bad, { env: ENV, send: async () => { throw gone(410); } })(SUB, "{}"); }
  catch (e) { threw = e.message; }
  ok("끄다 실패해도 **원래 까닭을 안 잃는다**", /410/.test(String(threw)) && /못 껐다/.test(String(threw)), String(threw)); }

console.log("\n■ 정말 나갔나 — 「보냄」 도장을 찍어도 되는 자리");
const R = (o) => ({ sink: "live", sent: 0, hole: null, log: [], devices: 1, parents: 1, ...o });
ok("한 대라도 나갔으면 보냄", outcome(R({ sent: 1, log: [{ blocked: false }] })).ok === true);
ok("안 채운 자리가 있으면 안 보냄", outcome(R({ hole: "{{학생}}" })).why === "hole");
ok("학부모 계정이 없으면 안 보냄", outcome(R({ parents: 0 })).why === "no_parent");
ok("발송이 꺼져 있으면 **보냄이 아니다**",
   outcome(R({ sink: "off", log: [{ blocked: true }] })).ok === false &&
   outcome(R({ sink: "off", log: [{ blocked: true }] })).why === "sink_off");
ok("원장 기기에만 나가는 판도 **학부모에게는 안 간 것**",
   outcome(R({ sink: "self", log: [{ blocked: true }] })).why === "blocked_self");
ok("등록된 기기가 없으면 안 간 것", outcome(R({ devices: 0, log: [{ blocked: false }] })).why === "no_device");
ok("다 실패하면 안 간 것", outcome(R({ devices: 2, log: [{ blocked: false }] })).why === "all_failed");

console.log("\n■ 늦귀가·리포트 — 문");
ok("시각을 21:00 으로 다듬는다", hhmm("21:00:00") === "21:00" && hhmm(null) === "");
ok("사유가 없어도 글이 선다", lateBody({ until_at: "21:30:00" }) === "오늘 남아서 하고 갑니다. · 예상 귀가 21:30",
   lateBody({ until_at: "21:30:00" }));

const LATE = { id: "L1", sheet_id: "S1", reason: "재시험 남음", until_at: "21:00:00", sent_at: null,
               student_id: "ST1", date: "2026-09-02", student_name: "아무개" };
const dbFor = (late, sheet) => fakeDb({
  "from v2.late_stay l": () => (late ? [late] : []),
  "from v2.day_sheet s": () => (sheet ? [sheet] : []),
  "from v2.parent_student": () => [{ profile_id: "P1" }],
  "count(*)::int as n": () => [{ n: 1 }],
});

{ const db = dbFor(null, null);
  ok("없는 줄은 안 보낸다", (await sendLate(db, { lateId: "L1", env: ENV, push: async () => {} })).why === "no_row"); }
{ const db = dbFor({ ...LATE, sent_at: "2026-09-02T12:00:00Z" }, null);
  const r = await sendLate(db, { lateId: "L1", env: ENV, push: async () => {} });
  ok("이미 보낸 것은 두 번 안 보낸다", r.why === "already_sent" && r.stamped === false);
  ok("두 번 안 보낼 때는 자취도 안 남긴다",
     !db.asked.some((a) => /insert into v2\.notify_log/.test(a.sql))); }
{ const db = dbFor(LATE, null); const shot = [];
  const r = await sendLate(db, { lateId: "L1", env: { ...ENV, NOTIFY_SINK: "live" }, push: async (s, p) => shot.push(p) });
  ok("보내면 한 통이 나간다", r.ok === true && r.sent === 1, JSON.stringify(r));
  ok("**보낸 뒤에 도장을 찍는다** (late_stay.sent_at)",
     r.stamped === true && db.asked.some((a) => /update v2\.late_stay set sent_at/.test(a.sql)));
  const got = JSON.parse(shot[0]);
  ok("옛 SW 가 읽는 다섯 칸 그대로", ["title", "body", "tag", "url", "r"].every((k) => k in got), Object.keys(got).join(","));
  ok("잠금화면에 내용이 안 실린다 (갈아 끼우는 것은 notify 한 곳)",
     got.body === "앱에서 확인해주세요.", got.body);
  ok("꼬리표가 옛 앱과 같고 아이가 붙는다", got.tag.startsWith("send-late-"), got.tag);
  ok("눌렀을 때 /parent 로 연다", got.url === "/parent"); }
{ const db = dbFor(LATE, null);
  const r = await sendLate(db, { lateId: "L1", env: ENV, push: async () => {} });
  ok("⚠️ **스위치가 없으면 한 발도 안 나간다** (기본값)", r.ok === false && r.why === "sink_off", JSON.stringify(r));
  ok("안 나갔으면 **도장을 안 찍는다** — 마감이 계속 물어야 한다",
     r.stamped === false && !db.asked.some((a) => /update v2\.late_stay set sent_at/.test(a.sql)));
  ok("안 나가도 자취는 남는다", db.asked.some((a) => /insert into v2\.notify_log/.test(a.sql))); }

{ // ⚠️⚠️ **빈 손 잡기** — 손을 안 넘겼을 때 기본값이 정말 「쏘는 손」인가.
  //    여기서 손을 갈아 끼우면 검사는 늘 초록인데 **폰에는 아무것도 안 간다.** 그게 이 일의 사고다.
  //    열쇠를 빼고 스위치만 켠다 → 진짜 손이면 「열쇠가 없다」고 던지고(web-push 는 안 불린다),
  //    빈 손이면 조용히 「보냈습니다」가 된다.
  const db = dbFor(LATE, null);
  const r = await sendLate(db, { lateId: "L1", env: { NOTIFY_SINK: "live" } });
  ok("손을 안 넘기면 **진짜 쏘는 손**이 기본값이다 (빈 손이 아니다)",
     r.ok === false && r.why === "all_failed" && r.stamped === false, JSON.stringify(r));
  const failed = db.asked.find((a) => /update v2\.notify_log set failed_at/.test(a.sql));
  ok("빈 손이었으면 못 남을 까닭이 자취에 남는다", /열쇠/.test(String(failed?.p?.[1] ?? "")),
     JSON.stringify(failed?.p)); }

const SHEET = { id: "S1", student_id: "ST1", date: "2026-09-02", closed_at: null, sent_at: null,
                comment: "오늘 잘했습니다", student_name: "아무개" };
{ const db = dbFor(null, { ...SHEET, closed_at: "2026-09-02T12:00:00Z" });
  const r = await sendDaily(db, { sheetId: "S1", env: { NOTIFY_SINK: "live" } });
  ok("리포트도 손을 안 넘기면 진짜 손이 기본값이다", r.ok === false && r.why === "all_failed", JSON.stringify(r)); }
{ const db = dbFor(null, SHEET);
  const r = await sendDaily(db, { sheetId: "S1", env: { ...ENV, NOTIFY_SINK: "live" }, push: async () => {} });
  ok("⚠️ **마감 안 한 판은 못 보낸다** (눌러도 「아직 정리 중이에요」만 보인다)", r.why === "not_closed");
  ok("못 보낼 판은 자취도 안 남긴다", !db.asked.some((a) => /insert into v2\.notify_log/.test(a.sql))); }
{ const db = dbFor(null, { ...SHEET, closed_at: "2026-09-02T12:00:00Z" }); const shot = [];
  const r = await sendDaily(db, { sheetId: "S1", env: { ...ENV, NOTIFY_SINK: "live" }, push: async (s, p) => shot.push(p) });
  ok("마감한 판은 보낸다", r.ok === true && r.stamped === true, JSON.stringify(r));
  ok("리포트 꼬리표도 옛 앱과 같다", JSON.parse(shot[0]).tag.startsWith("send-daily-"), JSON.parse(shot[0]).tag); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ 쏘는 자리가 하나뿐인가 — 파일을 훑는다");
const walk = (d, out = []) => { for (const f of readdirSync(d)) {
  if (["node_modules", ".next", ".git", "backup", "_tmp", "sandbox"].includes(f)) continue;
  const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
    : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
const files = walk(".");
const pushers = files.filter((f) => !f.endsWith("lib/push.js") && !/check-(push|notify)\.mjs$/.test(f)
  && /require\(["']web-push|from ["']web-push|webpush\./.test(readFileSync(f, "utf8")));
ok("web-push 를 부르는 곳은 lib/push.js 뿐이다", pushers.length === 0, pushers.join(" "));

const src = readFileSync("lib/push.js", "utf8");
ok("손이 **잠금화면 판단을 다시 하지 않는다** (그 판단은 notify 한 곳)",
   !/OPEN_TO_SEE|lockScreenBody/.test(src));
ok("손이 **발송 스위치를 다시 읽지 않는다** (읽는 곳은 notify 뿐)",
   !/NOTIFY_SINK/.test(src));
ok("손이 SQL 에 값을 끼워 넣지 않는다 ($1 로만 넘긴다)",
   !/(select|insert|update|delete)[^`]*\$\{/i.test(src));
const route = readFileSync("app/api/notify/route.js", "utf8");
ok("보내기 문이 원장·강사인지 스스로 본다 (문지기는 역할로 안 지킨다)", /staffOnly\(\)/.test(route));
ok("보내기 문이 서비스 열쇠를 안 쓴다", !/SERVICE_ROLE|serviceDb/.test(route));
ok("보내기 문에 판단이 없다 — lib/push.js 를 부르기만 한다",
   /from "@\/lib\/push"/.test(route) && !/web-push/.test(route));

// ─────────────────────────────────────────────────────────────
// ⚠️⚠️ **진짜 DB 로 한 번 돌린다.** 가짜 DB 는 제약도 권한도 없어서 원리적으로 못 잡는다 —
//    이 저장소는 「규칙은 있는데 권한이 없어」 표 82개 중 56개가 통째로 읽기 전용이던 적이 있다.
//    쓰는 것은 전부 **트랜잭션 안에서 하고 되돌린다.** 한 글자도 안 남는다.
// ─────────────────────────────────────────────────────────────
console.log("\n■ 진짜 DB 로 — 원장 자격으로 자취를 남기고 도장을 찍을 수 있나 (전부 되돌린다)");
const PRINCIPAL = "00000000-0000-4000-8000-000000000001";   // 리허설 계정 (0004_fixture)
const STUDENT = "00000000-0000-4000-9000-000000000001";
try {
  const { Client } = await import("pg");
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const before = (await c.query("select (select count(*) from v2.push_sub) a,"
    + " (select count(*) from v2.late_stay) b, (select count(*) from v2.notify_log) d")).rows[0];
  const db = { query: (q, p) => c.query(q, p) };

  await c.query("begin");
  // ⚠️ 서비스 열쇠로 지나가지 않는다 — **로그인한 원장으로 갈아탄다** (화면이 도는 그 길)
  await c.query(`select set_config('request.jwt.claims',
      '{"sub":"${PRINCIPAL}","role":"authenticated"}', true)`);
  await c.query("set local role authenticated");
  ok("진짜 DB — 원장으로 갈아탔다", (await c.query("select v2.is_staff() s")).rows[0].s === true);

  const sheet = (await c.query(
    `insert into v2.day_sheet(student_id, date, attend, comment)
     values ($1, '2000-01-01', 'present', '검사용') returning id`, [STUDENT])).rows[0].id;
  const late = (await c.query(
    `insert into v2.late_stay(sheet_id, reason, until_at) values ($1, '검사용', '21:00') returning id`,
    [sheet])).rows[0].id;
  await c.query(`insert into v2.push_sub(profile_id, student_id, endpoint, p256dh, auth)
     values ('00000000-0000-4000-8000-000000000004', $1, 'chk-push-1', 'p', 'a')`, [STUDENT]);

  // ① 기본값 — 아무것도 안 나가는 것이 정상이다
  // ⚠️ 「이 판이 남긴 줄」만 센다 — 남의 줄을 세면 아무것도 안 남겨도 초록이 된다
  const mark = (await c.query("select coalesce(max(id),0) m from v2.notify_log")).rows[0].m;
  const off = await sendLate(db, { lateId: late, env: ENV, push: async () => { throw new Error("불리면 안 된다"); } });
  ok("진짜 DB — 기본 상태에서 **한 발도 안 나간다**", off.ok === false && off.why === "sink_off", JSON.stringify(off));
  ok("진짜 DB — 안 나갔으니 도장이 안 찍힌다",
     (await c.query("select sent_at from v2.late_stay where id=$1", [late])).rows[0].sent_at === null);
  const trace = (await c.query(
    "select kind, sink, sent_at from v2.notify_log where id > $1 order by id", [mark])).rows;
  ok("진짜 DB — 그래도 자취는 남는다 (막힌 판)",
     trace.length === 1 && trace[0].kind === "late" && trace[0].sink === "off" && trace[0].sent_at === null,
     JSON.stringify(trace));

  // ② 켜고 성공 — 도장이 찍힌다
  const live = { ...ENV, NOTIFY_SINK: "live" };
  const good = await sendLate(db, { lateId: late, env: live, push: async () => {} });
  ok("진짜 DB — 켜면 나간다", good.ok === true && good.sent === 1, JSON.stringify(good));
  ok("진짜 DB — **late_stay.sent_at 이 찍힌다**",
     (await c.query("select sent_at from v2.late_stay where id=$1", [late])).rows[0].sent_at !== null);

  // ③ 죽은 구독 — 진짜 표에 revoked_at 이 찍히나
  const dead = await sendLate(db, { lateId: late, env: live, again: true,
    push: makePush(db, { env: live, send: async () => { throw gone(410); } }) });
  ok("진짜 DB — 죽은 구독이면 **push_sub.revoked_at 이 찍힌다**",
     (await c.query("select revoked_at from v2.push_sub where endpoint='chk-push-1'")).rows[0].revoked_at !== null);
  ok("진짜 DB — 한 대도 못 갔으면 「보냄」이 아니다", dead.ok === false && dead.why === "all_failed", JSON.stringify(dead));
  ok("진짜 DB — 실패한 까닭이 자취에 남는다",
     /410/.test((await c.query(
       "select fail_why from v2.notify_log where fail_why is not null order by id desc limit 1")).rows[0]?.fail_why ?? ""));

  // ④ 데일리리포트 — 마감이 문이다
  const notYet = await sendDaily(db, { sheetId: sheet, env: live, push: async () => {} });
  ok("진짜 DB — 마감 안 한 판은 못 보낸다", notYet.why === "not_closed");
  await c.query("update v2.day_sheet set closed_at = now() where id = $1", [sheet]);
  await c.query(`insert into v2.push_sub(profile_id, student_id, endpoint, p256dh, auth)
     values ('00000000-0000-4000-8000-000000000004', $1, 'chk-push-2', 'p', 'a')`, [STUDENT]);
  const rep = await sendDaily(db, { sheetId: sheet, env: live, push: async () => {} });
  ok("진짜 DB — 마감한 판은 보내고 **day_sheet.sent_at 이 찍힌다**",
     rep.ok === true && (await c.query("select sent_at from v2.day_sheet where id=$1", [sheet])).rows[0].sent_at !== null,
     JSON.stringify(rep));

  await c.query("rollback");
  const after = (await c.query("select (select count(*) from v2.push_sub) a,"
    + " (select count(*) from v2.late_stay) b, (select count(*) from v2.notify_log) d")).rows[0];
  ok("진짜 DB — **한 글자도 안 남겼다** (되돌렸다)",
     before.a === after.a && before.b === after.b && before.d === after.d,
     JSON.stringify({ before, after }));
  await c.end();
} catch (e) {
  fail++; console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 발송 손 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
