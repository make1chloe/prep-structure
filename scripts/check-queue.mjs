/** 자동화 뼈대 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  가짜 DB 를 끼워 lib/queue.js 를 진짜로 부르고, 무슨 줄이 남았는지 센다.
 *  (본보기: scripts/check-notify.mjs · scripts/check-sw.mjs)
 *
 *  계획 1-1 (e) 의 사고 자리 넷을 겨눈다:
 *   ① 실패해도 도장을 찍으면 재시도가 원리적으로 불가능하다 → 상태·시도·다음시도·잠금·오류
 *   ② 열쇠에 기준 날짜가 없으면 매주·매달이 **한 번만** 생기고 만다 (오류도 안 난다)
 *   ⑨ 크론이 훑는 것은 새 셈을 만들지 않는다
 *   ⑩ 크론은 「학원의 오늘」을 인자로 받는다
 */
import {
  push, take, done, failed, revive, stats, backoffAt, stateAfterFail,
  keyFor, keyRow, claimKey, claimOnce, pushOnce, autoRules, TRIGGERS,
  cycleOf, baseDateOf, planRecurring,
  ranToday, markRan, runOnce, sweep, guardDb,
  seoulToday, assertToday, addDays, daysBetween,
  MAX_TRIES, BACKOFF_MIN, LOCK_STALE_MIN,
} from "../lib/queue.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message); } };

// ⚠️ 중간에 터져도 **마지막 줄과 나가는 값은 반드시 남긴다** —
//    안 그러면 check-all.sh 에 「몇 건 중 몇 건 실패」가 안 찍혀 무엇이 깨졌는지 못 읽는다
const bail = (e) => { n++; fail++;
  console.log(`   ❌ 검사가 중간에 터졌다 — ${e?.message ?? e}`);
  console.log(`\n■ 자동화 뼈대 검사 ${n}건 · 실패 ${fail}`);
  process.exit(1); };
process.on("uncaughtException", bail);
process.on("unhandledRejection", bail);

