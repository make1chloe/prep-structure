/**
 * 크론 — **서버의 시계.** Vercel Cron 이 부르는 하나뿐인 문이다.
 *
 * 왜 있나 — 옛 앱은 시계가 없어서 「사람이 앱을 열 때 밀린 것이 나갔다」.
 * 그날 아무도 그 자리를 안 지나가면 **정리가 안 돌고 예약 발송이 안 나갔다.**
 * 여기가 그 시계다 (계획 「Vercel ③」).
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────────
 *  ⑨ **크론은 새 셈을 만들지 않는다.** `lib/` 의 셈을 **부르기만** 하고
 *     DB 에는 「그날 이거 이미 돌았나」(`v2.day_ran`)만 남긴다.
 *     → 셈에 넘기는 DB 는 `lib/queue.js` 의 `guardDb` 가 **쓰기를 막은 껍데기**다.
 *  ⑩ **「학원의 오늘」을 인자로 받는다.** 서버 시간(UTC)으로 돌면
 *     시간대 통일이 **크론에서만** 깨진다. 오늘은 `v2.today()` 에서 받아 온다.
 *  · 되풀이 할일도 **여기서 안 만든다** — `lib/todo.js` 의 `planRepeats` 를 부른다.
 *    ⚠️ `lib/queue.js` 의 `planRecurring` 을 **직접 부르지 마라.** `make` 없이 부르면
 *       도장(`auto_key`)만 찍혀 **할일은 영영 안 생기는데 「이미 만들었다」로 굳는다.**
 *  · 발송은 `lib/notify.js` 한 곳을 지난다 — 여기서 web-push 를 부르지 않는다.
 *  · 한 일이 실패해도 **나머지는 돈다.**
 *  · 열쇠(`CRON_SECRET`)가 없으면 **아예 안 돈다.**
 *
 * ⚠️ **여기에 셈을 새로 적지 마라.** 적는 순간 같은 셈이 두 벌이 되고(원칙 4),
 *    두 벌이 어긋나는 날 어느 쪽이 맞는지 아무도 모른다.
 *    새 셈이 필요하면 `lib/` 에 넣고 여기서 부른다.
 *
 * ── 일정 (`vercel.json` — JSON 이라 주석을 못 달아 여기 적는다) ─────
 *   `{ "path": "/api/cron", "schedule": "0 20 * * *" }`
 *   ⚠️ **Vercel 크론 시각은 UTC 다.** `0 20` = **서울 아침 5시** (다음 날).
 *      서울 시각으로 적으면 아홉 시간 어긋나 한밤중에 돈다.
 *   ⚠️ **확인 안 됨** — 요금제마다 크론 횟수·주기 제한이 다르다. Hobby 는
 *      **하루 한 번**만 되고 시각도 「그 시간 안 어딘가」로 느슨할 수 있다.
 *      그래서 **하루 한 번으로도 도는 모양**으로 짰다 —
 *      `day_ran` 이 자물쇠라 여러 번 불려도 훑기는 하루 한 번만 돈다.
 *   · 밀린 날을 손으로 돌릴 때: `?on=2026-08-30` (열쇠가 있어야 한다)
 */

import { createHash, timingSafeEqual } from "node:crypto";

// ⚠️ `@/lib/…` 별칭을 쓰지 않는다 — 별칭은 Next 안에서만 풀린다.
//    `scripts/check-cron.mjs` 가 이 파일을 **그냥 node 로 불러** 검사하므로 상대 경로여야 한다
import {
  assertToday, addDays, daysBetween, guardDb, sweep, take, done, failed, revive,
  markRan, stats,
} from "../../../lib/queue.js";
// ⚠️ 되풀이 할일을 **여기서 만들지 않는다.** 줄을 세우는 셈은 lib/todo.js, 열쇠·따라잡기는
//    lib/queue.js 에 이미 있다 — 크론은 그 둘을 부르기만 한다 (⑨ · 원칙 1)
import { planRepeats, academyDays } from "../../../lib/todo.js";
import {
  purgeFiles, filesDue, purgeMap, columnFacts, planFor, isExpire,
} from "../../../lib/purge.js";
import { plannedAttend } from "../../../lib/attend.js";
import { monthBoard } from "../../../lib/session.js";

