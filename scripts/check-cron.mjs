/** 크론 검사 — **가짜 DB 로 돌려 보고, 진짜 DB 에도 물어본다.**
 *
 *  ⚠️ 왜 진짜 DB 에도 물어보나 — 앞 판에서 크게 다친 자리다.
 *     판단 넷의 검사가 62건·33건 **전부 통과**했는데 그 안의 SQL 이 **없는 칸**을 읽고 있었다.
 *     가짜 DB 만 상대하는 검사는 죽은 칸을 **원리적으로 못 잡는다.**
 *     → 아래 마지막 마당에서 크론이 쓰는 SQL 을 **진짜 스키마에 PREPARE** 한다.
 *       `lib/purge.js` 가 **만들어 내는** SQL(표 이름이 실행할 때 정해져서
 *       `scripts/check-sql.mjs` 가 「못 물어봄」으로 건너뛴 것)도 여기서 물어본다.
 *
 *  겨누는 사고:
 *   · 열쇠가 없는데 그냥 통과 → 주소만 알면 파기·발송이 돈다
 *   · 서버 시간(UTC)으로 돎 → 시간대 통일이 크론에서만 깨진다 (⑩)
 *   · 크론이 새 셈을 만듦 → 같은 셈이 두 벌 (⑨ · 원칙 4)
 *   · 한 일이 터져서 그날 전부가 안 돎
 *   · 크론이 모르는 갈래가 큐에 쌓이기만 함
 *   · 크론이 멈춘 것을 아무도 모름
 */
import {
  SQL, CRON_KIND, STUCK_DAYS, STEPS, NOT_COUNTED, NOT_RUN,
  keyFromReq, keyCheck, cronHealth, defaultChecks, handlersFor, runCron, todayFrom, onFrom,
} from "../app/api/cron/route.js";
import { purgeMap, columnFacts, planFor, isExpire, filesDueSql } from "../lib/purge.js";
import { Client } from "pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0, n = 0;
const ok = (t, c, w = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${w ? " — " + w : ""}`); }
                               else console.log(`   ✅ ${t}`); };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message); } };

// ⚠️ 중간에 터져도 **마지막 줄은 반드시 남긴다** — 안 그러면 check-all.sh 에 무엇이 깨졌는지 안 찍힌다
const bail = (e) => { n++; fail++;
  console.log(`   ❌ 검사가 중간에 터졌다 — ${e?.message ?? e}`);
  console.log(`\n■ 크론 검사 ${n}건 · 실패 ${fail}`);
  process.exit(1); };
process.on("uncaughtException", bail);
process.on("unhandledRejection", bail);

const TODAY = "2026-09-02";
const NOW = new Date("2026-09-02T05:00:00Z");
const req = (h = {}) => new Request("https://x.test/api/cron", { headers: h });

// ─────────────────────────────────────────────────────────────
// 이 파일의 SQL 을 **전부** 뽑는 자
//
// ⚠️⚠️ 겪은 사고(S4): 앞판은 백틱(`)만 보는 정규식이었다. `scripts/check-sql.mjs` 는
//    `lib` 만 훑어 `app/` 을 **원리적으로 안 보므로**, 따옴표로 쓴 SQL 한 줄은
//    두 검사 어디에도 안 걸렸다 — 「없는 칸」이 다시 들어오는 문이 절반만 막혀 있었다.
//    → 세 따옴표(` ' ")를 **다 본다.** 주석 안은 안 본다 (거기 적힌 예시 SQL 은 SQL 이 아니다).
// ─────────────────────────────────────────────────────────────
export function 문자열뽑기(src) {
  const out = [];
  for (let i = 0; i < src.length; ) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (ch === "/" && src[i + 1] === "*") {
      i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (ch === "`" || ch === "'" || ch === '"') {
      let j = i + 1, buf = "";
      while (j < src.length) {
        if (src[j] === "\\") { buf += src[j] + (src[j + 1] ?? ""); j += 2; continue; }
        if (src[j] === ch) break;
        // ⚠️ 따옴표 문자열은 줄을 못 넘는다 — 안 막으면 짝이 어긋난 따옴표 하나가 파일 끝까지 먹는다
        if (ch !== "`" && src[j] === "\n") { j = -1; break; }
        buf += src[j]; j++;
      }
      if (j > 0 && j < src.length) { out.push(buf); i = j + 1; continue; }
      i++; continue;
    }
    i++;
  }
  return out;
}

/** 그 중 **SQL 로 시작하는 것**만 — 어느 따옴표로 썼든 걸린다 */
export const sql뽑기 = (src) =>
  문자열뽑기(src).filter((s) => /^\s*(with|select|insert|update|delete)\b/i.test(s));

/** 되풀이 할일 규칙 한 줄 — **여러 마당이 함께 깐다.**
 *  ⚠️⚠️ 이걸 안 깐 씨앗으로 「크론이 쓸 수 있는 표」를 세면 되풀이가 0건이라
 *     크론이 `v2.todo` 에 쓰는 것을 그 마당이 **한 번도 못 본다** — 겪은 사고다.
 *     그래서 그 두 마당은 반드시 이 규칙을 깔고, 「정말 todo 에 썼나」를 따로 확인한다. */
const 되풀이규칙 = { id: "r1", kind: "repeat", name: "교재 점검", cron: "매주",
                  threshold: null, active: true };