// ─────────────────────────────────────────────────────────────
// 가짜 DB — job_queue · auto_key · day_ran · auto_rule 를 **실제 규칙대로** 흉내낸다
//   (유니크는 nulls not distinct, next_at 비교, for update skip locked 까지)
//
// ⚠️ 가짜 DB 의 함정: 흉내가 **진짜 SQL 을 안 읽으면**, SQL 쪽을 몰래 뒤집어도 검사가 통과한다.
//    (실제로 겪었다 — `case when` 을 `'fail'` 로 바꿔도 75건이 다 초록이었다.)
//    → ① 판단을 SQL 에서 lib/ 로 옮겼고, ② 아래 `must()` 로
//       **흉내가 기대는 구절이 SQL 에 실제로 있는지** 확인한다. 없으면 그 자리에서 던진다.
// ─────────────────────────────────────────────────────────────
function fakeDb(seed = {}) {
  const q = [], keys = [], days = [], sqls = [];
  const rules = seed.rules ?? [];
  let id = 0;
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const must = (s, what, ...bits) => { for (const b of bits) if (!s.includes(b))
    throw new Error(`⚠️ ${what} 의 SQL 에 「${b}」 가 없다 — 가짜 DB 의 흉내가 그것을 믿고 있다`); };

  return { q, keys, days, rules, sqls, async query(sql, p = []) {
    const s = norm(sql); sqls.push(s);

    if (s.includes("into v2.job_queue")) {
      must(s, "push", "insert into v2.job_queue(kind, payload, next_at)");
      const row = { id: ++id, kind: p[0], payload: p[1], state: "wait", tries: 0,
                    next_at: p[2], locked_at: null, last_error: null };
      q.push(row); return { rows: [{ ...row }] };
    }
    if (s.includes("v2.job_queue q set")) {                       // take
      // ⚠️ 이 넷이 하나라도 빠지면 큐가 조용히 망가진다 —
      //    wait 아닌 것을 집거나 · 예약을 앞당겨 쏘거나 · 시도가 안 늘어 무한 되살리기거나 · 두 번 집는다
      must(s, "take", "state='wait'", "next_at <= $1", "tries=tries+1", "for update skip locked");
      const [now, limit, kinds] = p;
      const pick = q.filter((r) => r.state === "wait" && r.next_at <= now
                                   && (!kinds || kinds.includes(r.kind)))
                    .sort((a, b) => (a.next_at < b.next_at ? -1 : a.next_at > b.next_at ? 1 : a.id - b.id))
                    .slice(0, limit);
      for (const r of pick) { r.state = "taking"; r.locked_at = now; r.tries++; }
      return { rows: pick.map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, tries: r.tries })) };
    }
    if (s.includes("set state='done'")) {
      const r = q.find((x) => x.id === p[0]); if (!r) return { rows: [] };
      r.state = "done"; r.locked_at = null; return { rows: [{ id: r.id, state: r.state }] };
    }
    if (s.includes("set state = $2, next_at = $3")) {              // failed
      // ⚠️ 상태를 SQL 이 정하면 안 된다 — lib/ 의 stateAfterFail() 이 정해 $2 로 온다
      must(s, "failed", "set state = $2", "last_error = $4", "where id = $1");
      const [jid, state, at, why] = p;
      const r = q.find((x) => x.id === jid); if (!r) return { rows: [] };
      if (!["wait", "fail"].includes(state))
        throw new Error(`⚠️ failed 가 넘긴 상태가 이상하다: ${state}`);
      r.state = state; if (state === "wait") r.next_at = at;
      r.locked_at = null; r.last_error = why;
      return { rows: [{ id: r.id, state: r.state, tries: r.tries, next_at: r.next_at }] };
    }
    if (s.startsWith("select id, kind, tries from v2.job_queue")) {  // revive ①
      must(s, "revive(읽기)", "state = 'taking'", "locked_at is not null", "locked_at < $1");
      return { rows: q.filter((r) => r.state === "taking" && r.locked_at && r.locked_at < p[0])
                      .map((r) => ({ id: r.id, kind: r.kind, tries: r.tries })) };
    }
    if (s.includes("set state = 'wait'") || s.includes("set state = 'fail'")) {  // revive ②③
      must(s, "revive(쓰기)", "where id = any($1)", "and state = 'taking'");
      const to = s.includes("set state = 'wait'") ? "wait" : "fail";
      for (const r of q) {
        if (!p[0].includes(r.id) || r.state !== "taking") continue;
        r.state = to; if (to === "wait") r.next_at = p[1];
        r.locked_at = null; r.last_error = r.last_error ?? (to === "wait" ? p[2] : p[1]);
      }
      return { rows: [] };
    }
    if (s.includes("group by state")) {
      const c = {}; for (const r of q) c[r.state] = (c[r.state] ?? 0) + 1;
      return { rows: Object.entries(c).map(([state, nn]) => ({ state, n: nn })) };
    }
    if (s.includes("into v2.auto_key")) {                          // unique nulls not distinct
      // ⚠️ ② 기준 날짜가 빠지면 매주·매달이 한 번만 생긴다. 칸 일곱이 다 있어야 한다
      must(s, "claimKey", "rule_id", "student_id", "book_id", "unit_id", "round", "nth",
           "base_date", "on conflict do nothing");
      if (p.length !== 7) throw new Error(`⚠️ auto_key 열쇠가 일곱 칸이 아니다: ${p.length}칸`);
      const k = JSON.stringify(p);
      if (keys.some((x) => x.k === k)) return { rows: [] };
      keys.push({ k, p }); return { rows: [{ made_at: "now" }] };
    }
    if (s.includes("from v2.auto_rule")) {
      must(s, "autoRules", "where active");
      return { rows: rules.filter((r) => r.active !== false && (p[0] == null || r.kind === p[0])) };
    }
    if (s.includes("from v2.day_ran")) {
      must(s, "ranToday", "kind=$1", "ran_on=$2");
      const hit = days.some((d) => d.kind === p[0] && d.ran_on === p[1]);
      return { rows: hit ? [{ "?column?": 1 }] : [] };
    }
    if (s.includes("into v2.day_ran")) {
      // ⚠️ on conflict do nothing 이 없으면 자물쇠가 아니라 그냥 줄 쌓기가 된다 — 두 번 돈다
      must(s, "markRan", "on conflict do nothing", "returning kind");
      if (days.some((d) => d.kind === p[0] && d.ran_on === p[1])) return { rows: [] };
      days.push({ kind: p[0], ran_on: p[1] }); return { rows: [{ kind: p[0] }] };
    }
    throw new Error("가짜 DB 가 모르는 SQL — 검사를 고쳐라: " + s.slice(0, 90));
  } };
}