// ⚠️ `pg` 를 쓰므로 edge 가 아니라 node 여야 한다. edge 로 돌면 DB 에 못 붙는다
export const runtime = "nodejs";
// ⚠️ 크론은 캐시되면 **안 돈 채로 200 을 돌려준다.** 그날 정리가 통째로 빠지고 오류도 안 난다
export const dynamic = "force-dynamic";
// ⚠️ 확인 안 됨 — 요금제마다 함수 최대 시간이 다르다. 60초가 안 되면 Vercel 이 빌드 때 말해 준다
export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────
// 0. 이 파일이 DB 에 묻는 것 — **전부 읽기다**
//
// ⚠️ SQL 안에 `${…}` 를 끼우지 않는다. 끼우면 기계로 검사할 수가 없다.
//    값은 $1 로 넘긴다. 아래 여섯은 `scripts/check-cron.mjs` 가
//    **진짜 스키마에 PREPARE** 해서 없는 칸을 읽는지 본다.
// ⚠️⚠️ **SQL 을 함수 안에 흩지 말고 반드시 여기 담아라.** `scripts/check-sql.mjs` 는
//    `lib` 만 훑어서 `app/` 의 SQL 을 **원리적으로 안 본다.** 함수 안에 한 줄 쓰면
//    두 검사 어디에도 안 걸린다 — 앞 판에서 크게 다친 「없는 칸」이 다시 들어오는 문이다.
//    (check-cron 이 이 파일의 SQL 을 **전부 뽑아** 물어보고, 객체 밖에 있으면 빨갛게 한다)
// ─────────────────────────────────────────────────────────────
export const SQL = {
  /** 「학원의 오늘」 — ⚠️ `::text` 를 빼지 마라. date 로 받으면 node-pg 가
   *  **그 기계 시간대의 자정** Date 로 주고, UTC 서버에서 하루가 어긋난다 */
  today: `select v2.today()::text as d`,

  /** 크론이 마지막으로 돈 날 — 「크론이 멈춘 것을 앱이 알아챈다」
   *  ⚠️⚠️ `and ran_on <= $2` 를 **빼지 마라.** 손으로 `?on=2027-01-05` 을 한 번 잘못 치면
   *     앞날 도장이 박히는데 `day_ran` 은 **못 지운다**(대전제 6). 그 도장을 세면
   *     그 뒤로 크론이 죽어도 **그날까지 「멈췄다」가 한 줄도 안 뜬다.**
   *     문(handle)에서 앞날을 400 으로 막고, 여기서 한 겹 더 막는다. */
  lastRan: `select max(ran_on)::text as last_on from v2.day_ran
             where kind = $1 and ran_on <= $2`,

  /** ⚠️ **아무도 안 집는 일감** — 크론이 모르는 갈래는 큐에 쌓이기만 한다.
   *  세어서 내놓지 않으면 문자가 안 나간 것을 학부모가 먼저 안다 */
  waiting: `select kind, count(*)::int as n from v2.job_queue
             where state = 'wait' and next_at <= $1 group by kind order by kind`,

  /** 때가 된 예약 발송 — ⚠️ **세기만 한다.** 아래 「예약 발송」 주석을 봐라 */
  dueSend: `select count(*)::int as n from v2.scheduled_send
             where sent_at is null and cancelled_at is null and at <= $1`,

  /** 기한이 온 파일 중 **정말로 줄이 내려간 것**만 가린다.
   *  ⚠️⚠️ 자료함 묶음에 걸린 파일은 `lib/purge.js` 가 **일부러 줄을 안 내린다**
   *     (한 집 퇴원으로 옥련여고 안내가 통째로 사라지면 안 되니까).
   *     그 경로를 버킷에서 지우면 DB 는 「살아 있다」인데 파일만 없어져
   *     **다른 아이 화면이 깨진 링크가 되고 오류는 아무 데도 안 남는다.** */
  fileState: `select id, state from v2.file where id = any($1)`,

  /** 「저장 공간 정리가 원리적으로 도는가」.
   *  ⚠️ 기한이 온 것이 0 인 것은 **「깨끗해서」가 아니라 「아무도 purge_on 을 안 적어서」**일 수 있다.
   *     둘을 가르지 않으면 파일 정리가 통째로 안 도는데 날마다 초록이다. */
  filePlan: `select count(*)::int as n_live, count(purge_on)::int as n_planned
               from v2.file where state <> 'purged'`,
};

// ─────────────────────────────────────────────────────────────
// 1. 열쇠 — 바깥에서 아무나 못 부르게
// ─────────────────────────────────────────────────────────────

/** Vercel Cron 은 `CRON_SECRET` 이 있으면 `Authorization: Bearer <열쇠>` 로 부른다 */
export function keyFromReq(req) {
  const h = req?.headers;
  const auth = (h?.get?.("authorization") ?? "").trim();
  if (/^bearer /i.test(auth)) return auth.slice(7).trim();
  // 손으로 불러 볼 때 (curl -H 'x-cron-secret: …'). ⚠️ 주소(?key=)로는 안 받는다 —
  //    주소는 접속 기록에 그대로 남아서 열쇠가 로그에 굳는다
  return (h?.get?.("x-cron-secret") ?? "").trim() || null;
}

const sha = (s) => createHash("sha256").update(String(s)).digest();
/** ⚠️ 길이가 달라도 안 터지게 **해시를 비교**한다. `===` 는 글자 수로 열쇠를 알려 준다 */
function sameKey(a, b) { return timingSafeEqual(sha(a), sha(b)); }

/**
 * ⚠️⚠️ **「열쇠가 환경변수에 없으니 그냥 통과」가 최악이다.**
 *    그러면 주소를 아는 누구나 파기·발송을 돌릴 수 있고, 아무 오류도 안 난다.
 *    → 열쇠가 없으면 **한 일도 안 하고 500** 으로 크게 운다.
 *      (401 로 조용히 두면 「크론이 원래 안 도나 보다」로 넘어간다)
 */
export function keyCheck(req, env = process.env) {
  const want = String(env?.CRON_SECRET ?? "").trim();
  if (!want) return { ok: false, status: 500,
    why: "⚠️ CRON_SECRET 이 환경변수에 없다 — 크론을 아예 안 돌린다. Vercel 환경변수에 넣어라" };
  const got = keyFromReq(req);
  if (!got || !sameKey(got, want)) return { ok: false, status: 401, why: "열쇠가 다르다" };
  return { ok: true, status: 200 };
}

// ─────────────────────────────────────────────────────────────
// 2. 「크론이 멈췄다」 — 대시보드가 부르는 자리
// ─────────────────────────────────────────────────────────────

/** 크론이 돌았다는 도장의 갈래. ⚠️ 바꾸면 지난 도장을 못 읽어 **하루는 멈춘 것처럼 보인다** */
export const CRON_KIND = "크론";
/** 이만큼 안 돌면 대시보드에 한 줄. **안 돌 때만 부른다** (대전제 3) */
export const STUCK_DAYS = 2;