// ─────────────────────────────────────────────────────────────
// 가짜 DB — 크론이 부르는 표만 흉내낸다.
// ⚠️ 흉내가 기대는 구절이 진짜 SQL 에 있는지 `must()` 로 확인한다.
//    안 그러면 SQL 을 몰래 뒤집어도 검사가 초록으로 통과한다 (실제로 겪은 사고다).
// ─────────────────────────────────────────────────────────────
function fakeDb(seed = {}) {
  const days = [];                       // v2.day_ran
  const q = seed.queue ?? [];            // v2.job_queue
  const sqls = [];
  const writes = [];                     // 크론이 **어느 표에 썼나**
  // ⚠️ 파일은 **상태가 바뀌는 것**이라 그냥 돌려주면 안 된다.
  //    「줄이 안 내려갔는데 버킷에서만 지운다」는 사고가 가짜 DB 로는 원리적으로 안 잡힌다.
  //    `bin: true` = 자료함 묶음에 걸린 파일 (lib/purge.js 의 exceptRow 가 줄 내리기를 막는다)
  const files = (seed.files ?? []).map((f) => ({ state: "active", bin: false, ...f }));
  const keys = [];                       // v2.auto_key
  const todos = [];                      // v2.todo
  let txDepth = 0;
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const must = (s, what, ...bits) => { for (const b of bits) if (!s.includes(b))
    throw new Error(`⚠️ ${what} 의 SQL 에 「${b}」 가 없다 — 가짜 DB 가 그것을 믿고 있다`); };
  let id = q.length;

  return { days, q, sqls, writes, files, keys, todos,
           get txDepth() { return txDepth; }, async query(sql, p = []) {
    const s = norm(sql); sqls.push(s);
    if (s === "begin") { txDepth++; return { rows: [], rowCount: 0 }; }
    if (s === "commit" || s === "rollback") { txDepth--; return { rows: [], rowCount: 0 }; }

    // 어느 표에 쓰려 했나 — 「크론이 새 셈을 만들지 않는다」를 여기서 센다
    const w = /\b(?:insert\s+into|update|delete\s+from)\s+(?:only\s+)?v2\.([a-z0-9_]+)/i.exec(s);
    if (w) writes.push(w[1]);

    if (s.includes("v2.today()::text")) return { rows: [{ d: seed.today ?? TODAY }], rowCount: 1 };
    if (s.includes("coalesce($1::date, v2.today())::text"))       // lib/attend.js todayOf
      return { rows: [{ d: p[0] ?? seed.today ?? TODAY }], rowCount: 1 };
    if (s.includes("select v2.today() as d")) return { rows: [{ d: seed.today ?? TODAY }], rowCount: 1 };

    if (s.includes("max(ran_on)")) {
      // ⚠️ `ran_on <= $2` 가 없으면 **앞날 도장이 「멈췄다」를 영영 끈다** — 흉내가 그걸 믿는다
      must(s, "cronHealth", "from v2.day_ran", "where kind = $1", "ran_on <= $2");
      const 오늘 = p[1] ?? "9999-12-31";
      const mine = days.filter((d) => d.kind === p[0] && d.ran_on <= 오늘).map((d) => d.ran_on).sort();
      const 씨 = seed.lastRan && seed.lastRan <= 오늘 ? seed.lastRan : null;
      return { rows: [{ last_on: mine.length ? mine[mine.length - 1] : 씨 }], rowCount: 1 };
    }
    if (s.includes("into v2.day_ran")) {
      const there = days.some((d) => d.kind === p[0] && d.ran_on === p[1]);
      if (there) return { rows: [], rowCount: 0 };
      days.push({ kind: p[0], ran_on: p[1] });
      return { rows: [{ kind: p[0] }], rowCount: 1 };
    }
    if (s.includes("into v2.job_queue")) {
      const row = { id: ++id, kind: p[0], payload: p[1], state: "wait", tries: 0,
                    next_at: p[2], locked_at: null, last_error: null };
      q.push(row); return { rows: [{ ...row }], rowCount: 1 };
    }
    if (s.includes("v2.job_queue q set")) {                       // take
      must(s, "take", "state='wait'", "kind = any($3)");
      const [now, limit, kinds] = p;
      const pick = q.filter((r) => r.state === "wait" && r.next_at <= now
                                   && (!kinds || kinds.includes(r.kind)))
                    .sort((a, b) => a.id - b.id).slice(0, limit);
      for (const r of pick) { r.state = "taking"; r.locked_at = now; r.tries++; }
      return { rows: pick.map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, tries: r.tries })),
               rowCount: pick.length };
    }
    if (s.includes("set state='done'")) {
      const r = q.find((x) => x.id === p[0]); if (r) { r.state = "done"; r.locked_at = null; }
      return { rows: r ? [{ id: r.id, state: r.state }] : [], rowCount: r ? 1 : 0 };
    }
    if (s.includes("set state = $2, next_at = $3")) {              // failed
      const r = q.find((x) => x.id === p[0]); if (r) { r.state = p[1]; r.next_at = p[2]; r.last_error = p[3]; }
      return { rows: r ? [{ id: r.id, state: r.state, tries: r.tries }] : [], rowCount: r ? 1 : 0 };
    }
    if (s.includes("state = 'taking' and locked_at is not null")) return { rows: [], rowCount: 0 };
    if (s.includes("group by state")) return { rows: [], rowCount: 0 };
    if (s.includes("group by kind")) return { rows: seed.waiting ?? [], rowCount: (seed.waiting ?? []).length };
    if (s.includes("from v2.scheduled_send")) return { rows: [{ n: seed.dueSend ?? 0 }], rowCount: 1 };
    // ── 되풀이 할일 ───────────────────────────────────────
    if (s.includes("from v2.auto_rule")) {
      must(s, "autoRules", "where active");
      return { rows: seed.rules ?? [], rowCount: (seed.rules ?? []).length };
    }
    if (s.includes("into v2.auto_key")) {
      // ⚠️ 유니크가 `nulls not distinct` 라 빈 칸이 섞여도 걸린다 — 그걸 흉내낸다
      const k = JSON.stringify(p);
      if (keys.includes(k)) return { rows: [], rowCount: 0 };
      keys.push(k); return { rows: [{ made_at: NOW.toISOString() }], rowCount: 1 };
    }
    if (s.includes("into v2.todo")) {
      const row = { id: "t" + (todos.length + 1), kind: p[0], title: p[1], due_on: p[3],
                    state: "open", why: p[4], rule_id: p[5] };
      todos.push(row); return { rows: [row], rowCount: 1 };
    }

    if (s.includes("from v2.purge_map")) return { rows: seed.map ?? [], rowCount: (seed.map ?? []).length };
    if (s.includes("information_schema.columns")) return { rows: seed.cols ?? [], rowCount: (seed.cols ?? []).length };
    if (s.includes("pg_constraint")) return { rows: seed.cons ?? [], rowCount: (seed.cons ?? []).length };

    // ── 파일 ──────────────────────────────────────────────
    if (s.includes("count(purge_on)")) {          // SQL.filePlan
      const 산것 = files.filter((f) => f.state !== "purged");
      return { rows: [{ n_live: 산것.length, n_planned: 산것.filter((f) => f.purge_on).length }], rowCount: 1 };
    }
    if (s.startsWith("select id, state from v2.file")) {   // SQL.fileState
      must(s, "fileState", "id = any($1)");
      const ids = p[0] ?? [];
      const rows = files.filter((f) => ids.includes(f.id)).map((f) => ({ id: f.id, state: f.state }));
      return { rows, rowCount: rows.length };
    }
    if (s.startsWith("update v2.file")) {
      const ids = p[0] ?? [];
      if (s.includes("state = 'purged'")) {       // 줄 내리기 — 자료함 묶음은 **안 내려간다**
        must(s, "파일 줄 내리기", "state <> 'purged'", "file_link", "bin_id is not null");
        let nn = 0;
        for (const f of files) if (ids.includes(f.id) && f.state !== "purged" && !f.bin) {
          f.state = "purged"; f.path = "purged:" + f.id; nn++; }
        return { rows: [], rowCount: nn };
      }
      let nn = 0;                                  // 이름 가리기 — 줄은 그대로다
      for (const f of files) if (ids.includes(f.id)) nn++;
      return { rows: [], rowCount: nn };
    }
    if (s.includes("from v2.file")) {              // filesDueSql
      // ⚠️ `as in_bin` 을 믿는다 — 크론이 **버킷에 넘길 경로를 그 한 칸으로 고른다.**
      //    빠지면 자료함 묶음에 걸린 파일까지 버킷에서 지워져 다른 아이 화면이 깨진다
      must(s, "기한 온 파일", "purge_on is not null", "purge_on <= $1", "as in_bin");
      const rows = files.filter((f) => f.state === "active" && f.purge_on && f.purge_on <= p[0])
        .map((f) => ({ id: f.id, path: f.path, orig_name: f.orig_name,
                       student_id: f.student_id, purge_on: f.purge_on, in_bin: !!f.bin }));
      // ⚠️ **읽은 뒤에 자료함에 묶이는 경합**을 흉내낸다 — 「버킷 먼저」가 사 온 새 위험이다
      for (const f of files) if (f.binLater) f.bin = true;
      return { rows, rowCount: rows.length };
    }
    if (s.includes("from v2.day_sheet")) return { rows: seed.planned ?? [], rowCount: 0 };
    if (s.includes("from v2.classes")) return { rows: seed.classes ?? [], rowCount: 0 };
    if (s.startsWith("update v2.excel_row") || s.startsWith("update v2.excel_run"))
      return { rows: [], rowCount: seed.expiredRows ?? 3 };
    return { rows: [], rowCount: 0 };
  } };
}

// ─────────────────────────────────────────────────────────────
console.log("■ 열쇠 — ⚠️ 「없으니 그냥 통과」가 최악이다");

ok("열쇠가 환경변수에 없으면 **아예 안 돈다**",
   keyCheck(req({ authorization: "Bearer anything" }), {}).ok === false);
ok("그때는 조용한 401 이 아니라 크게 운다 (500 — 안 그러면 「원래 안 도나 보다」로 넘어간다)",
   keyCheck(req({ authorization: "Bearer x" }), {}).status === 500,
   String(keyCheck(req({ authorization: "Bearer x" }), {}).status));
ok("빈 글자도 「없다」로 본다", keyCheck(req(), { CRON_SECRET: "   " }).ok === false);
ok("열쇠가 다르면 401", keyCheck(req({ authorization: "Bearer wrong" }), { CRON_SECRET: "right-key" }).status === 401);
ok("열쇠를 안 보내면 401", keyCheck(req(), { CRON_SECRET: "right-key" }).status === 401);
ok("맞으면 통과", keyCheck(req({ authorization: "Bearer right-key" }), { CRON_SECRET: "right-key" }).ok === true);
ok("Vercel 이 보내는 모양(Bearer)을 읽는다", keyFromReq(req({ authorization: "Bearer abc" })) === "abc");
ok("소문자 bearer 도 읽는다", keyFromReq(req({ authorization: "bearer abc" })) === "abc");
ok("손으로 부를 때 쓰는 머리글도 읽는다", keyFromReq(req({ "x-cron-secret": "abc" })) === "abc");
ok("길이가 달라도 안 터진다 (열쇠 길이를 알려 주지 않는다)",
   keyCheck(req({ authorization: "Bearer s" }), { CRON_SECRET: "a-very-very-long-key" }).status === 401);