const TODAY = "2026-08-31";                       // 월요일
const NOW = new Date("2026-08-31T01:00:00Z");
const later = (min) => new Date(NOW.getTime() + min * 60000);
const R = "00000000-0000-4000-c000-000000000001";  // 규칙
const S = "00000000-0000-4000-9000-000000000001";  // 학생
const B = "00000000-0000-4000-b000-000000000001";  // 교재
const U = "00000000-0000-4000-b100-000000000001";  // 단원

// ─────────────────────────────────────────────────────────────
console.log("■ ① 큐 — 상태 · 재시도 · 잠금 (실패해도 다시 집힌다)");

// 「다시 할까 굳힐까」는 SQL 이 아니라 lib/ 에 있다 — 그래서 여기서 바로 잰다
ok("첫 실패는 다시 대기로", stateAfterFail(1, MAX_TRIES) === "wait");
ok("시도가 다 차야 굳는다", stateAfterFail(MAX_TRIES - 1) === "wait" && stateAfterFail(MAX_TRIES) === "fail");
ok("backoff 가 점점 길어진다 (같은 벽에 계속 부딪히지 않는다)",
   BACKOFF_MIN.every((m, i) => i === 0 || m > BACKOFF_MIN[i - 1]), BACKOFF_MIN.join(","));
ok("시도가 표를 넘어도 마지막 간격을 쓴다 (터지지 않는다)",
   backoffAt(99, NOW).getTime() === NOW.getTime() + BACKOFF_MIN.at(-1) * 60000);

{ const db = fakeDb();
  const j = await push(db, "send", { to: "p1" }, { at: NOW });
  ok("넣으면 대기로 선다", j.state === "wait" && db.q.length === 1, JSON.stringify(j.state));
  await push(db, "send", null, { at: later(60) });
  const got = await take(db, { now: NOW });
  ok("때가 안 된 예약은 안 집힌다", got.length === 1 && got[0].id === j.id, `${got.length}건`);
  ok("집으면 시도 횟수가 오르고 잠금이 찍힌다",
     db.q[0].tries === 1 && db.q[0].state === "taking" && db.q[0].locked_at === NOW.toISOString());
  const g2 = await take(db, { now: NOW });
  ok("이미 집힌 것은 두 번 안 집힌다 (크론이 겹쳐도)", g2.length === 0, `${g2.length}건`);
  await done(db, j.id);
  ok("끝나면 됨으로 남는다 — 지우지 않는다 (대전제 6)",
     db.q[0].state === "done" && db.q.length === 2); }