/**
 * 크론이 살아 있나. **대시보드가 이 함수를 부른다** — 화면이 따로 세지 않는다(원칙 1).
 * @returns {{ last, days, stuck, line }}  line 이 null 이면 **아무것도 안 띄운다**
 */
export async function cronHealth(db, today, opts = {}) {
  assertToday(today, "cronHealth");
  // ⚠️ 오늘까지의 도장만 센다 — 앞날 도장은 「돌았다」가 아니다 (SQL.lastRan 주석)
  const { rows } = await db.query(SQL.lastRan, [opts.kind ?? CRON_KIND, today]);
  const last = rows?.[0]?.last_on ?? null;
  if (!last) return { last: null, days: null, stuck: true,
    line: "크론이 한 번도 안 돌았다 — 예약 발송·파일 정리가 서 있다" };
  // ⚠️ 도장이 오늘보다 앞이면(손으로 ?on= 을 돌린 날) 0 으로 본다. 음수로 세면 「멈췄다」가 뜬다
  const days = last >= today ? 0 : daysBetween(last, today).length - 1;
  const stuck = days >= (opts.stuckDays ?? STUCK_DAYS);
  return { last, days, stuck,
    line: stuck ? `크론이 ${days}일째 안 돌았다 — 예약 발송·파일 정리가 서 있다` : null };
}

// ─────────────────────────────────────────────────────────────
// 3. 하루 한 번 훑기 — **셈은 lib 에서 부르기만 한다** (⑨)
// ─────────────────────────────────────────────────────────────

/**
 * ⚠️ 여기 있는 것은 **전부 `lib/` 의 셈을 부르는 얇은 껍데기**다.
 *    `count` 가 받는 db 는 `guardDb` 가 쓰기를 막은 껍데기라,
 *    셈이 DB 에 쓰려 들면 **그 자리에서 터진다.**
 */
export function defaultChecks() {
  return [
    { kind: "결석지각예정", label: "결석·지각 예정",
      count: async (today, db) => (await plannedAttend(db, { today })).rows.length },
    { kind: "회차모자람", label: "이 달 회차가 8회 안 되는 반",
      count: async (today, db) =>
        (await monthBoard(db, today.slice(0, 7), { today })).filter((c) => !c.enough).length },
  ];
}

/**
 * ⚠️⚠️ **아직 안 세는 것.** 계획 (e) ⑨ 는 넷을 꼽았는데 그 중 둘은
 *    세는 함수가 `lib/` 에 아직 없다. **여기서 SQL 로 새로 세지 않는다** — 그게 원칙 4 위반이다.
 *    함수가 생기면 위 `defaultChecks()` 에 한 줄 더하면 된다.
 */
export const NOT_COUNTED = [
  { what: "안 보낸 판", why: "세는 함수가 lib 에 아직 없다 (발송 담당 자리)" },
  { what: "교재 끝나감", why: "세는 함수가 lib 에 아직 없다 — v2.book_progress() 를 학생 전체로 도는 자리" },
  { what: "미납", why: "세는 함수가 lib 에 아직 없다 (수강료 담당 자리)" },
];

/**
 * ⚠️⚠️ **아예 안 도는 것.** 「안 세는 것」과 다르다 — 이쪽은 셈이 아니라 **일**이 안 돈다.
 *    대전제 0 은 모르는 것을 **적으라는** 것이지 빼라는 것이 아니다.
 *    ⚠️ 선언을 안 하면 오류도 안 나고 화면이 비지도 않아 **몇 주 뒤에나 안다** (계획 (e) ②).
 */
export const NOT_RUN = [
  { what: "되풀이 할일 중 **주기 글자를 모르는 규칙**",
    why: "`lib/queue.js` 의 cycleOf 는 매일·매주·매달·매년만 읽는다. 다섯 칸짜리 진짜 cron 은 "
       + "계획서에 형식이 없어 아직 안 받는다(지어내지 않았다). 그 규칙은 「되풀이할일 · 건너뜀」에 이름이 뜬다",
    어디: "lib/queue.js 의 cycleOf" },
  { what: "파일 보관 기한(purge_on) 적기",
    why: "채우는 코드가 앱에 한 줄도 없다 — 그래서 파일 정리가 **원리적으로 한 장도 못 지운다.** "
       + "적는 자리는 업로드 정책과 퇴원 파기다",
    어디: "업로드·퇴원 담당" },
  { what: "Storage 버킷 지우개",
    why: "⚠️ 확인 안 됨 — 버킷 이름을 못 찾았다. 지우개가 없으면 파일 정리를 **아예 안 돌린다**: "
       + "줄만 내리면 v2.file.path 가 무덤값으로 덮여 **버킷의 진짜 파일을 영영 못 찾는다**",
    어디: "deps.removeStorage" },
];

/**
 * 큐 일감을 처리할 줄 아는 갈래.
 *
 * ⚠️ `runOnce()` 가 실패한 훑기를 **같은 갈래로** 큐에 다시 넣는다.
 *    크론이 그 갈래를 처리할 줄 모르면 **큐에 쌓이기만 하고 아무도 안 집는다.**
 *    그래서 훑기 갈래마다 처리기를 여기서 같이 만든다 — 둘이 어긋날 자리가 없다.
 */