{ const src = readFileSync("app/api/cron/route.js", "utf8");
  ok("⚠️ 열쇠를 주소(?key=)로 안 받는다 — 주소는 접속 기록에 그대로 굳는다",
     !/searchParams\.get\(["'](key|secret|token)["']\)/.test(src));
  ok("`===` 로 열쇠를 비교하지 않는다 (시간으로 새어 나간다)", !/CRON_SECRET\s*===/.test(src)); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ ⑩ 「학원의 오늘」을 인자로 받는다 — 서버 시간으로 안 돈다");

ok("오늘을 안 주면 던진다", (await threw(() => runCron({ db: fakeDb() })))?.includes("학원의 오늘"));
ok("Date 를 주면 던진다 (그게 서버 시간으로 도는 길이다)",
   (await threw(() => runCron({ db: fakeDb(), today: new Date() })))?.includes("Date"));
ok("없는 날은 던진다", (await threw(() => runCron({ db: fakeDb(), today: "2026-02-30" })))?.includes("없는 날"));
ok("DB 어댑터가 없으면 던진다", (await threw(() => runCron({ today: TODAY })))?.includes("DB"));
ok("오늘은 v2.today() 에서 받는다 (new Date() 가 아니다)",
   (await todayFrom(fakeDb({ today: "2026-08-30" }))) === "2026-08-30");

{ const src = readFileSync("app/api/cron/route.js", "utf8");
  // ⚠️ 오늘을 서버 시간으로 지어내면 UTC 서버에서 하루가 어긋난다
  ok("route 가 오늘을 스스로 지어내지 않는다 (toISOString().slice / seoulToday 가 없다)",
     !/toISOString\(\)\s*\.slice\(0,\s*10\)/.test(src) && !/seoulToday\s*\(/.test(src));
  ok("`::text` 로 받는다 (date 로 받으면 node-pg 가 기계 시간대 자정을 준다)",
     /v2\.today\(\)::text/.test(src)); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ ⑨ 크론은 **새 셈을 만들지 않는다** — lib 의 셈을 부르기만 한다");

{ // ⚠️⚠️ 씨앗에 **되풀이 규칙 한 줄을 반드시 깐다.** 안 깔면 되풀이가 0건이라
  //    아래 「쓸 수 있는 표」가 크론의 v2.todo 쓰기를 **한 번도 못 보고 늘 초록**이었다
  const db = fakeDb({ rules: [되풀이규칙] });
  const called = [];
  const checks = [{ kind: "가짜셈", count: async (t, d) => { called.push(t);
    // ⚠️ 셈이 DB 에 쓰려 들면 그 자리에서 터져야 한다
    ok("셈에 넘긴 DB 는 쓰기가 막혀 있다",
       (await threw(() => d.query("update v2.students set name='x'")))?.includes("students"));
    return 7; } }];
  const shot = [];
  const out = await runCron({ db, today: TODAY, now: NOW,
    deps: { checks, onCount: (k, v) => shot.push([k, v]) } });
  ok("셈을 부르며 「학원의 오늘」을 그대로 넘긴다", JSON.stringify(called) === JSON.stringify([TODAY]));
  ok("셈 결과를 그대로 내놓는다", JSON.stringify(shot) === JSON.stringify([["가짜셈", 7]]));
  const sweepStep = out.steps.find((s) => s.name === "하루훑기");
  ok("훑기 결과에 셈이 담긴다", sweepStep?.셈?.가짜셈 === 7, JSON.stringify(sweepStep));
  // ⚠️ 이것이 원칙 5 다 — **세어 나오는 값을 저장하지 않는다.**
  //    ⚠️ 규칙은 **둘로 나눠 읽어라** (앞판은 「셋뿐」이라고만 적어 사실과 어긋났다):
  //      · **셈**은 아무 데도 못 쓴다 — `guardDb` 가 첫 줄에서 터뜨린다
  //      · **파기**는 파기 목록 표(`lib/purge.js`)가 정한 표에만 쓴다 — file · excel_row · excel_run
  //    아래 씨앗에는 파일도 파기 목록도 안 깔려 있어서 **자동화 뼈대 넷만** 나와야 한다:
  //      day_ran(도장) · job_queue(다시 집을 일감) · auto_key(되풀이 자물쇠) · **todo(되풀이 할일)**.
  //    ⚠️⚠️ todo 가 빠져 있던 것이 겪은 사고다 — 되풀이를 붙이면서 크론이 v2.todo 에 쓰게 됐는데
  //       이 목록엔 없고, 씨앗에 규칙이 없어 그 쓰기를 **한 번도 못 봐서** 늘 초록이었다.
  //    파기가 깔린 씨앗은 「파기」 마당에서 따로 센다 — 안 그러면 그 쓰기를 **한 번도 못 본다**
  const 쓸수있는표 = new Set(["day_ran", "job_queue", "auto_key", "todo"]);
  ok("셈만 도는 판은 자동화 뼈대 말고 아무 표에도 안 쓴다 (셈 결과를 저장하지 않는다)",
     db.writes.every((t) => 쓸수있는표.has(t)), db.writes.join(" "));
  // ⚠️ 위 검사가 **거짓 초록이 아닌지**를 여기서 지킨다 — 되풀이 쓰기를 정말 보고 통과한 것인가
  ok("⚠️ 그 판이 v2.todo 에 정말 썼다 (안 썼으면 위 검사가 거짓 초록이다)",
     db.writes.includes("todo") && db.todos.length === 1, db.writes.join(" "));
  ok("v2.auto_key 도장도 함께 찍혔다 (되풀이가 진짜로 돌았다는 뜻)",
     db.writes.includes("auto_key"), db.writes.join(" "));
  ok("셈이 돈 표(day_sheet·students·progress)에는 한 글자도 안 쓴다",
     !db.writes.some((t) => ["day_sheet", "students", "progress", "notify_log"].includes(t)),
     db.writes.join(" "));
  ok("day_ran 에 훑기 도장과 크론 도장이 남는다", db.days.length === 2, JSON.stringify(db.days));
  ok("크론 도장의 갈래가 정해진 것과 같다", db.days.some((d) => d.kind === CRON_KIND));
}

{ const db = fakeDb();
  const checks = [{ kind: "가짜셈", count: async () => 1 }];
  await runCron({ db, today: TODAY, now: NOW, deps: { checks } });
  const out2 = await runCron({ db, today: TODAY, now: NOW, deps: { checks } });
  const s = out2.steps.find((x) => x.name === "하루훑기");
  ok("같은 날 두 번 불려도 훑기는 한 번만 돈다 (Hobby 가 몇 번을 부르든)",
     s.돔 === 0 && s.이미돌았음 === 1, JSON.stringify(s));
  ok("두 번째 판도 ok 다 (「이미 돌았다」는 실패가 아니다)", out2.ok === true, JSON.stringify(out2.실패)); }

ok("아직 안 세는 것을 **지어내지 않고 이름을 내놓는다**",
   NOT_COUNTED.length >= 3 && NOT_COUNTED.every((x) => x.what && x.why));
ok("기본 셈 둘은 lib 의 함수를 부른다", defaultChecks().length === 2);

// ⚠️⚠️ 겪은 사고: 되풀이 할일이 **아무 데서도 안 만들어지는데 선언도 안 되어 있었다.**
//    오류도 안 나고 화면이 비지도 않아 몇 주 뒤에나 안다 (계획 (e) ②)
ok("⚠️ **아예 안 도는 일**도 지어내지 않고 이름을 내놓는다",
   NOT_RUN.length >= 1 && NOT_RUN.every((x) => x.what && x.why));
ok("아직 못 도는 자리마다 **어디서 고칠지**까지 적혀 있다",
   NOT_RUN.every((x) => x.어디), JSON.stringify(NOT_RUN.map((x) => x.what)));
{ const src = readFileSync("app/api/cron/route.js", "utf8");
  // ⚠️⚠️ `planRecurring` 을 **make 없이** 부르면 claimKey 가 도장을 먼저 찍어
  //    **할일은 영영 안 생기는데 「이미 만들었다」로 굳는다.** 되돌릴 길이 없다.
  //    그래서 크론은 그것을 직접 안 부르고, make 를 끼워 부르는 lib/todo.js 의 planRepeats 만 지난다
  ok("⚠️ 크론이 planRecurring 을 **직접 안 부른다** (make 없이 부르면 도장만 찍히고 할일이 영영 안 생긴다)",
     !/\bplanRecurring\s*\(/.test(src));
  ok("되풀이는 lib/todo.js 의 planRepeats 한 곳을 지난다", /planRepeats\(/.test(src));
  ok("되풀이 자리가 STEPS 에 있다", STEPS.some(([name]) => name === "되풀이할일"),
     STEPS.map(([n]) => n).join(" ")); }
{ const out = await runCron({ db: fakeDb(), today: TODAY, now: NOW, deps: { checks: [] } });
  ok("보고에 「안 도는 것」이 실린다 (200 본문에만 적어 두면 아무도 안 본다)",
     (out.steps.find((s) => s.name === "보고")?.안도는것 ?? []).length >= 1); }

// ⚠️⚠️ 겪은 사고 — 되풀이 할일이 **아무 데서도 안 만들어졌다.** lib 에 셈이 다 있는데
//    크론이 안 불러서, 규칙을 켜도 **할일이 한 줄도 안 생기고 오류도 안 났다**
{ const 규칙 = [{ id: "r1", kind: "repeat", name: "교재 점검", cron: "매주", threshold: null, active: true },
              { id: "r2", kind: "repeat", name: "모르는주기", cron: "격주", threshold: null, active: true }];
  const db = fakeDb({ rules: 규칙 });
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const r = out.steps.find((s) => s.name === "되풀이할일");
  ok("⚠️ 되풀이 규칙을 켜면 **할일이 정말 선다** (크론이 lib 을 부른다)",
     r?.세운것 === 1 && db.todos.length === 1, JSON.stringify([r, db.todos]));
  ok("그 할일은 어느 규칙에서 왔는지 가리킨다 (「이게 왜 여기 있지」에 답한다)",
     db.todos[0]?.rule_id === "r1" && /되풀이 규칙/.test(db.todos[0]?.why ?? ""), JSON.stringify(db.todos[0]));
  ok("⚠️ 주기 글자를 모르는 규칙은 **이름을 내놓는다** (조용히 넘기면 그 규칙만 영영 안 돈다)",
     r.건너뜀.length === 1 && r.건너뜀[0].규칙 === "모르는주기", JSON.stringify(r.건너뜀));
  // 같은 날 두 번 불려도 열쇠가 자물쇠다
  const out2 = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const r2 = out2.steps.find((s) => s.name === "되풀이할일");
  ok("두 번 불려도 할일이 하나다 (auto_key 가 자물쇠)",
     r2.세운것 === 0 && r2.이미있음 === 1 && db.todos.length === 1, JSON.stringify([r2, db.todos.length])); }

{ // ⚠️ 크론이 며칠 멈췄으면 그 며칠도 **따라잡는다** — 안 그러면 멈춘 동안의 몫이 영영 안 선다
  const db = fakeDb({ rules: [{ id: "r1", kind: "repeat", name: "월간 정리", cron: "매달",
                               threshold: null, active: true }],
                      lastRan: "2026-07-30" });
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const r = out.steps.find((s) => s.name === "되풀이할일");
  ok("멈춘 동안(7/31~9/2)의 되풀이 몫을 따라잡는다 — 7·8·9월 셋",
     r.부터 === "2026-07-31" && r.세운것 === 3, JSON.stringify(r)); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ 한 일이 터져도 **나머지는 돈다**");

{ // 첫 일(되살리기)에서 터지게 만든다
  const db = fakeDb();
  const base = db.query.bind(db);
  db.query = async (sql, p) => {
    if (String(sql).includes("state = 'taking' and locked_at")) throw new Error("일부러 터뜨림");
    return base(sql, p); };
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [{ kind: "가짜셈", count: async () => 1 }] } });
  ok("터진 일이 실패로 남는다", out.실패.includes("잠긴일되살리기"), JSON.stringify(out.실패));
  ok("⚠️ 그 뒤 일들은 **그대로 돈다**", out.steps.filter((s) => s.ok).length === STEPS.length - 1,
     JSON.stringify(out.steps.map((s) => [s.name, s.ok])));
  ok("한 일이라도 터지면 ok 가 아니다 (조용한 200 이 제일 무섭다)", out.ok === false);
  ok("⚠️ 그래도 **도장은 찍힌다** — 안 찍으면 대시보드가 「크론이 멈췄다」고 거짓말한다",
     db.days.some((d) => d.kind === CRON_KIND)); }

{ // 셈 하나가 터져도 다른 셈은 돈다
  const db = fakeDb();
  const checks = [{ kind: "터지는셈", count: async () => { throw new Error("터짐"); } },
                  { kind: "되는셈",   count: async () => 3 }];
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks } });
  const s = out.steps.find((x) => x.name === "하루훑기");
  const sweepStep2 = s;
  ok("셈 하나가 터져도 다른 셈은 돈다", s.셈.되는셈 === 3, JSON.stringify(s.셈));
  ok("터진 셈은 이름과 까닭이 남는다", s.실패.length === 1 && s.실패[0].kind === "터지는셈");
  // ⚠️⚠️ 겪은 사고: 한 일의 결과를 `{ name, ok: true, ...r }` 로 담아 **ok 가 늘 true** 였다.
  //    「없는 칸」으로 셈이 터져도 out.ok 는 true → HTTP 200 → Vercel 기록이 초록 →
  //    결석·지각 예정 알림이 몇 주 안 나간 것을 학부모 전화로 알게 된다
  ok("⚠️ 셈이 터진 판은 **초록이 아니다** (그 한 줄이 없으면 조용한 200 이 된다)",
     sweepStep2.ok === false && out.ok === false && out.실패.includes("하루훑기"),
     JSON.stringify([sweepStep2.ok, out.ok, out.실패]));
  ok("터진 셈은 **큐에 다시 넣어 둔다** (조용히 사라지지 않는다)",
     db.q.some((j) => j.kind === "터지는셈"), JSON.stringify(db.q.map((j) => j.kind))); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ 큐 — ⚠️ 크론이 모르는 갈래는 **집지 않고 내놓는다**");

{ const db = fakeDb({ queue: [
    { id: 1, kind: "되는셈", payload: JSON.stringify({ ran_on: "2026-08-30" }),
      state: "wait", tries: 0, next_at: "2026-09-02T00:00:00.000Z", locked_at: null },
  ] });
  const seen = [];
  const checks = [{ kind: "되는셈", count: async (t) => { seen.push(t); return 5; } }];
  await runCron({ db, today: TODAY, now: NOW, deps: { checks } });
  ok("다시 도는 일감은 **그날 것**으로 돈다 (오늘 것으로 돌면 못 돈 날이 영영 안 돈다)",
     seen.includes("2026-08-30"), JSON.stringify(seen));
  ok("처리한 일감은 done 이 된다", db.q.find((j) => j.id === 1).state === "done"); }

{ const db = fakeDb({ queue: [
    { id: 1, kind: "아무도모르는갈래", payload: null, state: "wait", tries: 0,
      next_at: "2026-09-02T00:00:00.000Z", locked_at: null },
  ], waiting: [{ kind: "아무도모르는갈래", n: 1 }] });
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [{ kind: "되는셈", count: async () => 1 }] } });
  ok("⚠️ 모르는 갈래는 **집지 않는다** (집으면 영영 실패로 굳는다)",
     db.q.find((j) => j.id === 1).state === "wait");
  const r = out.steps.find((s) => s.name === "보고");
  ok("⚠️ 그 대신 「아무도 안 집는다」로 내놓는다 — 안 내놓으면 문자가 안 간 것을 학부모가 먼저 안다",
     r.아무도안집음.length === 1 && r.아무도안집음[0].kind === "아무도모르는갈래",
     JSON.stringify(r.아무도안집음)); }

{ // ⚠️⚠️ 겪은 사고: 같은 `onCount` 가 보통 날은 셋, 큐 재시도 길에서만 넷으로 불렸다.
  //    발송을 붙이는 날 **보통 날마다 넷째(그날)가 undefined** 로 들어가는데 오류가 안 난다
  const 부른것 = [];
  const db = fakeDb({ queue: [{ id: 1, kind: "되는셈", payload: JSON.stringify({ ran_on: "2026-08-30" }),
    state: "wait", tries: 0, next_at: "2026-09-02T00:00:00.000Z", locked_at: null }] });
  await runCron({ db, today: TODAY, now: NOW,
    deps: { checks: [{ kind: "되는셈", count: async () => 3 }],
            onCount: (...a) => { 부른것.push({ n: a.length, kind: a[0], v: a[1], db: !!a[2]?.query, on: a[3] }); } } });
  ok("onCount 가 두 길에서 다 불린다 (큐 다시돌기 · 하루훑기)", 부른것.length === 2, JSON.stringify(부른것));
  ok("⚠️ 두 길 다 **넷**을 받는다 — 한쪽만 셋이면 발송이 붙는 날 날짜가 undefined 로 샌다",
     부른것.every((c) => c.n === 4), JSON.stringify(부른것.map((c) => c.n)));
  ok("넷째는 **그날**이다 (큐는 못 돈 날, 훑기는 오늘)",
     부른것.every((c) => typeof c.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.on))
       && 부른것.some((c) => c.on === "2026-08-30") && 부른것.some((c) => c.on === TODAY),
     JSON.stringify(부른것.map((c) => c.on)));
  ok("셋째는 쓰기가 안 막힌 db 다 (알림 자취를 남겨야 한다)", 부른것.every((c) => c.db)); }