{ const db = fakeDb();
  const j = await push(db, "send", null, { at: NOW });
  const [job] = await take(db, { now: NOW });
  const r = await failed(db, job, new Error("솔라피가 답이 없다"), { now: NOW });
  ok("⚠️ ① 실패하면 **다시 대기로 돌아온다** (재시도가 원리적으로 가능하다)", r.state === "wait", r.state);
  ok("다음 시도 시각이 뒤로 밀린다 (바로 다시 집어 무한 반복하지 않는다)",
     r.next_at === backoffAt(1, NOW).toISOString(), r.next_at);
  ok("마지막 오류가 남는다 (왜 실패했나)", db.q[0].last_error === "솔라피가 답이 없다");
  const now0 = await take(db, { now: NOW });
  ok("밀린 동안에는 안 집힌다", now0.length === 0, `${now0.length}건`);
  const again = await take(db, { now: later(BACKOFF_MIN[0] + 1) });
  ok("때가 되면 **다시 집힌다** — 이것이 「보낸 때 한 칸」으로는 못 하는 일",
     again.length === 1 && again[0].tries === 2, JSON.stringify(again)); }

{ const db = fakeDb();
  await push(db, "send", null, { at: NOW });
  let last = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    const [job] = await take(db, { now: later(i * 1000) });
    last = await failed(db, job, new Error("계속 실패"), { now: later(i * 1000) });
  }
  ok(`시도 ${MAX_TRIES}번이면 실패로 굳는다 (영원히 안 돈다)`, last.state === "fail", last.state);
  const more = await take(db, { now: later(999999) });
  ok("굳은 것은 다시 안 집힌다", more.length === 0, `${more.length}건`); }

console.log("\n■ 잠긴 채 죽은 일 되살리기");
{ const db = fakeDb();
  await push(db, "send", null, { at: NOW });
  await push(db, "send", null, { at: NOW });
  await take(db, { now: NOW });                                   // 둘 다 집고 죽었다 치자
  const soon = await revive(db, { now: later(LOCK_STALE_MIN - 1) });
  ok("아직 도는 일은 안 건드린다", soon.length === 0, `${soon.length}건`);
  const back = await revive(db, { now: later(LOCK_STALE_MIN + 1) });
  ok("오래 잠긴 일은 되살린다", back.length === 2 && back.every((r) => r.state === "wait"),
     JSON.stringify(back.map((r) => r.state)));
  ok("왜 되살렸는지가 남는다", db.q[0].last_error?.includes("잠긴 채"), db.q[0].last_error);
  const got = await take(db, { now: later(LOCK_STALE_MIN + 2) });
  ok("되살린 일은 실제로 다시 집힌다", got.length === 2, `${got.length}건`); }

{ const db = fakeDb();
  // 프로세스를 통째로 죽이는 일 — 「집고 죽는다 → 되살린다」를 되풀이한다.
  // ⚠️ 끝나는 자리에 영영 못 닿으므로, 시도를 **집을 때** 안 올리면 여기서 무한루프가 된다
  await push(db, "boom", null, { at: NOW });
  for (let i = 0; i < MAX_TRIES; i++) {
    await take(db, { now: later(i * 1000) });                    // 집자마자 죽었다
    await revive(db, { now: later(i * 1000 + LOCK_STALE_MIN + 1) });
  }
  ok("⚠️ 집을 때 시도를 올린다 — 프로세스가 죽어도 횟수가 는다",
     db.q[0].tries === MAX_TRIES, `${db.q[0].tries}번`);
  ok("시도가 다 찬 일은 되살리지 않고 굳힌다 (되살리기 무한루프 없음)",
     db.q[0].state === "fail", db.q[0].state);
  const more = await take(db, { now: later(999999) });
  ok("굳은 뒤로는 크론이 그것만 붙잡지 않는다", more.length === 0, `${more.length}건`); }

{ const db = fakeDb();
  await push(db, "a", null, { at: NOW }); await push(db, "b", null, { at: NOW });
  await take(db, { now: NOW, limit: 1 });
  const before = db.sqls.length;
  const c = await stats(db);
  ok("상태별로 센다", c.wait === 1 && c.taking === 1 && c.done === 0, JSON.stringify(c));
  ok("⚠️ 원칙 5 — 센 값을 저장하지 않는다",
     db.sqls.slice(before).every((s) => /^select/.test(s)), db.sqls.slice(before).join(" | ")); }