export function handlersFor(checks, onCount) {
  const h = {};
  for (const c of checks) {
    h[c.kind] = async (job, ctx) => {
      const pl = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
      // ⚠️ 다시 도는 것은 **그날 것**이다. 오늘 것으로 돌면 못 돈 날이 영영 안 돈다
      const on = assertToday(pl?.ran_on ?? ctx.today, `큐 일감(${c.kind})`);
      const n = await c.count(on, ctx.readOnly);
      // ⚠️ `onCount` 는 **두 길에서 똑같이 넷을 받는다** — (갈래, 셈, db, 그날).
      //    한쪽만 셋을 주면 발송을 붙이는 날 보통 날마다 넷째가 undefined 로 들어가고
      //    드물게 도는 재시도 길에서만 제대로 들어간다 — 어느 쪽도 오류를 안 낸다.
      if (onCount) await onCount(c.kind, n, ctx.db, on);
      return n;
    };
  }
  return h;
}

// ─────────────────────────────────────────────────────────────
// 4. 잔손
// ─────────────────────────────────────────────────────────────

const why = (e) => String(e?.message ?? e ?? "").split("\n")[0].slice(0, 300);

/** ⚠️ 파기는 **한 트랜잭션**이어야 한다. 중간에 터지면 앞 칸은 비고 뒤 칸은 그대로인
 *  반쪽 상태가 남는데, 오류가 조용해서 다음 리허설 때까지 아무도 모른다 */
async function tx(db, fn) {
  await db.query("begin", []);
  try { const r = await fn(); await db.query("commit", []); return r; }
  catch (e) { await db.query("rollback", []).catch(() => {}); throw e; }
}

/**
 * 한 일이 성공인가 — 한 일이 **스스로 낸 ok · 실패 목록 · 막힌 것**을 다 본다.
 * ⚠️ `실패` 는 갈래가 둘이다: 하루훑기는 **목록**(터진 셈들), 큐처리는 **숫자**(실패한 일감 수).
 *    숫자 쪽은 판을 안 붉힌다 — 큐는 backoff 로 **다시 집히고**, 다섯 번 실패하면 'fail' 로 굳어
 *    보고의 큐 셈에 뜬다. 목록 쪽은 그날의 셈이 통째로 안 돈 것이라 붉힌다.
 */
function stepOk(r) {
  if (r?.ok === false) return false;
  if (Array.isArray(r?.실패) && r.실패.length) return false;
  if (Number(r?.막힌것) > 0) return false;
  return true;
}

/** ⚠️ 몇 줄이 바뀌었는지 못 세면 **접근 규칙이 막았을 때도 「성공」이라고 말한다** */
function rowsOf(r, tbl, col) {
  const n = r?.rowCount;
  if (typeof n !== "number") throw new Error(`어댑터가 rowCount 를 안 준다 — ${tbl}.${col}`);
  return n;
}

// ─────────────────────────────────────────────────────────────
// 5. 한 일들 — **하나가 터져도 나머지는 돈다**
// ─────────────────────────────────────────────────────────────

/** 잠긴 채 죽은 일을 되살린다 (배포·타임아웃·OOM 으로 `taking` 인 채 멈춘 것) */
async function stepRevive(ctx) {
  const back = await revive(ctx.db, { now: ctx.now });
  return { 되살림: back.filter((r) => r.state === "wait").length,
           굳힘: back.filter((r) => r.state === "fail").length };
}

/** 큐를 집어 처리한다. ⚠️ **아는 갈래만 집는다** — 모르는 갈래를 집으면 영영 실패로 굳는다 */
async function stepQueue(ctx) {
  const kinds = Object.keys(ctx.handlers);
  if (!kinds.length) return { 집음: 0, why: "처리할 줄 아는 갈래가 없다" };
  const jobs = await take(ctx.db, { now: ctx.now, limit: ctx.limit, kinds });
  let ok = 0, bad = 0;
  for (const job of jobs) {
    // ⚠️ 일감 하나가 터져도 **다음 일감은 돈다.** 안 그러면 첫 줄이 그날 전부를 막는다
    try { await ctx.handlers[job.kind](job, ctx); await done(ctx.db, job.id); ok++; }
    catch (e) { await failed(ctx.db, job, e, { now: ctx.now }); bad++; }
  }
  return { 집음: jobs.length, 됨: ok, 실패: bad };
}

/** 하루 한 번 훑기 — `day_ran` 이 자물쇠라 하루에 몇 번 불러도 한 번만 돈다 */
async function stepSweep(ctx) {
  // ⚠️ `sweep()` 은 `on(kind, n, db)` 셋만 준다 (lib/queue.js — 남의 파일이라 못 고친다).
  //    맞추는 쪽은 여기다 — **그날을 묶은 함수**를 넘겨 두 길 다 넷이 되게 한다.
  const out = await sweep(ctx.db, {
    today: ctx.today, checks: ctx.checks, on: ctx.sweepOn, now: ctx.now });
  const 셈 = {};
  for (const r of out) if (r.ran && r.ok) 셈[r.kind] = r.result;
  return { 돔: out.filter((r) => r.ran && r.ok).length,
           이미돌았음: out.filter((r) => r.ran === false).length,
           실패: out.filter((r) => r.ran && !r.ok).map((r) => ({ kind: r.kind, why: r.error })),
           셈 };
}

/**
 * 되풀이 할일 (매주·매달·매년) — **셈은 lib 두 곳에 있다. 부르기만 한다.**
 *
 * ⚠️⚠️ 앞판은 이 자리가 **통째로 없었다.** `lib/queue.js` 에 `planRecurring` 이 다 있는데
 *    아무도 안 불러서, 원장님이 규칙 한 줄을 켜도 **할일이 한 줄도 안 생기고 오류도 안 났다.**
 *    화면이 비지도 않아 몇 주 뒤에나 안다 (계획 (e) ②).
 * ⚠️⚠️ **`make` 없이 부르면 안 된다.** `claimKey` 가 도장을 **먼저** 찍으므로
 *    할일은 영영 안 생기는데 「이미 만들었다」로 굳는다. `planRepeats` 가 make 를 끼워 부른다.
 * ⚠️ 크론이 며칠 멈췄으면 **그 며칠도 따라잡는다** — 마지막 도장 **다음날**부터 훑는다.
 *    오늘 하루만 훑으면 멈춘 동안의 매주·매달 몫이 **영영 안 선다.**
 */