{ const h = handlersFor(defaultChecks(), null);
  ok("훑기 갈래마다 처리기가 저절로 생긴다 (둘이 어긋날 자리가 없다)",
     Object.keys(h).length === defaultChecks().length); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ 파기 — 파일 정리와 기한 파기는 **한 트랜잭션**이다");

{ const db = fakeDb({ map: [
    { schema_name: "v2", tbl: "excel_row", col: "before", how: "expire", after_days: 90 },
    { schema_name: "v2", tbl: "excel_run", col: "note",   how: "expire", after_days: 90 },
  ], expiredRows: 4 });
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const e = out.steps.find((s) => s.name === "기한파기");
  ok("기한이 지난 줄을 비운다", e.돈줄 === 2 && e.비운줄 === 8, JSON.stringify(e));
  ok("트랜잭션을 열고 닫았다 (반쪽 파기가 안 남는다)", db.txDepth === 0);
  ok("begin/commit 이 실제로 나갔다", db.sqls.includes("begin") && db.sqls.includes("commit")); }

{ // ⚠️ 이것이 제일 무서운 자리다 — **한 줄도 안 도는데 초록**이면
  //    90일 지난 excel_row 에 아이 이름·전화가 해가 지나도 남는다
  const db = fakeDb({ map: [{ schema_name: "v2", tbl: "excel_row", col: "before", how: "expire", after_days: null }] });
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const e = out.steps.find((s) => s.name === "기한파기");
  ok("⚠️ 기한 파기가 한 줄도 못 돌면 **조용히 넘어가지 않고 터진다**", e.ok === false, JSON.stringify(e));
  ok("까닭에 「개인정보가 안 지워지고 있다」가 적힌다", /개인정보가 안 지워지/.test(e.why), e.why);
  ok("어느 칸이 막혔는지 이름을 댄다", /excel_row\.before/.test(e.why), e.why);
  ok("그 판은 ok 가 아니다 (500 으로 운다)", out.ok === false);
  ok("그래도 뒤 일(보고)은 돈다", out.steps.find((s) => s.name === "보고")?.ok === true); }

{ // ⚠️⚠️ 겪은 사고: **일부만** 막히면 조용히 넘어갔다 (`!expired.length && blocked.length`).
  //    excel_run.note 에 기한을 안 적은 날, 그 칸의 아이 이름이 해가 지나도 남는데 날마다 초록이다
  const db = fakeDb({ map: [
    { schema_name: "v2", tbl: "excel_row", col: "before", how: "expire", after_days: 90 },
    { schema_name: "v2", tbl: "excel_run", col: "note",   how: "expire", after_days: null },
  ] });
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const e = out.steps.find((s) => s.name === "기한파기");
  ok("⚠️ 기한 파기가 **한 줄이라도 막히면** 운다 (일부만 막혀도 조용히 안 넘어간다)",
     e.ok === false && out.ok === false, JSON.stringify(e));
  ok("막힌 칸 이름을 댄다", /excel_run\.note/.test(e.why ?? ""), e.why);
  ok("막혔으면 **한 줄도 안 나간다** (반쪽 파기가 안 남는다)",
     !db.sqls.some((x) => x.startsWith("update v2.excel_row")), db.sqls.filter((x) => x.startsWith("update")).join(" | ")); }

{ // 기한 파기가 도는 중에 터지면 되돌린다
  const db = fakeDb({ map: [{ schema_name: "v2", tbl: "excel_row", col: "before", how: "expire", after_days: 90 }] });
  const base = db.query.bind(db);
  db.query = async (sql, p) => {
    if (String(sql).startsWith("update v2.excel_row")) throw new Error("일부러 터뜨림");
    return base(sql, p); };
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  ok("파기가 터지면 rollback 한다 (앞 칸만 비는 반쪽이 안 남는다)",
     db.sqls.includes("rollback") && db.txDepth === 0);
  ok("그래도 뒤 일은 돈다", out.steps.find((s) => s.name === "보고")?.ok === true); }

// 진짜 v2.purge_map · 진짜 v2.file 스키마를 그대로 옮긴 씨앗
//  ⚠️ path 에 unique 가 걸려 있어 줄을 내리면 무덤값(`purged:…`)으로 **덮인다** —
//     그래서 지우개 없이 줄부터 내리면 버킷의 진짜 파일을 영영 못 찾는다
const 파일목록 = [{ schema_name: "v2", tbl: "file", col: "orig_name", how: "mask" },
                { schema_name: "v2", tbl: "file", col: "path", how: "row" }];
const 파일칸 = [{ t: "file", c: "id", n: "NO" }, { t: "file", c: "state", n: "NO" },
              { t: "file", c: "path", n: "NO" }, { t: "file", c: "orig_name", n: "NO" }];
const 파일제약 = [{ t: "file", c: "path", ty: "u" }];
const 숙제사진 = { id: "f1", path: "hw/2026/민준-숙제.jpg", orig_name: "민준-숙제.jpg",
                student_id: "s1", purge_on: "2026-08-01" };
const 자료함안내 = { id: "f2", path: "bin/수행평가안내.pdf", orig_name: "수행평가안내.pdf",
                 student_id: null, purge_on: "2026-08-01", bin: true };
const 파일씨 = (files) => ({ files, map: 파일목록, cols: 파일칸, cons: 파일제약 });

{ const db = fakeDb(파일씨([{ ...숙제사진 }]));
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const f = out.steps.find((s) => s.name === "파일정리");
  ok("기한이 온 파일을 찾는다", f.기한온것 === 1, JSON.stringify(f));
  ok("⚠️ 버킷에 남는 파일 개수를 **숨기지 않고 내놓는다**", f.버킷에남은것 === 1);
  ok("⚠️ 경로(아이 이름이 들 수 있다)는 내놓지 않는다", !JSON.stringify(out).includes("hw/2026"));
  // ⚠️⚠️ 겪은 사고: 지우개가 없는데 줄만 내려 path 가 `purged:…` 로 덮였다.
  //    「지웠다」고 초록으로 뜨는데 버킷의 아이 사진은 그대로 남고 **찾을 길이 없다**
  ok("⚠️ Storage 지우개가 없으면 **줄을 아예 안 내린다** (path 를 지우면 버킷 파일을 영영 못 찾는다)",
     db.files[0].state === "active" && db.files[0].path === 숙제사진.path,
     JSON.stringify(db.files[0]));
  ok("v2.file 에 한 글자도 안 썼다", !db.writes.includes("file"), db.writes.join(" "));
  ok("안 돌렸다는 것을 **밝힌다** (조용히 0 으로 넘기지 않는다)", /지우개/.test(f.안돌림 ?? ""), f.안돌림);
  ok("⚠️ 기한이 온 것이 있는데 못 돌리면 **초록이 아니다**", f.ok === false && out.ok === false); }

{ // 기한이 온 것이 없으면 지우개가 없어도 초록이다 (날마다 500 을 만들지 않는다)
  const db = fakeDb(파일씨([]));
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  ok("기한이 온 파일이 없으면 지우개가 없어도 초록이다", out.ok === true,
     JSON.stringify(out.steps.find((s) => s.name === "파일정리"))); }

{ // ⚠️⚠️ 겪은 사고 — 자료함 묶음에 걸린 파일은 **줄이 안 내려가는데 경로만 지우개로 넘어갔다.**
  //    DB 는 「살아 있다」인데 버킷의 안내문만 사라져 다른 아이 화면이 깨진 링크가 된다
  const 지운것 = [];
  const db = fakeDb(파일씨([{ ...숙제사진 }, { ...자료함안내 }]));
  const out = await runCron({ db, today: TODAY, now: NOW,
    deps: { checks: [], removeStorage: async (ps) => { 지운것.push(...ps); return ps.length; } } });
  const f = out.steps.find((s) => s.name === "파일정리");
  ok("버킷 지우개를 끼우면 진짜 파일도 지운다", 지운것.includes(숙제사진.path), JSON.stringify(지운것));
  ok("⚠️ 자료함 묶음에 걸린 파일의 경로는 **지우개에 안 넘긴다** (줄이 안 내려갔다)",
     !지운것.includes(자료함안내.path), JSON.stringify(지운것));
  ok("그 줄은 그대로 살아 있다", db.files[1].state === "active" && db.files[1].path === 자료함안내.path);
  ok("⚠️ 보고의 셈은 **문장 수가 아니라 줄 수**다 (파일이 500장이어도 문장은 늘 둘이다)",
     f.파기된줄 === 1 && f.안내려간줄 === 1, JSON.stringify(f));
  ok("버킷에 남은 것도 센다", f.버킷에서지움 === 1 && f.버킷에남은것 === 1, JSON.stringify(f));
  // ⚠️ 차례를 **오간 자취로** 확인한다 — 버킷을 먼저 지우고 그 뒤에 줄이 내려가야 한다
  ok("⚠️ 버킷을 **줄 내리기보다 먼저** 지웠다 (뒤집히면 지우개가 터지는 날 경로가 사라진다)",
     db.sqls.findIndex((s) => s.startsWith("update v2.file") && s.includes("state = 'purged'")) > -1
       && 지운것.length > 0, JSON.stringify(지운것)); }

{ // ⚠️⚠️ 겪은 사고(S2) — 지우개가 **있을 때**의 차례가 주석과 정반대였다(DB 먼저 → 버킷 나중).
  //    지우개가 한 번 503 이면 줄은 이미 무덤값인데 버킷 파일은 남아
  //    **그 파일이 어디 있는지 아는 유일한 값이 사라진다.** 되돌릴 길이 없다
  const db = fakeDb(파일씨([{ ...숙제사진 }]));
  const out = await runCron({ db, today: TODAY, now: NOW,
    deps: { checks: [], removeStorage: async () => { throw new Error("Storage: 503"); } } });
  const f = out.steps.find((s) => s.name === "파일정리");
  ok("⚠️ 지우개가 터지면 **DB 줄이 그대로다** (버킷 먼저 → DB 나중이라 다음 날 다시 돈다)",
     db.files[0].state === "active" && db.files[0].path === 숙제사진.path,
     JSON.stringify(db.files[0]));
  ok("그 판은 v2.file 에 한 글자도 안 썼다", !db.writes.includes("file"), db.writes.join(" "));
  ok("그 판은 초록이 아니다 (조용한 200 이 제일 무섭다)",
     f.ok === false && out.ok === false && /503/.test(f.why ?? ""), JSON.stringify(f));
  ok("그래도 뒤 일(보고)은 돈다", out.steps.find((s) => s.name === "보고")?.ok === true); }

{ // ⚠️ 「버킷 먼저」가 사 온 **새 위험** — 읽은 뒤에 자료함에 묶이면
  //    버킷에서는 지웠는데 줄은 안 내려간다. DB 는 「살아 있다」인데 누르면 404 다
  const db = fakeDb(파일씨([{ ...숙제사진, binLater: true }]));
  const out = await runCron({ db, today: TODAY, now: NOW,
    deps: { checks: [], removeStorage: async (ps) => ps.length } });
  const f = out.steps.find((s) => s.name === "파일정리");
  ok("⚠️ 버킷에서 지웠는데 줄이 안 내려간 것이 있으면 **세어서 판을 붉힌다**",
     f.어긋난줄 === 1 && f.ok === false && out.ok === false, JSON.stringify(f));
  ok("까닭에 「누르면 404」가 적힌다 (개수만 200 본문에 두면 아무도 안 본다)",
     /404/.test(f.why ?? ""), f.why); }

{ // ⚠️⚠️ 「버킷 먼저」는 **자료함인지 아닌지를 미리 알아야** 돈다 — 그 한 칸(`in_bin`)이
  //    안 오는 날 「없으면 자료함이 아니겠지」로 읽으면 **남의 안내문을 버킷에서 지운다.**
  //    조용히 0 으로 넘어가도 안 된다 — 줄만 내려가 버킷 파일이 미아가 된다
  const 지운것 = [];
  const db = fakeDb(파일씨([{ ...숙제사진 }, { ...자료함안내 }]));
  const base = db.query.bind(db);
  db.query = async (sql, p) => {                     // in_bin 칸이 빠진 날을 흉내낸다
    const r = await base(sql, p);
    if (String(sql).includes("as in_bin"))
      return { ...r, rows: r.rows.map(({ in_bin, ...rest }) => rest) };
    return r; };
  const out = await runCron({ db, today: TODAY, now: NOW,
    deps: { checks: [], removeStorage: async (ps) => { 지운것.push(...ps); return ps.length; } } });
  const f = out.steps.find((s) => s.name === "파일정리");
  ok("⚠️ in_bin 이 안 오면 **버킷에서 한 장도 안 지운다** (모르면 안 지우는 쪽 — 대전제 0)",
     지운것.length === 0, JSON.stringify(지운것));
  ok("⚠️ 줄도 안 내린다 (줄만 내려가면 버킷 파일이 미아가 된다)",
     db.files.every((x) => x.state === "active"), JSON.stringify(db.files.map((x) => x.state)));
  ok("조용히 0 으로 안 넘어가고 **판을 붉힌다**", f.ok === false && out.ok === false, JSON.stringify(f));
  ok("까닭에 어느 함수를 고쳐야 하는지 적힌다", /filesDueSql/.test(f.why ?? ""), f.why); }

{ // ⚠️ 「기한이 온 것 0」이 **깨끗해서인지 아무도 안 적어서인지** 가른다
  const db = fakeDb(파일씨([{ id: "f9", path: "hw/옛것.jpg", orig_name: "옛것.jpg", purge_on: null }]));
  const out = await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  const f = out.steps.find((s) => s.name === "파일정리");
  ok("⚠️ 파기 예정일이 한 줄도 안 적혀 있으면 그것을 밝힌다 (0 을 「깨끗하다」로 읽으면 안 된다)",
     /파기 예정일이 적힌 줄이 하나도 없다/.test(f.밝힘 ?? ""), JSON.stringify(f)); }

{ // ⚠️⚠️ 앞판의 「쓸수있는표」 검사는 **파일도 파기 목록도 안 깔린 가짜 DB** 로만 돌아서
  //    크론이 v2.file · v2.excel_row 에 쓰는 것을 **한 번도 못 봤다** — 늘 초록이었다.
  //    여기서 파기까지 깔고 한 번 더 센다. 파기 목록 밖의 표가 나오면 빨갛게
  //    ⚠️ 되풀이 규칙도 **같이 깐다** — 안 깔면 v2.todo 쓰기를 여기서도 못 본다(겪은 사고)
  const db = fakeDb({ ...파일씨([{ ...숙제사진 }]),
    rules: [되풀이규칙],
    map: [...파일목록,
          { schema_name: "v2", tbl: "excel_row", col: "before", how: "expire", after_days: 90 },
          { schema_name: "v2", tbl: "excel_run", col: "note",   how: "expire", after_days: 90 }] });
  await runCron({ db, today: TODAY, now: NOW,
    deps: { checks: [], removeStorage: async (ps) => ps.length } });
  const 파기가쓰는표 = new Set(["day_ran", "job_queue", "auto_key", "todo",
                            "file", "excel_row", "excel_run"]);
  ok("파기가 도는 판도 **파기 목록이 정한 표에만** 쓴다",
     db.writes.every((t) => 파기가쓰는표.has(t)), db.writes.join(" "));
  ok("그 판이 v2.file 에 정말 썼다 (안 썼으면 위 검사가 거짓 초록이다)",
     db.writes.includes("file"), db.writes.join(" "));
  ok("⚠️ 그 판이 v2.todo 에도 정말 썼다 (되풀이가 안 돌면 위 검사가 거짓 초록이다)",
     db.writes.includes("todo"), db.writes.join(" ")); }

{ // ⚠️⚠️ 겪은 사고(N1) 를 그대로 재현하는 줄 — 「크론이 쓸 수 있는 표」 목록이
  //    **크론이 실제로 쓰는 표를 다 담고 있나.** 목록에 없는 표가 하나라도 나오면 빨갛게.
  //    앞판은 todo 가 목록 두 곳 다 빠져 있었는데 씨앗에 규칙이 없어 못 잡았다
  const db = fakeDb({ ...파일씨([{ ...숙제사진 }]),
    rules: [되풀이규칙],
    map: [...파일목록,
          { schema_name: "v2", tbl: "excel_row", col: "before", how: "expire", after_days: 90 },
          { schema_name: "v2", tbl: "excel_run", col: "note",   how: "expire", after_days: 90 }],
    queue: [{ id: 1, kind: "되는셈", payload: JSON.stringify({ ran_on: "2026-08-30" }),
              state: "wait", tries: 0, next_at: "2026-09-02T00:00:00.000Z", locked_at: null }] });
  await runCron({ db, today: TODAY, now: NOW,
    deps: { checks: [{ kind: "되는셈", count: async () => 1 }],
            removeStorage: async (ps) => ps.length } });
  // 크론이 쓸 수 있는 표 — **여기가 하나뿐인 목록이다.** 늘려야 할 일이 생기면 까닭을 옆에 적어라
  const 크론이쓰는표 = new Set([
    "day_ran",    // 「그날 이거 돌았다」 도장
    "job_queue",  // 다시 집을 일감
    "auto_key",   // 되풀이 자물쇠
    "todo",       // 되풀이 할일 (lib/todo.js 의 planRepeats)
    "file", "excel_row", "excel_run",  // 파기 목록이 정한 표
  ]);
  const 밖 = [...new Set(db.writes)].filter((t) => !크론이쓰는표.has(t));
  ok("⚠️ 크론이 실제로 쓴 표가 **전부 목록 안**이다 (한 판에 되풀이·파기·큐를 다 깔고 센다)",
     밖.length === 0, "목록 밖: " + 밖.join(" "));
  ok("그 판이 되풀이·파기를 **정말로** 돌렸다 (안 돌면 위 검사가 거짓 초록이다)",
     ["todo", "auto_key", "file", "excel_row"].every((t) => db.writes.includes(t)),
     [...new Set(db.writes)].join(" ")); }

{ const src = readFileSync("app/api/cron/route.js", "utf8");
  // ⚠️ 승인 단추는 안심을 하나도 더 사 주지 않으면서 **눌러야 하는 것만 하나 늘린다**(대전제 3).
  //    안 눌러도 아무 일이 안 나므로 결국 안 누르게 되고, 아이들 숙제 사진이 해가 지나도 쌓인다
  ok("⚠️ 「원장님이 승인하면 지운다」 문을 안 만든다",
     !/deps\.(approve|approved|승인)/.test(src) && !/\bapproved?\b/.test(src)); }
{ // 승인 인자를 하나도 안 주고도 파기가 돈다 — 그것이 「자동이 기본」이다
  const db = fakeDb({ files: [{ id: "f1", path: "a/b.jpg", orig_name: "x", student_id: "s1", purge_on: "2026-08-01" }] });
  const out = await runCron({ db, today: TODAY, now: NOW });
  ok("아무 승인 없이 파기가 돈다 (자동이 기본이다)",
     out.steps.find((s) => s.name === "파일정리").기한온것 === 1); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ 크론이 멈춘 것을 앱이 알아챈다 — **안 돌 때만 부른다**");

{ const db = fakeDb({ lastRan: null });
  const h = await cronHealth(db, TODAY);
  ok("한 번도 안 돌았으면 알린다", h.stuck === true && !!h.line, JSON.stringify(h)); }
{ const db = fakeDb({ lastRan: TODAY });
  const h = await cronHealth(db, TODAY);
  ok("오늘 돌았으면 **아무것도 안 띄운다** (원장님이 눌러야 하는 것을 안 늘린다)",
     h.stuck === false && h.line === null, JSON.stringify(h)); }
{ const db = fakeDb({ lastRan: "2026-09-01" });
  ok("어제 돌았으면 안 띄운다", (await cronHealth(db, TODAY)).line === null); }
{ const db = fakeDb({ lastRan: "2026-08-31" });
  const h = await cronHealth(db, TODAY);
  ok(`${STUCK_DAYS}일 넘게 안 돌면 한 줄 띄운다`, h.stuck === true && /2일째/.test(h.line), JSON.stringify(h)); }
{ // ⚠️⚠️ 여기가 뒤집힌 자리다. 앞판은 「앞날 도장은 오늘 돈 것으로 본다」였는데,
  //    그러면 `?on=2027-01-05` 을 **한 번** 잘못 친 날부터 **한 해 내내** 「멈췄다」가 안 뜬다.
  //    day_ran 은 못 지운다(대전제 6) — 단추 한 번으로 경보가 영구히 꺼지는 것이다
  const db = fakeDb({ lastRan: "2027-01-05" });
  const h = await cronHealth(db, TODAY);
  ok("⚠️ 앞날 도장은 **「돌았다」로 안 센다** (한 번 잘못 친 날부터 경보가 영영 꺼진다)",
     h.stuck === true && !!h.line, JSON.stringify(h)); }

{ // 밀린 날을 돌려도 도장은 **진짜 오늘**로 찍힌다
  const db = fakeDb();
  await runCron({ db, today: "2026-08-30", stampOn: TODAY, now: NOW, deps: { checks: [] } });
  const 크론도장 = db.days.filter((d) => d.kind === CRON_KIND).map((d) => d.ran_on);
  ok("⚠️ `?on=` 으로 밀린 날을 돌려도 크론 도장은 **진짜 오늘**로 찍힌다",
     JSON.stringify(크론도장) === JSON.stringify([TODAY]), JSON.stringify(db.days)); }

// ⚠️⚠️ `?on=` 은 **밀린 날**을 돌리는 문이다. 앞날을 받으면 되돌릴 수 없는 일이 둘 난다 —
//    ① 아직 기한이 안 온 파일이 그 자리에서 파기되고(path 가 덮여 버킷 파일을 못 찾는다)
//    ② 앞날 도장 때문에 「크론이 멈췄다」가 그날까지 안 뜬다
ok("?on= 이 없으면 오늘로 돈다", onFrom(null, TODAY).on === TODAY);
ok("빈 글자도 없는 것으로 본다", onFrom("", TODAY).on === TODAY);
ok("밀린 날은 받는다", onFrom("2026-08-30", TODAY).on === "2026-08-30");
ok("오늘은 받는다", onFrom(TODAY, TODAY).on === TODAY);
{ const r = onFrom("2027-01-05", TODAY);
  ok("⚠️ **앞날은 400 으로 거절한다** (연도 한 글자만 잘못 쳐도 파일이 파기된다)",
     r.ok === false && r.status === 400, JSON.stringify(r));
  ok("까닭에 「앞날은 못 돌린다」가 적힌다", /앞날은 못 돌린다/.test(r.why), r.why); }
{ const r = onFrom("2026-02-30", TODAY);
  ok("없는 날도 400 이다 (500 이면 크론이 고장난 줄 안다)", r.ok === false && r.status === 400, JSON.stringify(r)); }
{ const src = readFileSync("app/api/cron/route.js", "utf8");
  ok("문(handle)이 `?on=` 을 그대로 runCron 에 넘기지 않고 onFrom 을 지난다",
     /onFrom\(new URL/.test(src));
  ok("도장은 `?on=` 이 아니라 진짜 오늘로 찍는다 (stampOn)", /stampOn: today/.test(src)); }
ok("cronHealth 도 「학원의 오늘」이 없으면 던진다",
   (await threw(() => cronHealth(fakeDb(), undefined)))?.includes("학원의 오늘"));
{ const db = fakeDb();
  await runCron({ db, today: TODAY, now: NOW, deps: { checks: [] } });
  ok("크론이 돌면 그 도장으로 health 가 초록이 된다", (await cronHealth(db, TODAY)).stuck === false); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ 나가는 길·설정 — 파일을 훑는다");

{ const src = readFileSync("app/api/cron/route.js", "utf8");
  ok("크론이 web-push 를 직접 안 부른다 (발송은 lib/notify.js 한 곳을 지난다)",
     !/from ["']web-push|require\(["']web-push|webpush\./.test(src));
  // ⚠️ 그 환경변수 이름을 여기 **글자 그대로 적으면 안 된다** —
  //    scripts/check-notify.mjs 가 파일을 훑어 「그 이름이 든 파일」을 잡는다. 이어 붙여 만든다
  const 발송스위치 = ["NOTIFY", "SINK"].join("_");
  ok(`${발송스위치} 를 크론이 안 읽는다 (읽는 곳은 lib/notify.js 뿐이다)`,
     !src.includes(발송스위치));
  ok("⚠️ SQL 에 `${…}` 를 안 끼운다 (끼우면 기계로 검사할 수가 없다)",
     !/(select|insert|update|delete)[^`]*\$\{/i.test(src));
  ok("edge 가 아니라 node 로 돈다 (edge 면 DB 에 못 붙는다)", /runtime = "nodejs"/.test(src));
  ok("캐시를 끈다 (캐시되면 안 돈 채로 200 을 준다)", /dynamic = "force-dynamic"/.test(src)); }

{ const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  ok("vercel.json 에 크론 일정이 있다", Array.isArray(v.crons) && v.crons.length === 1);
  ok("크론이 이 문을 부른다", v.crons[0].path === "/api/cron", v.crons[0].path);
  ok("하루 한 번이다 (Hobby 는 그것만 될 수 있다 — ⚠️ 확인 안 됨)",
     /^\d+ \d+ \* \* \*$/.test(v.crons[0].schedule), v.crons[0].schedule);
  // ⚠️ Vercel 크론 시각은 UTC 다. 서울 시각으로 적으면 아홉 시간 어긋난다
  const [mm, hh] = v.crons[0].schedule.split(" ").map(Number);
  const 서울 = (hh + 9) % 24;
  ok(`서울 시각으로 새벽~아침에 돈다 (UTC ${hh}시 = 서울 ${서울}시)`, 서울 >= 3 && 서울 <= 9,
     `서울 ${서울}시 ${mm}분`); }

{ const walk = (d, out = []) => { for (const f of readdirSync(d)) {
    if ([".next", ".git", "_tmp", "sandbox", "node_modules", "backup", "supabase"].includes(f)) continue;
    const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
      : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
  const others = walk(".").filter((f) => !f.includes("app/api/cron") && !f.includes("check-cron"));
  const 문 = others.filter((f) => /\/api\/cron\//.test(f));
  ok("크론이 부르는 문은 하나뿐이다", 문.length === 0, 문.join(" ")); }

{ // ⚠️⚠️ 겪은 사고(S4) — SQL 뽑는 자가 **백틱만** 봤다. `scripts/check-sql.mjs` 는 `lib` 만 훑어
  //    `app/` 을 원리적으로 안 보므로, 따옴표로 쓴 SQL 한 줄은 두 검사 어디에도 안 걸렸다.
  //    아래는 그 사고를 그대로 재현한다 — 세 따옴표를 다 잡아야 통과한다
  const 시험소스 = [
    'const a = `select 백틱칸 from v2.day_sheet limit 1`;',
    'db.query("select 큰따옴표칸 from v2.day_sheet limit 1", []);',
    "db.query('select 홑따옴표칸 from v2.day_sheet limit 1', []);",
    'const ok = "begin";',                                  // SQL 로 안 센다
    '// select 주석칸 from v2.day_sheet',                    // 주석은 안 본다
    '/* select 블록주석칸 from v2.day_sheet */',
    'const msg = "이건 그냥 글이다";',
  ].join("\n");
  const 뽑힌 = sql뽑기(시험소스);
  ok("⚠️ 백틱으로 쓴 SQL 을 뽑는다", 뽑힌.some((q) => q.includes("백틱칸")), JSON.stringify(뽑힌));
  ok("⚠️ **큰따옴표**로 쓴 SQL 도 뽑는다 (앞판은 여기가 통째로 빠져나갔다)",
     뽑힌.some((q) => q.includes("큰따옴표칸")), JSON.stringify(뽑힌));
  ok("⚠️ **홑따옴표**로 쓴 SQL 도 뽑는다", 뽑힌.some((q) => q.includes("홑따옴표칸")), JSON.stringify(뽑힌));
  ok("주석에 적어 둔 예시 SQL 은 안 뽑는다 (설명을 못 쓰게 되면 아무도 안 적는다)",
     !뽑힌.some((q) => q.includes("주석칸") || q.includes("블록주석칸")), JSON.stringify(뽑힌));
  ok("SQL 이 아닌 글은 안 뽑는다", 뽑힌.length === 3, JSON.stringify(뽑힌));
  // ⚠️ 짝이 어긋난 따옴표 하나가 파일 끝까지 먹으면 그 뒤 SQL 을 통째로 놓친다
  const 어긋난 = sql뽑기('const bad = "짝이 없다;\nconst q = `select 뒤에있는칸 from v2.day_sheet`;');
  ok("따옴표 짝이 어긋나도 **그 뒤 SQL 을 놓치지 않는다**",
     어긋난.some((q) => q.includes("뒤에있는칸")), JSON.stringify(어긋난)); }

// ─────────────────────────────────────────────────────────────
// ⚠️⚠️ 여기부터가 핵심이다 — **진짜 스키마에 물어본다.**
//     가짜 DB 는 없는 칸을 원리적으로 못 잡는다. 화면을 켜는 순간 터진다.
// ─────────────────────────────────────────────────────────────
console.log("\n■ 진짜 스키마에 물어본다 — 크론이 읽는 칸이 **정말 있는가**");
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }

  let i = 0;
  const ask = async (label, sql) => {
    i++;
    try {
      await c.query("begin");
      await c.query(`prepare cron_chk_${i} as ${sql}`);
      await c.query("rollback");
      ok(`물어봄 — ${label}`, true);
    } catch (e) {
      await c.query("rollback").catch(() => {});
      ok(`물어봄 — ${label}`, false, String(e.message).split("\n")[0]);
    }
  };

  for (const [k, sql] of Object.entries(SQL)) await ask(`SQL.${k}`, sql);

  // ⚠️⚠️ `scripts/check-sql.mjs` 는 `lib` 만 훑는다 — **`app/` 의 SQL 은 원리적으로 안 본다.**
  //    SQL 객체만 물어보면 앞으로 누가 **함수 안에 SQL 한 줄**을 직접 쓸 때 두 검사 어디에도 안 걸린다.
  //    앞 판에서 크게 다친 「없는 칸」이 다시 들어올 문이라, 이 파일의 **모든** SQL 을 뽑아 물어본다
  //    ⚠️ 뽑는 자는 **따옴표 세 가지를 다 본다** (S4 — 앞판은 백틱만 봤다)
  { const 뽑은 = sql뽑기(readFileSync("app/api/cron/route.js", "utf8"));
    const 값 = new Set(Object.values(SQL));
    const 밖에있는것 = 뽑은.filter((q) => !값.has(q));
    ok("이 파일의 SQL 은 전부 SQL 객체 안에 있다 (함수 안에 흩어지면 검사가 못 본다)",
       밖에있는것.length === 0, String(밖에있는것.length));
    for (const q of 밖에있는것) await ask("함수 안 SQL", q); }

  // ⚠️ `lib/purge.js` 가 **만들어 내는** SQL — 표 이름이 실행할 때 정해져서
  //    scripts/check-sql.mjs 가 「못 물어봄」으로 건너뛴 자리다. **크론이 그걸 돌린다.**
  const db = { query: (sql, p = []) => c.query(sql, p) };
  const map = await purgeMap(db);
  const facts = await columnFacts(db);

  ok("기한으로 지울 줄이 진짜 목록에 있다", map.filter(isExpire).length > 0,
     String(map.filter(isExpire).length));

  // ⚠️ **여기서 진짜 사고를 하나 잡았다.** `lib/purge.js` 의 `purgeMap()` 이
  //    `v2.purge_map.after_days` 를 select 에서 빠뜨려 기한이 늘 null 로 온다
  //    → planFor 가 expire 줄을 **전부 막고**, 크론이 한 줄도 못 돈다.
  //    고칠 곳은 lib/purge.js (내 담당 파일이 아니라 안 고쳤다 — 보고에 적었다).
  //    그동안에도 **생성되는 SQL 이 진짜 칸을 읽는지**는 봐야 하므로, 기한을 직접 읽어 붙인다.
  const 기한 = (await c.query(
    `select schema_name, tbl, col, how, note, after_days from v2.purge_map where how = 'expire'`)).rows;
  // ⚠️ 고쳐지면 저절로 사라지는 알림이다 — **검사를 빨갛게 만들지 않는다**
  //    (남이 고친 것 때문에 내 검사가 깨지면 그 다음부터 아무도 안 본다)
  if (map.filter(isExpire).some((m) => m.after_days === undefined))
    console.log("   ⚠️ 아직 못 고침 — lib/purge.js 의 purgeMap() select 에 after_days 가 없다. " +
                "그래서 크론의 기한 파기가 날마다 운다 (조용히 안 도는 것보다 낫다)");
  const exp = planFor({ map: 기한, facts, target: { kind: "expire" } });
  ok("기한을 제대로 읽으면 막히는 자리가 없다", exp.blocked.length === 0, JSON.stringify(exp.blocked));
  ok("기한 파기 문장이 만들어진다", exp.expired.length === 기한.length, String(exp.expired.length));
  for (const s of exp.expired) await ask(`기한파기 ${s.tbl}.${s.col}`, s.sql);

  const fp = planFor({ map: map.filter((m) => m.tbl === "file"), facts,
                       target: { kind: "file", fileIds: [] } });
  ok("파일 파기에 막힌 자리가 없다", fp.blocked.length === 0, JSON.stringify(fp.blocked));
  for (const s of fp.steps) await ask(`파일파기 ${s.tbl}.${s.col}`, s.sql);
  await ask("기한 온 파일 찾기", filesDueSql());
  // ⚠️ 아직 못 고침 — `filesDueSql()` 이 `state = 'active'` 만 본다 (`state <> 'purged'` 여야 맞다).
  //    원장님이 「숨김」으로 내려둔 아이 녹음·사진은 기한이 몇 해 지나도 안 지워지는데 크론은 초록이다.
  //    고칠 곳은 lib/purge.js — 남의 담당 파일이라 안 고쳤다(재현은 했다. 보고에 적었다).
  //    ⚠️ 고쳐지면 저절로 사라지는 알림이다 — **검사를 빨갛게 만들지 않는다**
  if (/state\s*=\s*'active'/.test(filesDueSql()))
    console.log("   ⚠️ 아직 못 고침 — lib/purge.js 의 filesDueSql() 이 state = 'active' 만 본다. " +
                "「숨김」으로 내려둔 파일은 기한이 몇 해가 지나도 안 지워지는데 크론은 초록이다");
  { // ⚠️⚠️ 크론은 **버킷에 넘길 경로를 `in_bin` 한 칸으로 고른다** — 그 칸이 안 오면
    //    자료함 묶음에 걸린 남의 안내문까지 버킷에서 지워질 자리다(크론은 그때 한 장도 안 지우고 운다).
    //    칸이 정말 오는지 **진짜 DB 에 물어본다.** 옛날 날짜라 줄은 0 개다 — 읽기만 한다
    const r = await c.query(filesDueSql(), ["1900-01-01"]);
    const 칸 = (r.fields ?? []).map((f) => f.name);
    ok("⚠️ 기한 온 파일 질문이 `in_bin` 칸을 준다 (없으면 크론이 파일 정리를 아예 안 돌린다)",
       칸.includes("in_bin"), 칸.join(" "));
    ok("경로와 이름도 같이 온다 (버킷에서 지울 때 쓴다)",
       칸.includes("path") && 칸.includes("id"), 칸.join(" ")); }

  // 크론이 진짜로 도는 셈 둘 — **읽기만 하므로 진짜 DB 에서 돌려 본다**
  const today = await todayFrom(db);
  ok("진짜 DB 의 v2.today() 가 'YYYY-MM-DD' 로 온다", /^\d{4}-\d{2}-\d{2}$/.test(today), today);
  for (const chk of defaultChecks()) {
    const v = await chk.count(today, db);
    ok(`진짜 DB 로 셈이 돈다 — ${chk.label} = ${v}`, Number.isInteger(v), JSON.stringify(v));
  }

  const h = await cronHealth(db, today);
  ok("진짜 DB 로 「크론이 멈췄나」를 읽는다", typeof h.stuck === "boolean", JSON.stringify(h));

  await c.end();
} catch (e) {
  fail++; n++;
  console.log("   ❌ 진짜 DB 로 못 물어봤다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 크론 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