{ const db = fakeDb();
  await push(db, "a", null, { at: NOW }); await push(db, "b", null, { at: NOW });
  const got = await take(db, { now: NOW, kinds: ["b"] });
  ok("갈래를 골라 집을 수 있다 (문자와 정리를 따로 돌린다)",
     got.length === 1 && got[0].kind === "b", JSON.stringify(got.map((x) => x.kind))); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ ② 자동 생성 열쇠 — 기준 날짜가 없으면 한 번만 생기고 만다");

ok("계기 넷이 계획서 표 그대로다",
   JSON.stringify(TRIGGERS.weekly.fill) === '["ruleId","baseDate"]' &&
   JSON.stringify(TRIGGERS.new_student.fill) === '["ruleId","studentId"]' &&
   JSON.stringify(TRIGGERS.book_end.fill) === '["ruleId","studentId","bookId","round"]' &&
   JSON.stringify(TRIGGERS.retest.fill) === '["ruleId","studentId","unitId","nth"]');

ok("매주 열쇠에 기준 날짜가 없으면 **그 자리에서 던진다**",
   (await threw(() => keyFor("weekly", { ruleId: R })))?.includes("기준 날짜"));
ok("신규 학생 열쇠에 기준 날짜를 채우면 던진다 (날마다 새로 생긴다)",
   (await threw(() => keyFor("new_student", { ruleId: R, studentId: S, baseDate: TODAY })))
     ?.includes("채우면"));
ok("모르는 계기는 던진다", (await threw(() => keyFor("몰라", { ruleId: R })))?.includes("모르는 계기"));
ok("열쇠 칸 순서가 DB 유니크 순서와 같다",
   JSON.stringify(keyRow(keyFor("book_end", { ruleId: R, studentId: S, bookId: B, round: 2 })))
   === JSON.stringify([R, S, B, null, 2, null, null]));

{ const db = fakeDb();
  const weeks = ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"];
  let made = 0;
  for (const w of weeks) if (await claimOnce(db, "weekly", { ruleId: R, baseDate: w })) made++;
  ok("매주 — 주가 바뀌면 새로 생긴다 (4주 → 4건)", made === 4, `${made}건`);
  let again = 0;
  for (const w of weeks) if (await claimOnce(db, "weekly", { ruleId: R, baseDate: w })) again++;
  ok("같은 주에 크론이 또 돌아도 안 생긴다", again === 0, `${again}건`); }

{ const db = fakeDb();
  // ⚠️ 사고 재현 — 기준 날짜를 열쇠에서 빼 보면 4주가 **1건으로 뭉개진다**
  let made = 0;
  for (let i = 0; i < 4; i++)
    if (await claimKey(db, { ruleId: R, studentId: null, bookId: null, unitId: null,
                             round: null, nth: null, baseDate: null })) made++;
  ok("⚠️ 기준 날짜를 빼면 4주가 **1건으로 뭉개진다** — 이게 안 잡히면 몇 주 뒤에 안다",
     made === 1, `${made}건`); }

{ const db = fakeDb();
  let made = 0;
  for (const d of daysBetween("2026-08-25", "2026-08-31"))
    if (await claimOnce(db, "new_student", { ruleId: R, studentId: S })) made++;
  ok("신규 학생 — 이레를 돌려도 **평생 한 번**", made === 1, `${made}건`); }

{ const db = fakeDb();
  const a = await claimOnce(db, "book_end", { ruleId: R, studentId: S, bookId: B, round: 1 });
  const b = await claimOnce(db, "book_end", { ruleId: R, studentId: S, bookId: B, round: 1 });
  const c = await claimOnce(db, "book_end", { ruleId: R, studentId: S, bookId: B, round: 2 });
  ok("교재 끝나감 — 같은 회독은 한 번, 2회독은 다시 뜬다", a && !b && c, `${a}·${b}·${c}`); }

{ const db = fakeDb();
  const a = await claimOnce(db, "retest", { ruleId: R, studentId: S, unitId: U, nth: 1 });
  const b = await claimOnce(db, "retest", { ruleId: R, studentId: S, unitId: U, nth: 1 });
  const c = await claimOnce(db, "retest", { ruleId: R, studentId: S, unitId: U, nth: 2 });
  ok("재시험 — 몇 번째가 달라야 다시 뜬다", a && !b && c, `${a}·${b}·${c}`); }

{ const db = fakeDb();
  // ⚠️ 마감일은 열쇠가 아니다 — 원장님이 미뤄도 크론이 새로 안 만든다
  const key = { ruleId: R, baseDate: "2026-08-31" };
  await claimOnce(db, "weekly", key);
  const dueMoved = await claimOnce(db, "weekly", key);           // 마감만 미뤘다 치고 다시 돌린다
  ok("⚠️ 마감일을 미뤄도 열쇠는 그대로 → 할일이 새로 안 생긴다", dueMoved === false); }

{ const db = fakeDb();
  const a = await pushOnce(db, "weekly", { ruleId: R, baseDate: TODAY }, "send", { x: 1 }, { at: NOW });
  const b = await pushOnce(db, "weekly", { ruleId: R, baseDate: TODAY }, "send", { x: 1 }, { at: NOW });
  ok("큐에 한 번만 넣기 — 두 번째는 안 들어간다", a && b === null && db.q.length === 1, `${db.q.length}건`); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ 되풀이 — 밀린 것을 따라잡고, 모르는 주기는 짐작하지 않는다");

ok("주기 글자를 알아본다", cycleOf("weekly") === "weekly" && cycleOf("@매달") === "monthly"
   && cycleOf("매년") === "yearly");
ok("⚠️ 다섯 칸짜리 cron 은 **짐작하지 않고 null** (틀리게 짐작하면 ② 사고가 그대로 난다)",
   cycleOf("0 6 * * 1") === null, String(cycleOf("0 6 * * 1")));
ok("주의 기준 날짜는 그 주 월요일", baseDateOf("weekly", "2026-09-02") === "2026-08-31");
ok("달·해의 기준 날짜는 1일 · 1월 1일",
   baseDateOf("monthly", "2026-09-02") === "2026-09-01" &&
   baseDateOf("yearly", "2026-09-02") === "2026-01-01");

{ const db = fakeDb({ rules: [{ id: R, kind: "todo", name: "주간 정리", cron: "weekly", active: true }] });
  const seen = [];
  const r = await planRecurring(db, { today: TODAY, since: "2026-08-10",
    make: (x) => { seen.push(x.baseDate); } });
  ok("크론이 3주 멈췄다 돌아와도 **네 주치가 다 선다**",
     r.made.length === 4 && seen.length === 4, JSON.stringify(seen));
  const r2 = await planRecurring(db, { today: TODAY, since: "2026-08-10", make: () => { seen.push("또"); } });
  ok("다시 돌려도 안 늘어난다", r2.made.length === 0 && r2.already === 4 && seen.length === 4); }

{ const db = fakeDb({ rules: [{ id: R, kind: "todo", name: "이상한 규칙", cron: "0 6 * * 1", active: true }] });
  const r = await planRecurring(db, { today: TODAY, make: () => {} });
  ok("모르는 주기는 만들지 않고 **건너뛴 것으로 돌려준다** (화면이 알 수 있다)",
     r.made.length === 0 && r.skipped.length === 1 && r.skipped[0].why.includes("주기를 모른다"),
     JSON.stringify(r.skipped)); }

{ const db = fakeDb({ rules: [] });
  const r = await planRecurring(db, { today: TODAY,
    rules: [{ id: R, name: "꺼둔 규칙", cron: "weekly", active: false }], make: () => {} });
  ok("꺼 둔 규칙은 안 돈다", r.made.length === 0 && r.skipped[0].why === "꺼져 있다"); }

{ const db = fakeDb({ rules: [{ id: R, kind: "todo", name: "켠 것", cron: "weekly", active: true },
                              { id: "x", kind: "todo", name: "끈 것", cron: "weekly", active: false }] });
  ok("DB 에서 읽을 때도 꺼진 것은 안 온다", (await autoRules(db)).length === 1); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ ⑥⑨ 「오늘 이거 이미 돌았나」 — 셈은 lib/ 것을 부르기만 한다");

{ const db = fakeDb();
  ok("아직 안 돌았다", (await ranToday(db, "정리", TODAY)) === false);
  ok("도장을 찍으면 처음은 true", (await markRan(db, "정리", TODAY)) === true);
  ok("두 번째는 false — 이것이 자물쇠다", (await markRan(db, "정리", TODAY)) === false);
  ok("돌았다고 나온다", (await ranToday(db, "정리", TODAY)) === true);
  ok("날이 바뀌면 다시 돈다", (await markRan(db, "정리", addDays(TODAY, 1))) === true); }

{ const db = fakeDb(); let ran = 0;
  const a = await runOnce(db, "정리", TODAY, () => { ran++; return 3; });
  const b = await runOnce(db, "정리", TODAY, () => { ran++; return 3; });
  ok("하루 한 번만 돈다", ran === 1 && a.ran === true && b.ran === false, `${ran}번`);
  ok("돌린 결과를 돌려준다", a.result === 3); }

{ const db = fakeDb(); let ran = 0;
  const slow = () => new Promise((r) => setTimeout(() => { ran++; r(1); }, 5));
  await Promise.all([runOnce(db, "정리", TODAY, slow), runOnce(db, "정리", TODAY, slow)]);
  ok("크론 둘이 같은 순간에 돌아도 한 번만 (도장을 먼저 찍는다)", ran === 1, `${ran}번`); }

{ const db = fakeDb();
  const r = await runOnce(db, "정리", TODAY, () => { throw new Error("셈이 터졌다"); }, { now: NOW });
  ok("실패해도 도장은 안 지운다 (대전제 6)", db.days.length === 1);
  ok("대신 **큐에 재시도를 넣는다** — 큐가 상태·backoff 를 이미 들고 있다",
     db.q.length === 1 && db.q[0].kind === "정리" && r.retryJobId === db.q[0].id, JSON.stringify(r));
  ok("무엇이 터졌는지 돌려준다", r.ok === false && r.error === "셈이 터졌다", r.error); }

{ const db = fakeDb();
  // ⑨ 셈이 DB 에 쓰려 들면 그 자리에서 터진다
  const bad = { kind: "미납", count: async (t, ro) =>
    ro.query("insert into v2.notify_log(kind,sink) values ('x','off')") };
  const out = await sweep(db, { today: TODAY, checks: [bad] });
  // ⚠️ 「notify_log 가 오류에 들었나」로 재면 안 된다 — 방패를 빼도 가짜 DB 가 같은 글자로 터져
  //    검사가 헛통과한다 (실제로 그랬다). **방패가 낸 말인지**를 잰다
  ok("⚠️ ⑨ 셈이 DB 에 쓰려 하면 막는다 (크론이 셈을 한 벌 더 만들지 않는다)",
     out[0].ok === false && out[0].error.includes("셈은 DB 에 쓰지 않는다")
       && out[0].error.includes("notify_log"), JSON.stringify(out[0].error));
  ok("막힌 것도 큐에 재시도로 남는다 (조용히 사라지지 않는다)", db.q.length === 1); }

{ const db = fakeDb(); const called = [];
  const checks = [
    { kind: "보강잡을것", count: async (t) => { called.push(["보강", t]); return 2; } },
    { kind: "미납",       count: async (t) => { called.push(["미납", t]); return 0; } },
  ];
  const shot = [];
  const out = await sweep(db, { today: TODAY, checks, on: (k, v) => shot.push([k, v]) });
  ok("셈을 부르기만 한다 — 「학원의 오늘」을 그대로 넘긴다",
     JSON.stringify(called) === JSON.stringify([["보강", TODAY], ["미납", TODAY]]), JSON.stringify(called));
  ok("셈 결과로 알림을 만든다", JSON.stringify(shot) === JSON.stringify([["보강잡을것", 2], ["미납", 0]]));
  ok("DB 에는 day_ran 만 남는다 (셈 결과를 저장하지 않는다 — 원칙 5)",
     db.days.length === 2 && db.q.length === 0 && db.keys.length === 0);
  ok("모두 돌았다", out.every((r) => r.ran && r.ok));
  const out2 = await sweep(db, { today: TODAY, checks, on: () => shot.push("또") });
  ok("같은 날 다시 훑어도 안 돈다", out2.every((r) => r.ran === false) && shot.length === 2); }

{ const db = { async query() { return { rows: [] }; } };   // 그냥 통과시키는 DB
  const g = guardDb(db, ["day_ran"]);
  ok("허용한 표에는 쓸 수 있다",
     (await threw(() => g.query("insert into v2.day_ran(kind, ran_on) values ($1,$2)", ["k", TODAY]))) === null);
  ok("허용 안 한 표는 막는다",
     (await threw(() => g.query("update v2.students set name='x'")))?.includes("students"));
  ok("읽기는 언제나 통과", (await threw(() => g.query("select 1 from v2.day_ran"))) === null); }

// ─────────────────────────────────────────────────────────────
console.log("\n■ ⑩ 「학원의 오늘」을 인자로 받는다 — 서버 시간으로 안 돈다");

ok("서울 기준으로 낸다 (UTC 밤 11시는 서울 다음날)",
   seoulToday(new Date("2026-09-01T23:00:00Z")) === "2026-09-02",
   seoulToday(new Date("2026-09-01T23:00:00Z")));
ok("UTC 낮은 같은 날", seoulToday(new Date("2026-09-01T03:00:00Z")) === "2026-09-01");

for (const [name, fn] of [
  ["sweep",         () => sweep(fakeDb(), { checks: [] })],
  ["runOnce",       () => runOnce(fakeDb(), "k", undefined, () => {})],
  ["planRecurring", () => planRecurring(fakeDb(), { rules: [] })],
  ["ranToday",      () => ranToday(fakeDb(), "k")],
  ["markRan",       () => markRan(fakeDb(), "k")],
]) ok(`${name} — 오늘을 안 주면 던진다`, (await threw(fn))?.includes("학원의 오늘"));

ok("Date 객체를 주면 던진다 (그게 서버 시간으로 도는 길이다)",
   (await threw(() => sweep(fakeDb(), { today: new Date(), checks: [] })))?.includes("Date"));
ok("없는 날은 던진다", (await threw(() => assertToday("2026-02-30")))?.includes("없는 날"));

// ─────────────────────────────────────────────────────────────
console.log("\n■ 이 표들에 다른 곳에서 손대지 않는가 — 파일을 훑는다");
const walk = (d, out = []) => { for (const f of readdirSync(d)) {
  if ([".next", ".git", "_tmp", "sandbox", "node_modules", "backup", "supabase"].includes(f)) continue;
  const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
    : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
const files = walk(".").filter((f) => !f.endsWith("lib/queue.js") && !f.includes("check-queue"));
const WRITE = /(insert\s+into|update|delete\s+from)\s+v2\.(job_queue|auto_key|day_ran)\b/i;
const bad = files.filter((f) => WRITE.test(readFileSync(f, "utf8")));
ok("job_queue · auto_key · day_ran 에 쓰는 곳은 lib/queue.js 뿐이다", bad.length === 0, bad.join(" "));

console.log(`\n■ 자동화 뼈대 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