async function stepRepeat(ctx) {
  const h = await cronHealth(ctx.db, ctx.today);
  const since = h.last && h.last < ctx.today ? addDays(h.last, 1) : ctx.today;
  // 주말에 선 할일을 앞 수업일로 당길 때 쓴다 (lib/todo.js 의 pullBack)
  const classDays = await academyDays(ctx.db, since, addDays(ctx.today, 60));
  const out = await planRepeats(ctx.db, { today: ctx.today, since, classDays });
  return {
    부터: since, 세운것: out.todos.length, 이미있음: out.already,
    // ⚠️ 주기 글자를 못 읽은 규칙은 **조용히 넘기지 않고 내놓는다** — 안 그러면 그 규칙만 영영 안 돈다
    건너뜀: out.skipped.map((x) => ({ 규칙: x.rule?.name ?? null, why: x.why })),
  };
}

/**
 * 보관 기한이 지난 파일 (`purge_on` 이 온 것).
 * ⚠️ **승인 단추를 만들지 마라** — 안 눌러도 아무 일이 안 나므로 결국 안 누르게 되고,
 *    아이들 숙제 사진·녹음이 해가 지나도 그대로 쌓인다 (계획 「저장 공간 정리는 자동이 기본」).
 */
async function stepPurgeFiles(ctx) {
  const due = await filesDue(ctx.db, ctx.today);
  const 밝힘 = await 기한을안적었나(ctx);

  // ⚠️⚠️ **Storage 지우개가 없으면 줄을 안 내린다.**
  //    `v2.file.path` 에는 unique 가 걸려 있어 줄을 내리면 무덤값(`purged:…`)으로 덮인다.
  //    그런데 path 는 **버킷의 진짜 파일이 어디 있는지 아는 유일한 값**이다.
  //    먼저 비우면 아이 숙제 사진·녹음이 버킷에 영영 남고 **버킷 목록과 대조해도 못 찾는다.**
  //    되돌릴 수 없는 한 방향 손실이라, 지우개가 붙기 전에는 **안 돌리고 밝힌다.**
  //    ⚠️ 순서는 늘 **버킷 먼저 → DB 나중**이다.
  if (!ctx.removeStorage)
    return {
      // 기한이 온 것이 있는데 못 돌리는 것은 **서 있는 것**이다 — 초록으로 두지 않는다
      ok: due.length === 0,
      기한온것: due.length, 버킷에남은것: due.length,
      안돌림: "Storage 지우개(deps.removeStorage)가 없다 — 줄을 내리면 path 가 덮여 "
            + "버킷의 진짜 파일을 영영 못 찾는다. 지우개가 붙은 뒤에 돈다",
      ...(밝힘 ? { 밝힘 } : {}),
    };

  // ⚠️⚠️ **버킷 먼저 → DB 나중.** 앞판은 이 차례가 바로 위 주석과 **정반대**였다(DB 먼저).
  //    그러면 지우개가 한 번 503 이 나는 날, 줄은 이미 무덤값(`purged:…`)으로 덮인 뒤인데
  //    버킷 파일은 그대로 남는다 — **그 파일이 어디 있는지 아는 유일한 값이 사라진다.**
  //    되돌릴 길이 없다. 이 차례면 지우개가 터져도 DB 는 한 글자도 안 바뀌어 **다음 날 다시 돈다.**
  // ⚠️ 지우개에 넘기는 것은 「기한이 온 파일 전부」가 **아니다.**
  //    자료함 묶음에 걸린 파일은 줄이 일부러 안 내려간다. 그 경로를 버킷에서 지우면
  //    DB 는 초록인 채 **다른 아이 화면만 깨진 링크가 된다.**
  //    → 그 판단은 `filesDue` 가 준 `in_bin` **한 곳**에서 온다. 여기서 다시 세지 않는다 (원칙 1)
  // ⚠️⚠️ 그 칸이 참·거짓으로 안 오면(칸이 빠지거나 null 로 오는 날) **한 장도 안 지우고 운다.**
  //    「없으면 자료함이 아니겠지」로 읽으면 남의 안내문을 버킷에서 지운다. 모르면 안 지운다(대전제 0).
  //    조용히 0 으로 넘어가도 안 된다 — 줄만 내려가 버킷 파일이 미아가 된다
  if (due.some((d) => typeof d.in_bin !== "boolean"))
    return {
      ok: false, 기한온것: due.length, 버킷에남은것: due.length, 파기된줄: 0,
      why: "⚠️ 기한 온 파일 질문이 `in_bin` 을 참·거짓으로 안 준다 (lib/purge.js 의 filesDueSql) — "
         + "자료함 묶음에 걸린 파일을 가릴 수가 없어 **한 장도 안 지웠다**",
      ...(밝힘 ? { 밝힘 } : {}),
    };
  const 지울경로 = due.filter((d) => d.in_bin === false).map((d) => d.path);
  const 지움 = 지울경로.length ? await ctx.removeStorage(지울경로) : 0;

  const r = await tx(ctx.db, () => purgeFiles(ctx.db, ctx.today, { due }));

  // ⚠️ 「버킷 먼저」가 사 온 **새 위험** — 버킷에서는 지웠는데 줄이 안 내려간 것.
  //    (읽은 뒤에 자료함 묶음에 붙으면 난다.) DB 는 「살아 있다」인데 파일이 없어
  //    누르면 404 인데 오류는 아무 데도 안 남는다 → **세어서 판을 붉힌다.**
  const st = await ctx.db.query(SQL.fileState, [due.map((d) => d.id)]);
  const 내려간 = new Set((st.rows ?? []).filter((x) => x.state === "purged").map((x) => x.id));
  const 어긋난 = due.filter((d) => d.in_bin === false && !내려간.has(d.id)).length;

  return {
    ok: r.blocked.length === 0 && 어긋난 === 0,
    기한온것: due.length,
    // ⚠️ **문장 수가 아니라 줄 수다.** 문장 수는 파일이 1장이든 500장이든 늘 같아서
    //    몇 장이 진짜로 파기됐는지 보고만 봐서는 알 길이 없었다
    파기된줄: 내려간.size,
    안내려간줄: due.length - 내려간.size,   // 자료함 묶음에 걸려 **일부러** 안 내린 것
    막힌것: r.blocked.length,
    // ⚠️ 경로에 아이 이름이 들어갈 수 있다 — **개수만** 내놓는다
    버킷에서지움: 지움,
    버킷에남은것: due.length - 지울경로.length,
    어긋난줄: 어긋난,
    ...(어긋난 ? { why: `⚠️ 버킷에서는 지웠는데 줄이 안 내려간 것이 ${어긋난}장이다 — `
      + "DB 는 「살아 있다」인데 파일이 없어 누르면 404 다. 자료함 묶음을 확인해라" } : {}),
    ...(밝힘 ? { 밝힘 } : {}),
  };
}

/**
 * 기한이 온 것이 0 인 까닭을 가른다 — **깨끗해서인가, 아무도 안 적어서인가.**
 * ⚠️ 안 가르면 파일 정리가 **원리적으로 한 장도 못 지우는데** 날마다 초록이다.
 *    (지금 `v2.file.purge_on` 을 적는 코드가 앱에 한 줄도 없다 — NOT_RUN 에 적어 두었다)
 */
async function 기한을안적었나(ctx) {
  const { rows } = await ctx.db.query(SQL.filePlan, []);
  const 살아있는 = Number(rows?.[0]?.n_live ?? 0);
  const 기한적힌 = Number(rows?.[0]?.n_planned ?? 0);
  if (!살아있는 || 기한적힌) return null;
  return "⚠️ 살아 있는 파일은 있는데 **파기 예정일이 적힌 줄이 하나도 없다** — "
       + "기한이 온 것 0 은 깨끗해서가 아니라 아무도 안 적어서다. "
       + "적는 자리(업로드 정책 · 퇴원 파기)가 아직 없다";
}

/**
 * 날짜로 지우는 파기 — 파기 목록 표에서 `how='expire'` 인 줄.
 * ⚠️ 표 이름을 여기 적지 않는다. 그 표를 읽는 곳은 `lib/purge.js` 한 곳이고,
 *    `scripts/check-purge.mjs` 가 **글자로 훑어** 다른 파일에 이름이 있으면 깨진다.
 * ⚠️ 사람 파기와 **같이 안 돈다** — 한 아이를 지운다고 남의 되돌리기 자료를 날리면 안 된다.
 *    `excel_row.before` 는 어느 표의 줄이든 통째로 담아 「이 아이 것만」을 원리적으로 못 고른다.
 */
async function stepPurgeExpired(ctx) {
  const map = (await purgeMap(ctx.db)).filter(isExpire);
  if (!map.length) return { 돈줄: 0, why: "기한으로 지울 줄이 목록에 없다" };
  const facts = await columnFacts(ctx.db);
  const plan = planFor({ map, facts, target: { kind: "expire" } });

  // ⚠️⚠️ **한 줄이라도 막히면** 조용히 넘어가지 않고 터뜨린다.
  //    앞판은 「한 줄도 못 돌 때만」 울었다 — 목록에 expire 줄이 하나 더 늘고 **그 줄만** 막히면
  //    크론은 날마다 초록인데 그 칸의 아이 이름·전화가 **해가 지나도 그대로 남았다.**
  //    (`막힌것: 1` 을 200 응답 본문에만 적어 두면 아무도 안 본다.)
  //    ⚠️ 흘려도 되는 막힘이 생기면 그때 **흰 목록으로 좁힌다** — 조건을 다시 느슨하게 하지 마라.
  //    ⚠️ 지금 실제로 이 자리가 막혀 있다 — `lib/purge.js` 의 `purgeMap()` 이
  //       파기 목록 표의 `after_days` 칸을 **select 에서 빠뜨려** 기한이 늘 null 로 온다.
  //       고치는 법: purgeMap() 의 select 에 `after_days` 를 더한다 (내 담당 파일이 아니라 안 고쳤다).
  if (plan.blocked.length)
    throw new Error(
      "⚠️ 기한 파기가 막혔다 — 개인정보가 안 지워지고 있다. " +
      "막힌 것: " + plan.blocked.map((b) => `${b.tbl}.${b.col}(${b.why})`).join(" · ") +
      ". 기한이 null 로만 온다면 lib/purge.js 의 purgeMap() select 에 after_days 가 빠진 것이다");

  const ran = await tx(ctx.db, async () => {
    const out = [];
    for (const s of plan.expired) {
      const r = await ctx.db.query(s.sql, s.params);
      out.push({ tbl: s.tbl, col: s.col, rows: rowsOf(r, s.tbl, s.col) });
    }
    return out;
  });
  return { 돈줄: ran.length, 비운줄: ran.reduce((a, b) => a + b.rows, 0),
           막힌것: plan.blocked.length, 자세히: ran };
}

/**
 * 보고 — **세기만 한다.** 여기서 무엇도 만들지 않는다.
 *
 * ⚠️ **예약 발송을 크론이 아직 안 내보낸다.** 내보내려면 「그 아이의 학부모·학생이 누구냐」를
 *    풀어야 하는데, 그 셈이 `lib/` 에 아직 없다. 여기서 SQL 로 풀면 같은 셈이 두 벌이 된다(원칙 4).
 *    → 지금은 **밀린 개수만** 내놓는다. 셈이 생기면 `deps.sendScheduled` 에 끼운다.
 */
async function stepReport(ctx) {
  const known = new Set(Object.keys(ctx.handlers));
  const w = await ctx.db.query(SQL.waiting, [ctx.now.toISOString()]);
  const 아무도안집음 = (w.rows ?? []).filter((r) => !known.has(r.kind));
  const d = await ctx.db.query(SQL.dueSend, [ctx.now.toISOString()]);
  const 밀린예약 = Number(d.rows?.[0]?.n ?? 0);

  let 보냄 = null;
  if (ctx.sendScheduled && 밀린예약) 보냄 = await ctx.sendScheduled(ctx);

  return {
    큐: await stats(ctx.db),
    아무도안집음,                       // ⚠️ 비어 있어야 정상이다. 차면 그 갈래는 영영 안 돈다
    밀린예약, 보냄,
    안세는것: NOT_COUNTED,
    // ⚠️ 셈이 아니라 **일**이 아예 안 도는 자리 — 선언을 안 하면 몇 주 뒤에나 안다
    안도는것: NOT_RUN,
  };
}

/**
 * 도는 차례. ⚠️ **되살리기가 맨 앞**이다 — 잠긴 채 죽은 일을 먼저 풀어야
 *    그 판에서 다시 집힌다. 뒤로 미루면 하루를 통째로 더 기다린다.
 * ⚠️ **보고가 맨 뒤**다. 앞엣것이 큐를 비운 뒤라야 「아무도 안 집는 갈래」가 진짜다.
 */
export const STEPS = [
  ["잠긴일되살리기", stepRevive],
  ["큐처리",        stepQueue],
  ["하루훑기",      stepSweep],
  ["되풀이할일",    stepRepeat],
  ["파일정리",      stepPurgeFiles],
  ["기한파기",      stepPurgeExpired],
  ["보고",          stepReport],
];

// ─────────────────────────────────────────────────────────────
// 6. 크론 한 판
// ─────────────────────────────────────────────────────────────

/**
 * @param db     `{ query(sql, params) -> { rows, rowCount } }` — 검사가 가짜를 끼운다
 * @param today  **「학원의 오늘」 'YYYY-MM-DD'** (필수 — ⑩). 없거나 Date 면 던진다
 * @param deps   { checks, onCount, removeStorage, sendScheduled, limit } — 전부 갈아 끼울 수 있다
 *
 * ⚠️ `onCount` 를 안 주면 **셈만 하고 알림을 안 만든다.** 지금이 그 상태다 —
 *    web-push 로 실제로 쏘는 함수가 `lib/notify.js` 에 아직 없어서,
 *    여기서 만들면 크론이 `web-push` 를 직접 부르게 되어 검사가 깨진다.
 *    발송이 붙는 자리는 여기 한 칸이다.
 */
export async function runCron(opts = {}) {
  const db = opts.db;
  if (!db?.query) throw new Error("⚠️ 크론에 DB 어댑터가 없다 — { query(sql, params) } 를 넘겨라");
  const today = assertToday(opts.today, "크론");
  const now = opts.now instanceof Date ? opts.now : new Date();
  const deps = opts.deps ?? {};
  const checks = deps.checks ?? defaultChecks();

  // ⚠️ 도장은 `?on=` 이 아니라 **진짜 오늘**로 찍는다 — 도장의 뜻은 「크론이 불렸다」다.
  //    밀린 날을 돌린다고 그날 도장을 찍으면 「멈췄다」 경보가 거짓이 된다
  const stampOn = assertToday(opts.stampOn ?? today, "크론 도장");

  const ctx = {
    db, today, now, checks,
    readOnly: guardDb(db, []),           // ⚠️ 셈은 한 글자도 못 쓴다 (⑨)
    onCount: deps.onCount ?? null,
    removeStorage: deps.removeStorage ?? null,
    sendScheduled: deps.sendScheduled ?? null,
    limit: deps.limit ?? 20,
    handlers: {},
  };
  ctx.handlers = handlersFor(checks, ctx.onCount);
  // ⚠️ sweep 은 셋만 준다 — 그날을 묶어 **두 길 다 넷**이 되게 한다 (stepSweep 주석)
  ctx.sweepOn = ctx.onCount ? ((k, v, d) => ctx.onCount(k, v, d, ctx.today)) : null;

  const steps = [];
  for (const [name, run] of STEPS) {
    // ⚠️ **하나가 터져도 나머지는 돈다.** 하나 때문에 그날 전부가 안 도는 일이 없게
    try {
      const r = (await run(ctx)) ?? {};
      // ⚠️⚠️ **스프레드를 앞에 둔다.** 뒤에 두면(`{ name, ok: true, ...r }`) 한 일이 스스로 낸
      //    실패를 `ok: true` 가 덮어, 하루훑기의 셈이 터져도 판이 **초록으로 남았다.**
      //    Vercel 기록이 초록이면 아무도 안 본다 — 결석·지각 예정 알림이 몇 주 안 나간 것을
      //    원장님이 학부모 전화로 알게 되는 자리다.
      steps.push({ ...r, name, ok: stepOk(r) });
    }
    catch (e) { steps.push({ name, ok: false, why: why(e) }); }
  }

  // ⚠️ 도장은 **맨 끝에, 한 일이 터져도** 찍는다. 이 도장은 「크론이 불렸다」는 뜻이고,
  //    「멈췄다」는 **아예 안 불린 것**을 말한다. 안 찍으면 한 일이 하나만 터져도
  //    대시보드가 「크론이 멈췄다」고 거짓말한다.
  let 첫판 = null;
  try { 첫판 = await markRan(db, CRON_KIND, stampOn); }
  catch (e) { steps.push({ name: "도장", ok: false, why: why(e) }); }

  const bad = steps.filter((s) => !s.ok);
  return {
    ok: bad.length === 0, on: today, at: now.toISOString(),
    ms: Date.now() - now.getTime(), 첫판, steps,
    실패: bad.map((s) => s.name),
  };
}

// ─────────────────────────────────────────────────────────────
// 7. 문 — Vercel Cron 이 GET 으로 부른다
// ─────────────────────────────────────────────────────────────

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status, headers: { "content-type": "application/json; charset=utf-8",
                       "cache-control": "no-store" } });

/**
 * ⚠️ `serviceDb()`(supabase-js) 는 **raw SQL 을 못 돌린다.** `lib/` 의 셈이 전부
 *    `{ query(sql, params) }` 를 받으므로 크론은 `pg` 로 직접 붙는다.
 * ⚠️ **확인 안 됨 둘** — 배포 전에 반드시 본다:
 *    ① `pg` 가 지금 `package.json` 의 **devDependencies** 에 있다.
 *       Vercel 이 빌드할 때는 깔리지만, 운영 의존성으로 옮기는 편이 맞다.
 *    ② Vercel 환경변수에 **`DATABASE_URL` 이 있어야** 한다. 없으면 크론이 500 으로 운다.
 */
async function pgDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("⚠️ DATABASE_URL 이 없다 — 크론이 DB 에 못 붙는다 (Vercel 환경변수)");
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await client.connect();
  return { query: (sql, params) => client.query(sql, params), end: () => client.end() };
}

/**
 * `?on=` 을 받아들일까 — **밀린 날**을 돌리는 문이지 **앞날**을 돌리는 문이 아니다.
 *
 * ⚠️⚠️ 앞날을 받으면 되돌릴 수 없는 일이 둘 한꺼번에 난다. 연도 한 글자만 잘못 쳐도 난다.
 *   ① **아직 기한이 안 온 파일이 그 자리에서 파기된다.** `v2.file.path` 가 무덤값으로 덮여
 *      버킷의 진짜 파일(아이 숙제 사진·녹음)을 **다시는 못 찾는다.**
 *   ② **「크론이 멈췄다」 경보가 그날까지 꺼진다.** `v2.day_ran` 에 앞날 도장이 박히는데
 *      대전제 6 때문에 그 줄은 **못 지운다.** 1년 내내 조용할 수 있다.
 * → 그래서 **400 으로 거절한다.** (SQL.lastRan 에도 겹으로 막아 두었다)
 */
export function onFrom(on, today) {
  assertToday(today, "onFrom 의 오늘");
  if (on === null || on === undefined || on === "") return { ok: true, on: today };
  let day;
  try { day = assertToday(on, "크론(?on=)"); }
  catch (e) { return { ok: false, status: 400, why: why(e) }; }
  if (day > today) return { ok: false, status: 400,
    why: "⚠️ 앞날은 못 돌린다 — 이 문은 **밀린 날**을 돌리는 문이다. 앞날로 돌리면 "
       + "아직 기한이 안 온 파일이 파기되고(되돌릴 수 없다), 앞날 도장 때문에 "
       + "「크론이 멈췄다」가 그날까지 안 뜬다" };
  return { ok: true, on: day };
}

/** 「학원의 오늘」을 **DB 한 곳에서** 받는다 — 서버 시간으로 세지 않는다 (⑩) */
export async function todayFrom(db) {
  const { rows } = await db.query(SQL.today, []);
  return assertToday(rows?.[0]?.d, "v2.today()");
}

async function handle(req) {
  const key = keyCheck(req);
  if (!key.ok) return json({ ok: false, why: key.why }, key.status);

  let db = null;
  try { db = await pgDb(); }
  catch (e) { return json({ ok: false, why: why(e) }, 500); }

  try {
    const today = await todayFrom(db);
    // 손으로 밀린 날을 돌릴 때만 쓴다 (`?on=2026-08-30`). 열쇠가 있어야 하므로 바깥에선 못 쓴다
    const picked = onFrom(new URL(req.url).searchParams.get("on"), today);
    if (!picked.ok) return json({ ok: false, why: picked.why }, picked.status);
    // ⚠️ 한 일들에는 `?on=` 을 넘기되, **도장은 진짜 오늘**로 찍는다
    const out = await runCron({ db, today: picked.on, stampOn: today });
    // ⚠️ 한 일이 하나라도 터지면 **500 으로 운다.** 200 이면 Vercel 기록에 초록으로 남아
    //    아무도 안 본다 — 크론이 조용히 반쪽만 도는 것이 제일 무섭다
    return json(out, out.ok ? 200 : 500);
  } catch (e) {
    return json({ ok: false, why: why(e) }, 500);
  } finally {
    await db.end().catch(() => {});
  }
}

export async function GET(req) { return handle(req); }
/** 손으로 불러 볼 때. 열쇠는 GET 과 똑같이 건다 */
export async function POST(req) { return handle(req); }
