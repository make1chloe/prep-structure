/**
 * **「누가 무엇을 보나」 검사** — 원장님 2026-09-03 두 말씀을 지키는 자리.
 *
 *   ① 「역할별로 페이지를 따로 만들지말고 원장이 학부모·학생·강사·조교에게 각각 페이지를
 *      어디까지 오픈할지 온오프 및 세부목록 관리하는 페이지 추가해.」
 *   ② 「그런 권한기본값을 니가 미리 정해서 코드에 박아 놓는 게 아니라 내가 웹상에서 설정 할 수 있게 해」
 *
 * ── ⚠️⚠️ **오늘 이 레포에서 난 사고 셋을 이 검사가 되풀이하면 안 된다**
 *    ㉠ 검사가 **코드가 지어낸 낱말**로만 물어서, DB 에 그 값이 0줄인데 23건 전부 초록이었다
 *       → 그래서 이 검사는 **진짜 DB 에 붙어서** 묻는다. **못 붙으면 초록을 안 준다.**
 *         「못 물어봤으니 통과」가 바로 어긋난 곳 ⑯ 을 만든 태도다(대전제-0).
 *    ㉡ 검사가 **파일 하나만** 읽어서 나머지를 아예 안 봤다
 *       → 그래서 `lib/` 와 `app/` 을 **통째로 훑는다**(`훑기`). 파일 이름을 손으로 안 적는다.
 *    ㉢ **가짜 DB 가 진짜보다 헐거워서** 통과시켰다
 *       → 그래서 흉내내는 DB 를 안 쓴다. `set_config('request.jwt.claims') + set local role authenticated`
 *         로 **앱과 같은 접근 규칙**을 지나 읽고 쓴다.
 *
 * ── ⚠️ **상수끼리 견주지 않는다.** 표→열쇠 짝은 `pg_policies` 에서 **뽑아** 온다.
 *    저장하는 문장(`PUT_ACCESS`)도 `app/settings/actions.js` **글자에서 뽑아** 돌린다 —
 *    베껴 두면 앱이 문장을 바꾼 날 검사만 옛 문장으로 초록이 된다.
 *
 * ── ⚠️⚠️ **쓰는 것은 전부 트랜잭션 하나 안이고 끝에 반드시 `rollback` 한다.**
 *    `uncaughtException`·`unhandledRejection`·`SIGINT` 에도 되돌린다(규칙 6).
 *    세우는 줄은 `zz_시험_` fixture 뿐이다(대전제-1 · 대전제-12).
 *    ⚠️ 트랜잭션 **안에서** `v2.role_access` 를 한 번 비운다 — 그래야 「32칸이 다 안 정해졌을 때」를
 *       원장님이 이미 정하신 값과 무관하게 밟을 수 있다. **끝의 `rollback` 이 그 값을 그대로 되돌리고,
 *       되돌린 줄 수를 트랜잭션 밖에서 다시 세어 확인한다.**
 *
 * ── ⚠️ **일부러 어겨 보는 자리**(폰-5 「일부러 어기는 본보기를 두고 검사가 잡는지 확인한다」)
 *    `PERM_BREAK_SQL=<파일.sql>` 로 돌리면 그 SQL 을 **이 검사의 트랜잭션 안에서** 먼저 돌린다.
 *    DDL 도 트랜잭션이라 `rollback` 이 되돌린다(실측). 진짜 DB 를 망가뜨리지 않고
 *    「원장을 `v2.can()` 에서 빼면 빨개지나」·「민감한 표에서 `can()` 을 빼면 빨개지나」를 볼 수 있다.
 *    안 하면 무엇이 터지나: 잡는지 한 번도 안 본 검사는 **잡는 척만 한다** — 오늘 사고 셋이 다 그랬다.
 *
 * 돌리기:  node scripts/check-perm.mjs
 *          PERM_BREAK_SQL=/tmp/자해.sql node scripts/check-perm.mjs
 */
import { Client } from "pg";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ITEMS, ROLE_LIST, PRINCIPAL, TABLE,
  itemOf, itemsFor, pageKeyOf, cardKeyOf,
  stateOf, canFor, unsetCount, everyCell, whyOff, blockedBy, visibleCards, rowsOf,
} from "../lib/perm.js";
import { SECTIONS, menuFor, isPrincipal } from "../lib/menu.js";
import { CARDS } from "../lib/screens.js";
import { readNet } from "../lib/arrival.js";

/* ═══════════════════════════════════════════════════════════════════
 * 0. 연장
 * ═══════════════════════════════════════════════════════════════════ */

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (c) { console.log(`   ✅ ${t}`); return; }
  fail++;
  console.log(`   ❌ ${t}${why ? "\n        → " + String(why).replace(/\n/g, "\n        ") : ""}`);
};

/** ⚠️ **주석을 먼저 지운다**(폰-5). 안 지우면 「`?? true` 를 쓰지 마라」는 주석이 걸려 헛짚는다 */
const 코드만 = (t) =>
  String(t ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
/** SQL 주석 — `--` 와 블록 주석 둘 다 */
const SQL만 = (t) => String(t ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const 읽기 = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
/** ⚠️ **폴더를 통째로 훑는다.** 파일 이름을 손으로 적으면 새 파일이 검사 밖으로 샌다(사고 ㉡) */
const 훑기 = (d, out = []) => {
  if (!existsSync(d)) return out;
  for (const f of readdirSync(d)) {
    if (["node_modules", ".next", ".git", "_tmp", "sandbox"].includes(f)) continue;
    const p = join(d, f);
    if (statSync(p).isDirectory()) 훑기(p, out);
    else if (/\.(js|jsx|mjs)$/.test(f)) out.push(p);
  }
  return out;
};

/** `이름(...)` 부름을 찾아 **괄호를 세어** 인자 글자를 통째로 준다 (정규식으로는 중첩 괄호를 못 문다) */
function 부름들(code, name) {
  const out = [];
  /* ⚠️⚠️ `\b` 를 쓰면 **한글 이름을 한 번도 못 찾는다.** JS 의 `\b` 는 `[A-Za-z0-9_]` 로만 나뉘어서
   *    `연다(` 앞이 공백이면 경계가 안 생긴다(양쪽 다 낱말 문자가 아니다).
   *    그래서 이 검사가 **「막는 자리가 0개」라고 거짓으로 빨개졌다** — 코드는 멀쩡했다.
   *    (오늘 이 레포에서 「검사가 헛짚는다」가 난 네 번째 자리다 — 폰-5)
   *    → 앞뒤가 낱말·한글이 아닌 것만 경계로 본다. */
  const re = new RegExp(`(?<![\\w가-힣])${name}\\s*\\(`, "g");
  let m;
  while ((m = re.exec(code))) {
    let i = re.lastIndex, depth = 1, s = "";
    while (i < code.length && depth > 0) {
      const ch = code[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth > 0) s += ch;
      i++;
    }
    out.push(s);
  }
  return out;
}
/** 인자 글자를 **맨 바깥 쉼표로만** 쪼갠다 (`canFor(r, pageKeyOf(s.href), rows)` 를 셋으로 센다) */
function 인자쪼개기(s) {
  const out = [];
  let cur = "", d = 0, q = "";
  for (const ch of String(s ?? "")) {
    if (q) { cur += ch; if (ch === q) q = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; cur += ch; continue; }
    if ("([{".includes(ch)) d++;
    if (")]}".includes(ch)) d--;
    if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const 있는것 = (a, b) => a.filter((x) => !b.includes(x));   // a 에만 있는 것
const 칸이름 = (r, k) => `${r}|${k}`;
const 칸수 = everyCell(null).length;

const APP = 훑기("app");
const 앱코드 = new Map(APP.map((f) => [f, 코드만(읽기(f))]));
const 립코드 = new Map(훑기("lib").map((f) => [f, 코드만(읽기(f))]));
const 온코드 = [...앱코드, ...립코드];

/* ═══════════════════════════════════════════════════════════════════
 * 0-1. 진짜 DB — **못 붙으면 초록을 안 준다**
 * ═══════════════════════════════════════════════════════════════════ */
console.log("■ 0. 진짜 DB 에 붙는다 (못 붙으면 통과가 아니라 실패다 — 사고 ㉠)");

const P = {                                    // 리허설 계정만 쓴다 (대전제-12)
  원장: "00000000-0000-4000-8000-000000000001",
  강사: "00000000-0000-4000-8000-000000000002",
  학생: "00000000-0000-4000-8000-000000000003",
  학부모: "00000000-0000-4000-8000-000000000004",
};
const 아이 = "00000000-0000-4000-9000-000000000001";
const 표시 = "zz_시험_권한검사";               // fixture 표시 — 이 글자로만 세운다

let c = null, db왜 = "", 열림 = false, 처음줄 = [];
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)?.[1]?.trim();
  if (!url) throw new Error(".env.local 에 DATABASE_URL 이 없다");
  c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  // ⚠️ **트랜잭션 밖에서 먼저 읽는다** — 원장님이 이미 정하신 진짜 값이고, 끝에 이 값으로 되돌아왔는지 센다
  처음줄 = (await c.query(`select role, key, allowed from v2.role_access`)).rows;
} catch (e) { db왜 = String(e?.message ?? e).split("\n")[0]; c = null; }
ok("⚠️⚠️ **진짜 DB 에 붙어서 묻는다** (흉내내는 DB 를 안 쓴다 — 사고 ㉢)", Boolean(c), db왜);

/** ⚠️ 어떻게 끝나든 **되돌린다**(규칙 6). 검사가 죽어도 진짜 DB 에 줄이 남으면 안 된다 */
const 되돌리기 = async () => {
  if (!c || !열림) return;
  열림 = false;
  try { await c.query("rollback"); } catch { /* 이미 끊겼다 */ }
};
const 죽었다 = async (e, 어디) => {
  console.log(`   ❌ 검사가 죽었다(${어디}) —`, String(e?.message ?? e).split("\n")[0]);
  await 되돌리기();
  try { await c?.end(); } catch { /* 이미 끊겼다 */ }
  process.exit(1);
};
process.on("uncaughtException", (e) => { 죽었다(e, "던짐"); });
process.on("unhandledRejection", (e) => { 죽었다(e, "약속"); });
process.on("SIGINT", async () => { await 되돌리기(); process.exit(130); });

let 표번호 = 0;
/**
 * **아무도 아닌 채로** 돈다 (`auth.uid()` 가 null — 크론·검사·이관과 같은 길).
 * ⚠️ 성공하면 **이 트랜잭션 안에 남는다**(끝의 rollback 이 통째로 되돌린다).
 *    오류가 나면 savepoint 로 그 한 문장만 되돌려 **트랜잭션이 안 죽게** 한다.
 */
async function 문(sql, params = []) {
  if (!c) return { n: 0, rows: [], err: "DB 에 못 붙었다" };
  const sp = `문${++표번호}`;
  await c.query(`savepoint ${sp}`);
  try {
    const r = await c.query(sql, params);
    await c.query(`release savepoint ${sp}`);
    return { n: r.rows?.[0]?.n !== undefined ? Number(r.rows[0].n) : r.rowCount, rows: r.rows ?? [], err: null };
  } catch (e) {
    await c.query(`rollback to savepoint ${sp}`);
    await c.query(`release savepoint ${sp}`);
    return { n: 0, rows: [], err: String(e?.message ?? e).split("\n")[0] };
  }
}
/**
 * **그 사람이 되어** 돈다 — 앱과 같은 접근 규칙을 지난다.
 * ⚠️ 끝나면 **언제나 savepoint 로 되돌린다** — 역할·claims·오류를 한꺼번에 지운다.
 *    그래서 이 안에서 쓴 것은 하나도 안 남는다(막혀야 하는 쓰기를 시험하는 자리라 그게 맞다).
 */
async function 되어(pid, sql, params = []) {
  if (!c) return { n: 0, rows: [], err: "DB 에 못 붙었다" };
  const sp = `가장${++표번호}`;
  await c.query(`savepoint ${sp}`);
  let out = { n: 0, rows: [], err: null };
  try {
    await c.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: pid, role: "authenticated" })]);
    await c.query("set local role authenticated");
    const r = await c.query(sql, params);
    out.rows = r.rows ?? [];
    out.n = r.rows?.[0]?.n !== undefined ? Number(r.rows[0].n) : r.rowCount;
  } catch (e) { out.err = String(e?.message ?? e).split("\n")[0]; }
  finally {
    await c.query(`rollback to savepoint ${sp}`);
    await c.query(`release savepoint ${sp}`);
  }
  return out;
}

if (c) {
  await c.query("begin");
  열림 = true;
  const 자해파일 = process.env.PERM_BREAK_SQL || "";
  if (자해파일) {
    /* ⚠️ 일부러 어겨 보는 자리(폰-5). **이 트랜잭션 안**이라 `rollback` 이 전부 되돌린다 */
    console.log(`   ⚠️⚠️ 일부러 어기는 중 — ${자해파일} (이 트랜잭션 안에서만 · 끝에 되돌린다)`);
    await c.query(readFileSync(자해파일, "utf8"));
  }
  console.log(`   · 지금 진짜 v2.role_access 는 ${처음줄.length}줄 · 물어보는 칸은 ${칸수}칸`);
  /* ⚠️ **이 트랜잭션 안에서만** 비운다. 안 비우면 원장님이 정해 두신 값에 따라 검사 결과가 달라진다
   *    — 그러면 어제 초록이던 검사가 오늘 빨개지는 까닭을 아무도 모른다. 끝에 rollback 이 되돌린다. */
  await c.query("delete from v2.role_access");
}

/* ═══════════════════════════════════════════════════════════════════
 * 1. ⚠️⚠️ 코드에 켬/끔 기본값이 **한 줄도 없다** — 이번 일의 척추
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 1. 코드에 켬/끔 기본값이 한 줄도 없다 (원장님 정정 ②)");

/* 1-1 **뜻으로 묻는다.** 글자만 훑으면 이름을 바꿔 넣은 날 그냥 통과한다 */
{
  const 칸 = everyCell(null);
  const 샌것 = 칸.filter((x) => x.state !== "unset").map((x) => 칸이름(x.role, x.key));
  ok(`⚠️⚠️ 저장값이 **없을 때** 모든 칸(${칸수})이 「아직 안 정함」이다 — 코드가 든 값이 없다`,
     칸수 > 0 && 샌것.length === 0, `코드가 값을 들고 있는 칸: ${샌것.join(" · ")}`);
  const 빈것 = everyCell({}).filter((x) => x.state !== "unset");
  ok("저장값이 **0줄일 때**도 모두 「아직 안 정함」이다 (`{}` 를 「전부 켬」으로 안 바꾼다)",
     빈것.length === 0, 빈것.map((x) => 칸이름(x.role, x.key)).join(" · "));
  const 열린것 = 칸.filter((x) => canFor(x.role, x.key, null) || canFor(x.role, x.key, {}));
  ok("⚠️ 저장값 없이 `canFor` 가 **참을 주는 칸이 하나도 없다** (fail closed)",
     열린것.length === 0, 열린것.map((x) => 칸이름(x.role, x.key)).join(" · "));
  ok(`「아직 안 정한 것」 셈이 칸 수와 같다 (지금 ${unsetCount(null)}개)`,
     unsetCount(null) === 칸수 && unsetCount({}) === 칸수);
  ok("⚠️ 저장값이 없으면 강사·조교 메뉴가 **0칸**이다 (코드가 열어 두지 않는다)",
     menuFor("instructor", null).length === 0 && menuFor("assistant", {}).length === 0);
}

/* 1-2 **선언에 boolean 이 섞이면 그것이 곧 박아 둔 값이다.** 이름을 바꿔 숨겨도 여기서 걸린다 */
{
  const 허용칸 = new Set(["key", "name", "group", "href", "card", "where", "roles", "decided", "cost"]);
  const 남는칸 = [], 불리언 = [];
  for (const it of ITEMS) {
    for (const [k, v] of Object.entries(it)) {
      if (!허용칸.has(k)) 남는칸.push(`${it.key}.${k}`);
      if (typeof v === "boolean") 불리언.push(`${it.key}.${k} = ${v}`);
    }
    if (it.decided !== null && typeof it.decided !== "string")
      불리언.push(`${it.key}.decided 가 글이 아니다 (${typeof it.decided})`);
  }
  ok("⚠️⚠️ 항목 선언에 **켬/끔(boolean) 칸이 하나도 없다**", 불리언.length === 0, 불리언.join(" · "));
  ok("항목 선언에 모르는 칸이 없다 (새 칸 이름으로 값을 숨기지 않았다)", 남는칸.length === 0, 남는칸.join(" · "));
}

/* 1-3 글자로도 훑는다 — 아직 안 불린 자리를 위해. **주석은 먼저 지웠다**(폰-5) */
{
  const 되살림 = /(\?\?|\|\|)\s*(true|["']on["'])|defaultOf|defaultsOf|\bdef\s*:/;
  const 걸린곳 = [];
  for (const [f, code] of 온코드) {
    if (!/perm|role_access|권한|canFor|stateOf|allowed/.test(code)) continue;   // 권한을 다루는 파일만
    for (const [i, line] of code.split("\n").entries())
      if (되살림.test(line)) 걸린곳.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
  }
  ok("⚠️ 권한을 다루는 파일에 `?? true` · `|| true` · `?? \"on\"` · `defaultOf` · `def:` 가 없다",
     걸린곳.length === 0, 걸린곳.join("\n"));
}

/* 1-4 마이그레이션 씨앗 — **DB 쪽으로 기본값이 되살아나는 길** */
{
  const 씨앗 = [];
  for (const f of existsSync("supabase/migrations") ? readdirSync("supabase/migrations") : []) {
    const sql = SQL만(읽기(join("supabase/migrations", f)));
    if (/insert\s+into\s+(v2\.)?role_access/i.test(sql)) 씨앗.push(f);
  }
  ok("⚠️⚠️ 마이그레이션이 `v2.role_access` 에 **값을 넣지 않는다** (씨앗 = 코드에 박은 기본값이다)",
     씨앗.length === 0, 씨앗.join(" · "));
}

/* 1-5 진짜 DB — 저장된 줄에 원장이 없다 */
if (c) {
  ok("⚠️ 원장은 저장하는 표에 **한 줄도 안 든다**", !처음줄.some((r) => r.role === PRINCIPAL));
}

/* ═══════════════════════════════════════════════════════════════════
 * 2. 열쇠 짝 — 어긋나면 **켜도 안 뜨거나 꺼도 뜬다** (오류는 안 난다)
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 2. 열쇠 짝 — 빠진 것·남는 것 **양쪽 다** 본다");

const 짝맞추기 = (이름, 코드쪽, 저쪽, 코드이름, 저이름) => {
  const 빠진 = 있는것(저쪽, 코드쪽);   // 저쪽엔 있는데 열쇠가 없다 → **원장님이 끌 수 없는 자리**
  const 남는 = 있는것(코드쪽, 저쪽);   // 열쇠는 있는데 저쪽에 없다 → **켜도 안 뜬다**
  ok(`${이름} — ${저이름} 쪽에 열쇠 없는 것이 없다 (있으면 원장님이 끄실 자리가 없다)`,
     빠진.length === 0, `${저이름} 에만: ${빠진.join(" · ")}`);
  ok(`${이름} — ${코드이름} 쪽에 남는 열쇠가 없다 (있으면 켜도 안 뜬다)`,
     남는.length === 0, `${코드이름} 에만: ${남는.join(" · ")}`);
  ok(`${이름} — 개수가 같다 (${코드쪽.length}개)`, 코드쪽.length === 저쪽.length,
     `${코드이름} ${코드쪽.length} · ${저이름} ${저쪽.length}`);
};

짝맞추기("page.*", ITEMS.filter((i) => i.group === "page").map((i) => i.href),
        SECTIONS.map((s) => s.href), "lib/perm.js ITEMS", "lib/menu.js SECTIONS");
짝맞추기("me.*", ITEMS.filter((i) => i.group === "me").map((i) => i.card),
        [...CARDS.me], "lib/perm.js ITEMS", "lib/screens.js CARDS.me");
짝맞추기("parent.*", ITEMS.filter((i) => i.group === "parent").map((i) => i.card),
        [...CARDS.parent], "lib/perm.js ITEMS", "lib/screens.js CARDS.parent");

ok(`대메뉴는 일곱이다 (지금 ${SECTIONS.length})`, SECTIONS.length === 7);
ok(`아이 카드 넷 · 학부모 카드 여덟 (지금 ${CARDS.me.length} · ${CARDS.parent.length})`,
   CARDS.me.length === 4 && CARDS.parent.length === 8);

{
  const 어긋난 = SECTIONS.filter((s) => itemOf(pageKeyOf(s.href))?.href !== s.href).map((s) => s.href);
  ok("주소 → 열쇠 → 주소 왕복이 맞다 (`pageKeyOf`)", 어긋난.length === 0, 어긋난.join(" · "));
  const 카드어긋난 = [];
  for (const [화면, 목록] of [["me", CARDS.me], ["parent", CARDS.parent]])
    for (const card of 목록) if (itemOf(cardKeyOf(화면, card))?.card !== card) 카드어긋난.push(`${화면}/${card}`);
  ok("카드 → 열쇠 → 카드 왕복이 맞다 (`cardKeyOf`)", 카드어긋난.length === 0, 카드어긋난.join(" · "));
  ok("모르는 주소·카드는 **열쇠를 지어내지 않는다**",
     pageKeyOf("/없는곳") === null && pageKeyOf(null) === null
     && cardKeyOf("me", "없는카드") === null && cardKeyOf("없는화면", "today") === null);
  const 본 = new Set(), 겹친 = [];
  for (const it of ITEMS) { if (본.has(it.key)) 겹친.push(it.key); 본.add(it.key); }
  ok(`열쇠가 겹치지 않는다 (항목 ${ITEMS.length}개 · 물어보는 칸 ${칸수}칸)`, 겹친.length === 0, 겹친.join(" · "));
}

/* 역할 낱말이 **DB CHECK 가 받는 것**과 하나씩 짝인가 — 코드끼리 안 견준다 */
if (c) {
  const d = (await 문(
    `select pg_get_constraintdef(oid) d from pg_constraint
      where conrelid = 'v2.role_access'::regclass and contype='c'
        and pg_get_constraintdef(oid) like '%role = ANY%'`)).rows[0]?.d ?? "";
  const 받는역할 = [...d.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
  const 코드역할 = ROLE_LIST.map((r) => r.id);
  console.log(`   · v2.role_access.role CHECK 실측: ${받는역할.join(" · ") || "(못 읽음)"}`);
  ok("CHECK 를 읽었다", 받는역할.length > 0);
  ok("⚠️⚠️ 물어보는 역할 넷이 **DB CHECK 와 하나씩 짝이다** (어긋나면 원장님이 켜신 순간 DB 가 거절한다)",
     받는역할.length > 0 && 있는것(코드역할, 받는역할).length === 0 && 있는것(받는역할, 코드역할).length === 0,
     `코드에만: ${있는것(코드역할, 받는역할).join(" · ")} / DB 에만: ${있는것(받는역할, 코드역할).join(" · ")}`);
  ok("⚠️ CHECK 가 **원장을 안 받는다** (원장이 이 표를 타면 스스로를 잠글 길이 생긴다)",
     받는역할.length > 0 && !받는역할.includes(PRINCIPAL), 받는역할.join(" · "));
  const 못넣는 = [];
  for (const it of ITEMS) for (const r of it.roles)
    if (받는역할.length && !받는역할.includes(r)) 못넣는.push(`${r}|${it.key}`);
  ok("항목이 가리키는 역할이 전부 DB 가 받는 낱말이다", 못넣는.length === 0, 못넣는.join(" · "));
}

/* ═══════════════════════════════════════════════════════════════════
 * 3. 세 상태 — 「끔」과 「아직 안 정함」이 **구별되나**
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 3. 세 상태가 살아 있나 (on · off · unset)");

const 본보기 = ITEMS.find((i) => i.roles.includes("instructor"));
{
  const 켬 = { [칸이름("instructor", 본보기.key)]: true };
  const 끔 = { [칸이름("instructor", 본보기.key)]: false };
  ok("켬 → `on`", stateOf("instructor", 본보기.key, 켬) === "on");
  ok("끔 → `off`", stateOf("instructor", 본보기.key, 끔) === "off");
  ok("줄 없음 → `unset` (**「끔」과 다른 상태다**)", stateOf("instructor", 본보기.key, {}) === "unset");
  ok("⚠️⚠️ 「끔」과 「아직 안 정함」이 **다른 말을 한다**",
     whyOff("instructor", 본보기.key, "unset") !== whyOff("instructor", 본보기.key, "off")
     && /안 정하/.test(whyOff("instructor", 본보기.key, "unset"))
     && /꺼 두/.test(whyOff("instructor", 본보기.key, "off")));
  ok("⚠️ 막힌 글이 **「권한 없음」으로 끝나지 않는다** (어디서 켜는지까지 적는다)",
     /설정/.test(whyOff("instructor", 본보기.key, "unset")));
  ok("⚠️ 상태를 안 넘기면 **「안 정함」으로 우기지 않는다**",
     !/안 정하/.test(whyOff("instructor", 본보기.key)));
  const 문막힘 = blockedBy("instructor", 본보기.key, {});
  ok("막힌 자리에 **나가는 길이 있다** (대전제-10)",
     문막힘.ok === false && 문막힘.state === "unset" && 문막힘.how.some((x) => /나가기/.test(x)));
  ok("막힌 자리가 **끄면 무엇이 사라지나**까지 적는다", 문막힘.how.some((x) => /못 하시는 일/.test(x)));
  ok("못 읽었을 때는 **기본값으로 안 돌고** 「못 읽었다」로 막는다",
     blockedBy("instructor", 본보기.key, null, "표를 못 읽었습니다").state === "unread");
  ok("참거짓만 값으로 본다 (`\"true\"`·1 을 켬으로 안 읽는다)",
     stateOf("instructor", 본보기.key, { [칸이름("instructor", 본보기.key)]: "true" }) === "unset"
     && stateOf("instructor", 본보기.key, { [칸이름("instructor", 본보기.key)]: 1 }) === "unset");
  ok("꼴이 다른 DB 줄은 **버린다** (지어내지 않는다)",
     Object.keys(rowsOf([{ role: "instructor", key: "page.ops", allowed: "네" },
                         { role: "", key: "x", allowed: true }])).length === 0);
}

/* 3-2 **진짜 DB 로** — 앱이 쓰는 그 문장(`PUT_ACCESS`)을 글자에서 뽑아 돌린다 */
const 액션글 = 읽기("app/settings/actions.js");
const PUT_ACCESS = (액션글.match(/const\s+PUT_ACCESS\s*=\s*`([\s\S]*?)`/) ?? [])[1] ?? "";
ok("⚠️ 저장 문장(`PUT_ACCESS`)을 **앱 파일 글자에서 뽑았다** (베끼지 않았다)",
   /insert\s+into\s+v2\.role_access/i.test(PUT_ACCESS), "app/settings/actions.js 에서 못 찾았다");

if (c && PUT_ACCESS) {
  const 열쇠 = 본보기.key;
  const 모두읽기 = async () => rowsOf((await 문(`select role,key,allowed from v2.role_access`)).rows);
  const 한줄 = async () =>
    (await 문(`select allowed from v2.role_access where role='instructor' and key=$1`, [열쇠])).rows[0];

  const a = await 문(PUT_ACCESS, [["instructor"], [열쇠], true]);
  ok("① 원장님이 켜시면 **한 줄이 선다**", a.n === 1 && (await 한줄())?.allowed === true, a.err ?? "");
  const 켠뒤 = unsetCount(await 모두읽기());
  ok(`② 켜면 「아직 안 정한 것」이 하나 준다 (${칸수} → ${켠뒤})`, 켠뒤 === 칸수 - 1);

  const b = await 문(PUT_ACCESS, [["instructor"], [열쇠], false]);
  const 끈줄 = await 한줄();
  ok("③ ⚠️⚠️ **끄면 줄이 남는다** (지우지 않는다 · 대전제-6)",
     b.n === 1 && 끈줄?.allowed === false, b.err ?? JSON.stringify(끈줄));
  const 끈뒤 = unsetCount(await 모두읽기());
  ok(`④ ⚠️⚠️ **「끔」은 「아직 안 정함」이 아니다** — 셈이 안 늘어난다 (${끈뒤})`, 끈뒤 === 칸수 - 1);

  await 문(`delete from v2.role_access where role='instructor' and key=$1`, [열쇠]);
  const 지운뒤 = unsetCount(await 모두읽기());
  ok(`⑤ 줄이 사라지면 다시 「아직 안 정함」이다 (${지운뒤}) — 그래서 **지우는 길을 앱에 안 준다**`,
     지운뒤 === 칸수);

  const 권 = (await 문(
    `select privilege_type p from information_schema.role_table_grants
      where table_schema='v2' and table_name=$1 and grantee='authenticated'`, [TABLE.name])).rows.map((r) => r.p);
  console.log(`   · authenticated 권한: ${권.join(" · ") || "(없음)"}`);
  ok("⚠️⚠️ 앱 계정에 **DELETE 권한이 없다** — 「끔」을 「안 정함」으로 되돌릴 길이 없다(대전제-6)",
     권.length > 0 && !권.includes("DELETE"), 권.join(" · "));
  ok("앱 계정이 읽고·넣고·고칠 수는 있다 (없으면 원장님이 화면에서 못 정하신다)",
     ["SELECT", "INSERT", "UPDATE"].every((x) => 권.includes(x)), 권.join(" · "));
}

/* ═══════════════════════════════════════════════════════════════════
 * 4. 원장은 늘 참 — 화면 · lib · DB 세 곳 다
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 4. 원장은 늘 참 — 스스로 잠글 길이 없다 (화면 · lib · DB)");

const 전부끔 = {};
for (const it of ITEMS) for (const r of [...it.roles, PRINCIPAL]) 전부끔[칸이름(r, it.key)] = false;
{
  const 막힌것 = ITEMS.filter((it) => !canFor(PRINCIPAL, it.key, null) || !canFor(PRINCIPAL, it.key, {}));
  ok("lib — **무엇을 꺼도** 원장은 모든 항목에 참이다", 막힌것.length === 0, 막힌것.map((i) => i.key).join(" · "));
  ok(`lib — **${칸수}칸을 다 끈 저장값**으로도 원장은 참이다`,
     ITEMS.every((it) => canFor(PRINCIPAL, it.key, 전부끔)));
  ok("lib — 원장 메뉴는 저장값과 **무관하게** 대메뉴 전부다",
     menuFor(PRINCIPAL, null).length === SECTIONS.length && menuFor(PRINCIPAL, 전부끔).length === SECTIONS.length);
  ok("lib — 원장 화면은 카드를 **하나도 안 뺀다** (확정-⑮ 「빈 카드는 아이·학부모 화면에서만」)",
     visibleCards(PRINCIPAL, "me", [...CARDS.me], 전부끔).length === CARDS.me.length
     && visibleCards(PRINCIPAL, "parent", [...CARDS.parent], 전부끔).length === CARDS.parent.length);
  ok("lib — 원장에게는 `blockedBy` 가 늘 열린다", ITEMS.every((it) => blockedBy(PRINCIPAL, it.key, 전부끔).ok));
  ok("lib — 원장에게는 **아무것도 안 묻는다** (`itemsFor` 0개 · `ROLE_LIST` 에 없다)",
     itemsFor(PRINCIPAL).length === 0 && !ROLE_LIST.some((r) => r.id === PRINCIPAL));
  ok("lib — `isPrincipal` 은 원장만 참", isPrincipal(PRINCIPAL) && !isPrincipal("instructor") && !isPrincipal(null));
  ok("화면 — 「누가 무엇을 보나」 표에 **원장 칸이 없다** (그려지면 그날 스스로를 잠그신다)",
     !everyCell(null).some((x) => x.role === PRINCIPAL));
}
if (c) {
  ok("DB — `v2.role_access` 에 원장 줄을 **넣을 수 없다** (CHECK 가 막는다)",
     (await 문(`insert into v2.role_access(role,key,allowed) values ('principal','page.ops',false)`)).err !== null);

  const 열쇠들 = [...new Set(ITEMS.map((i) => i.key))];
  const 다끄기 = await 문(
    `insert into v2.role_access(role,key,allowed)
     select r, k, false from unnest($1::text[]) r cross join unnest($2::text[]) k
     on conflict (role,key) do update set allowed = false`,
    [ROLE_LIST.map((r) => r.id), 열쇠들]);
  ok(`DB — 모든 역할 × 모든 열쇠를 껐다 (${다끄기.n}줄 · 이 트랜잭션 안에서만)`, 다끄기.err === null, 다끄기.err ?? "");
  const 원장참 = await 되어(P.원장,
    `select count(*)::int n from unnest($1::text[]) k where v2.can(k) is not true`, [열쇠들]);
  ok(`DB — ⚠️⚠️ **모든 칸을 끈 뒤에도** 원장은 \v2.can()\ 이 전부 참이다 (거짓인 열쇠 ${원장참.n}개)`,
     원장참.err === null && 원장참.n === 0, 원장참.err ?? "");
  const 강사참 = await 되어(P.강사,
    `select count(*)::int n from unnest($1::text[]) k where v2.can(k) is true`, [열쇠들]);
  ok(`DB — 같은 값으로 강사는 **전부 거짓이다** (참인 열쇠 ${강사참.n}개 · 그래야 위 말이 뜻이 있다)`,
     강사참.err === null && 강사참.n === 0, 강사참.err ?? "");
  await 문(`delete from v2.role_access`);
}

/* ═══════════════════════════════════════════════════════════════════
 * 5. 강사가 제 권한을 못 고친다
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 5. 강사·조교·아이·학부모가 **제 권한을 못 고친다**");

if (c) {
  const 열쇠 = 본보기.key;
  await 문(`insert into v2.role_access(role,key,allowed) values ('instructor',$1,false)
            on conflict (role,key) do update set allowed = false`, [열쇠]);

  /* ⚠️ **「권한이 없어서」 막힌 것을 통과로 세지 않는다** — 권한이 아예 없으면 원장님도 못 쓰는데
   *    검사만 초록으로 지나간다(check-v2-rls 의 가름과 같다).                                   */
  const 막혔나 = (이름, r) => {
    if (r.err && /permission denied/i.test(r.err)) {
      ok(`${이름} — ⚠️ **권한이 없어서** 막혔다 (접근 규칙 검사가 아니다)`, false, r.err);
      return;
    }
    ok(`${이름} — 막혔다 (${r.err ? "접근 규칙이 거절" : r.n + "줄"})`, r.err !== null || r.n === 0, r.err ?? "");
  };
  for (const [이름, pid, 낱말] of [["강사", P.강사, "instructor"], ["아이", P.학생, "student"], ["학부모", P.학부모, "parent"]]) {
    막혔나(`${이름}가 제 권한을 **켠다**`,
      await 되어(pid, `update v2.role_access set allowed = true where key = $1`, [열쇠]));
    막혔나(`${이름}가 제 권한 줄을 **새로 넣는다**`,
      await 되어(pid, `insert into v2.role_access(role,key,allowed) values ($1,'page.ops',true)`, [낱말]));
  }
  const 남은 = (await 문(`select allowed from v2.role_access where role='instructor' and key=$1`, [열쇠])).rows[0];
  ok("⚠️ 그러고도 값이 **그대로 꺼져 있다** (세어서 확인)", 남은?.allowed === false, JSON.stringify(남은));
  const 줄수 = await 문(`select count(*)::int n from v2.role_access`);
  ok(`⚠️ 줄 수도 그대로다 (${줄수.n}줄 — 새로 생긴 줄이 없다)`, 줄수.n === 1);

  const 강사읽기 = await 되어(P.강사, `select count(*)::int n from v2.role_access`);
  ok(`강사는 제 역할 줄만 읽는다 (강사 ${강사읽기.n}줄 / 전체 ${줄수.n}줄)`,
     강사읽기.err === null && 강사읽기.n <= 줄수.n, 강사읽기.err ?? "");
  const 학생읽기 = await 되어(P.학생, `select count(*)::int n from v2.role_access where role <> 'student'`);
  ok("아이는 **남의 역할 줄을 못 읽는다**", 학생읽기.err !== null || 학생읽기.n === 0, 학생읽기.err ?? "");
  const 원장읽기 = await 되어(P.원장, `select count(*)::int n from v2.role_access`);
  ok("원장은 **전부 읽는다** (안 그러면 설정 화면이 못 뜬다)", 원장읽기.err === null && 원장읽기.n === 줄수.n,
     원장읽기.err ?? `${원장읽기.n}줄`);
  await 문(`delete from v2.role_access`);
}
{
  const 액션 = 코드만(액션글);
  ok("앱 — 저장하는 손이 `isPrincipal` 을 지난다 (DB 접근 규칙 위에 **두 겹째**)",
     /isPrincipal\s*\(/.test(액션) && 부름들(액션, "writeAs").length > 0,
     "원장님이 강사에게 설정을 켜 주시는 날, 강사가 제 권한을 스스로 켠다");
  const 넣는곳 = (액션.match(/insert\s+into\s+v2\.role_access/gi) ?? []).length;
  ok(`앱 — 「누가 무엇을 보나」를 저장하는 SQL 이 **한 문장뿐이다** (지금 ${넣는곳}곳 · 원칙-1)`, 넣는곳 === 1);
  ok("앱 — 누가 눌렀는지는 **서버가 정한다** (`v2.me()` · 표-10)",
     /v2\.me\(\)/.test(PUT_ACCESS), "화면이 보낸 사람 아이디를 믿으면 남의 이름으로 저장된다");
  ok("앱 — 저장하는 손이 `role_access` 를 **지우지 않는다** (대전제-6)",
     !/delete\s+from\s+v2\.role_access/i.test(액션));
}

/* ═══════════════════════════════════════════════════════════════════
 * 6. ⚠️⚠️ DB 가 **실제로** 막나 — 켜고 → 읽히고 → 끄고 → 안 읽히고
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 6. 민감한 표 — 켜고 → 읽히고 → 끄고 → 안 읽히나 (진짜로 밟는다)");

/** 시험 줄을 어떻게 세우고·세고·고치나. ⚠️ **모르는 표가 나오면 건너뛰지 않고 실패한다** */
const 시험줄 = {
  payment: {
    값: [아이, 표시],
    세우기: `insert into v2.payment(student_id, ym, amount, note, import_batch) values ($1,'2099-01',0,$2,'fixture')`,
    세기: `select count(*)::int n from v2.payment where student_id = $1 and note = $2`,
    고치기: `update v2.payment set note = note where student_id = $1 and note = $2`,
  },
  fee_rule: {
    값: [아이],
    세우기: `insert into v2.fee_rule(student_id, from_date, amount) values ($1,'2099-01-01',0)`,
    세기: `select count(*)::int n from v2.fee_rule where student_id = $1 and from_date = '2099-01-01'`,
    고치기: `update v2.fee_rule set amount = amount where student_id = $1 and from_date = '2099-01-01'`,
  },
  consult: {
    값: [아이, 표시],
    세우기: `insert into v2.consult(student_id, body, import_batch) values ($1,$2,'fixture')`,
    세기: `select count(*)::int n from v2.consult where student_id = $1 and body = $2`,
    고치기: `update v2.consult set body = body where student_id = $1 and body = $2`,
  },
  inquiry: {
    값: [표시],
    세우기: `insert into v2.inquiry(name) values ($1)`,
    세기: `select count(*)::int n from v2.inquiry where name = $1`,
    고치기: `update v2.inquiry set name = name where name = $1`,
  },
  integration: {
    값: [표시],
    세우기: `insert into v2.integration(id, config) values ($1,'{}'::jsonb)`,
    세기: `select count(*)::int n from v2.integration where id = $1`,
    고치기: `update v2.integration set config = config where id = $1`,
  },
};

/** 표 → 열쇠 짝을 **진짜 접근 규칙에서 뽑는다** (상수끼리 안 견준다 · 사고 ㉠) */
let 짝 = new Map();
if (c) {
  const 규칙 = (await 문(
    `select tablename, coalesce(qual,'') || ' ' || coalesce(with_check,'') t
       from pg_policies where schemaname='v2' and (qual like '%v2.can(%' or with_check like '%v2.can(%')
      order by tablename`)).rows;
  for (const r of 규칙)
    for (const m of String(r.t).matchAll(/v2\.can\('([^']+)'::text\)/g)) 짝.set(r.tablename, m[1]);
  console.log(`   · 접근 규칙이 \`v2.can()\` 을 타는 표: ${[...짝].map(([t, k]) => `${t}→${k}`).join(" · ") || "(없음)"}`);

  ok("⚠️⚠️ 민감한 표 **다섯이 접근 규칙에서 `v2.can()` 을 탄다** (화면만 가린 절반이 아니다)",
     짝.size >= 5, `지금 ${짝.size}개 — 다섯(payment·fee_rule·consult·inquiry·integration)보다 적다`);
  const 모르는열쇠 = [...짝.values()].filter((k) => itemOf(k) === null);
  ok("⚠️ 접근 규칙이 쓰는 열쇠가 전부 `lib/perm.js` 에 **선언돼 있다** (없으면 원장님이 끌 자리가 없다)",
     모르는열쇠.length === 0, 모르는열쇠.join(" · "));
  const 시험못하는 = [...짝.keys()].filter((t) => !시험줄[t]);
  ok("⚠️ 이 검사가 **그 표를 전부 밟을 줄 안다** (모르는 표는 건너뛰지 않고 여기서 실패한다)",
     시험못하는.length === 0, `시험 줄 세우는 법을 모르는 표: ${시험못하는.join(" · ")}`);

  for (const [표, 열쇠] of [...짝].sort()) {
    const 몫 = 시험줄[표];
    if (!몫) continue;
    const sp = `표${++표번호}`;
    await c.query(`savepoint ${sp}`);
    try {
      const 세움 = await 문(몫.세우기, 몫.값);
      ok(`[${표}] 시험 줄을 세웠다 (fixture · 되돌린다)`, 세움.err === null && 세움.n === 1, 세움.err ?? "");

      const 놓기 = async (allowed) =>
        allowed === null
          ? 문(`delete from v2.role_access where role='instructor' and key=$1`, [열쇠])
          : 문(`insert into v2.role_access(role,key,allowed) values ('instructor',$1,$2)
                on conflict (role,key) do update set allowed = excluded.allowed`, [열쇠, allowed]);

      await 놓기(true);
      const 켬읽기 = await 되어(P.강사, 몫.세기, 몫.값);
      ok(`[${표}] ① 원장님이 「${열쇠}」를 **켜시면 강사에게 읽힌다** (${켬읽기.n}줄)`,
         켬읽기.err === null && 켬읽기.n === 1, 켬읽기.err ?? "");
      const 켬쓰기 = await 되어(P.강사, 몫.고치기, 몫.값);
      ok(`[${표}] ② 켜시면 **고칠 수도 있다** (${켬쓰기.n}줄 · 그래야 아래 ④ 가 뜻이 있다)`,
         켬쓰기.err === null && 켬쓰기.n === 1, 켬쓰기.err ?? "");

      await 놓기(false);
      const 끔읽기 = await 되어(P.강사, 몫.세기, 몫.값);
      ok(`[${표}] ③ **끄시면 안 읽힌다** (${끔읽기.err ? "규칙이 막음" : 끔읽기.n + "줄"})`,
         끔읽기.err !== null || 끔읽기.n === 0, "");
      const 끔쓰기 = await 되어(P.강사, 몫.고치기, 몫.값);
      ok(`[${표}] ④ **끄시면 못 고친다** (${끔쓰기.err ? "규칙이 막음" : 끔쓰기.n + "줄"})`,
         끔쓰기.err !== null || 끔쓰기.n === 0, "");

      await 놓기(null);
      const 안정함 = await 되어(P.강사, 몫.세기, 몫.값);
      ok(`[${표}] ⑤ **아직 안 정하셨으면 안 읽힌다** (fail closed · ${안정함.err ? "규칙이 막음" : 안정함.n + "줄"})`,
         안정함.err !== null || 안정함.n === 0, "");

      const 원장 = await 되어(P.원장, 몫.세기, 몫.값);
      ok(`[${표}] ⑥ 셋 어느 때든 **원장은 읽는다** (${원장.n}줄)`, 원장.err === null && 원장.n === 1, 원장.err ?? "");
    } finally {
      await c.query(`rollback to savepoint ${sp}`);
      await c.query(`release savepoint ${sp}`);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 7. 화면도 막나 — ⚠️ **철자를 굳히지 말고 규칙을 본다**
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 7. 화면도 막나 (메뉴에서 빼는 것만으로는 주소를 치면 열린다)");

/* 별명(예: `canSettings` → `page.settings`)을 **lib/menu.js 글자에서 뽑는다.**
 * 손으로 적으면 이름을 바꾼 날 검사만 옛 이름으로 초록이 된다.                      */
const 별명 = new Map();
for (const m of 읽기("lib/menu.js").matchAll(
  /export\s+const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*canFor\(\s*[^,]+,\s*["']([^"']+)["']/g))
  별명.set(m[1], m[2]);
console.log(`   · 열쇠를 감싼 이름: ${[...별명].map(([a, b]) => `${a}→${b}`).join(" · ") || "(없음)"}`);
ok("`lib/menu.js` 의 감싼 이름이 **진짜 열쇠**를 가리킨다",
   별명.size > 0 && [...별명.values()].every((k) => itemOf(k) !== null), [...별명.values()].join(" · "));

/** 그 주소가 사는 폴더의 코드 전부 — 파일 이름을 손으로 안 적는다 */
const 라우트코드 = (href) => {
  const 파일 = href === "/"
    ? [...readdirSync("app").filter((f) => /\.jsx?$/.test(f)).map((f) => join("app", f)), ...훑기("app/_home")]
    : 훑기(join("app", href.slice(1)));
  return 파일.map((f) => 앱코드.get(f) ?? 코드만(읽기(f))).join("\n");
};
{
  const 안지킴 = [];
  for (const it of ITEMS.filter((i) => i.group === "page")) {
    const code = 라우트코드(it.href);
    const 열쇠로 = code.includes(`"${it.key}"`) || code.includes(`'${it.key}'`);
    // ⚠️ 한글 이름도 잡는다 — `\b` 는 한글 앞에서 안 걸린다(위 `부름들` 주석과 같은 자리)
    const 별명으로 = [...별명].some(([이름, k]) =>
      k === it.key && new RegExp(`(?<![\\w가-힣])${이름}\\s*\\(`).test(code));
    /* ⚠️⚠️ **부르기만 보면 안 된다.** 앞판은 여기까지만 봤고, 그래서 대시보드에서
     *    `if (!문.ok) return …` 한 줄을 지워도 **초록이었다** — 부름은 남아 있으니까.
     *    (일부러 지워 보고 확인했다. 검사가 헛돌던 자리다 — 폰-5)
     * ⚠️ 그렇다고 「이 파일 어딘가에 return 이 있나」로 보면 **아무 파일이나 통과한다** —
     *    화면 파일에는 return 도 `.ok` 도 널려 있다. 그래서 **그 답을 담은 이름**을 찾아
     *    그 이름의 `.ok` 를 실제로 보는 줄이 있는지만 본다.
     *    → 막는 답을 안 쓰면 「켜고 끄는 칸만 있고 걸리는 데가 없다」가 된다. */
    /* ⚠️ `const 문 = 조건 ? blockedBy(…) : null` 처럼 **사이에 말이 끼어도** 잡는다.
     *    앞판은 `= blockedBy(` 만 봐서, 조건을 앞에 둔 화면을 「문지기 없음」으로 잘못 짚었다. */
    const 담은이름 = [...code.matchAll(/(?:const|let|var)\s+([\w가-힣$]+)\s*=[^;\n]*?blockedBy\s*\(/g)]
      .map((m) => m[1]);
    /* ⚠️ 막는 **모양**까지 정하지 않는다 — `if (!문.ok) return` 도 `const staff = 문.ok` 도
     *    둘 다 막는 것이다. 모양을 못 박으면 화면마다 억지로 한 꼴을 쓰게 된다.
     *    봐야 하는 것은 **그 답을 읽기는 하나**다. 안 읽으면 부르기만 하고 버린 것이다. */
    const 막는줄 = 담은이름.some((n) => new RegExp(`${n}\\.ok\\b`).test(code));
    if ((!열쇠로 && !별명으로) || !막는줄) 안지킴.push(`${it.href} (${it.key})`);
  }
  ok("⚠️⚠️ 대메뉴 **일곱이 저마다 서버에서 막힌다** (메뉴에서 빼도 주소를 치면 열린다)",
     안지킴.length === 0,
     `문지기가 없는 주소: ${안지킴.join(" · ")}\n` +
     `그 화면은 원장님이 꺼도 주소를 치면 그대로 열린다 — 켜고 끄는 칸만 있고 걸리는 데가 없다.`);
}
{
  /* ⚠️ 저장값을 안 넘기면 **원장님이 켜셔도 안 열린다.** 아무 오류도 안 난다 */
  const 모자란 = [];
  for (const [f, code] of 앱코드) {
    for (const 이름 of 별명.keys())
      for (const 인자 of 부름들(code, 이름))
        if (인자쪼개기(인자).length < 2) 모자란.push(`${f}  ${이름}(${인자.trim()})`);
    for (const 인자 of 부름들(code, "canFor"))
      if (인자쪼개기(인자).length < 3) 모자란.push(`${f}  canFor(${인자.trim()})`);
  }
  ok("⚠️⚠️ 판단을 부를 때 **저장값(rows)을 끝까지 넘긴다**",
     모자란.length === 0,
     `저장값을 안 넘기는 자리:\n${모자란.join("\n")}\n` +
     `→ 저장값이 없으면 원장 말고는 무조건 거짓이다. **원장님이 켜셔도 그 자리는 안 열린다.**`);
}
{
  /* 막는 화면은 **글을 스스로 짓지 않는다** — 지으면 한쪽만 「아직 안 정하셨습니다」를 말한다 */
  const 스스로 = [];
  for (const [f, code] of 앱코드) {
    const 막나 = [...별명.keys()].some((이름) => new RegExp(`\\b${이름}\\s*\\(`).test(code)) || /\bcanFor\s*\(/.test(code);
    if (!막나) continue;
    const lib글 = /whyOff\s*\(|blockedBy\s*\(/.test(code);
    const 손글 = /role\s*===\s*["'](instructor|assistant|student|parent)["']/.test(code);
    if (손글 && !lib글) 스스로.push(f);
  }
  ok("⚠️ 막힌 까닭을 **화면이 스스로 짓지 않는다** (`whyOff`/`blockedBy` 한 벌 · 원칙-1)",
     스스로.length === 0,
     `역할 낱말로 까닭을 손수 적는 곳: ${스스로.join(" · ")}\n` +
     `→ 「아직 안 정하셨습니다」와 「꺼 두셨습니다」가 안 갈리고, 조교가 그 글에서 빠진다.`);
}
{
  const ops = 라우트코드("/ops");
  const 안지킴 = ITEMS.filter((i) => i.group === "ops")
    .filter((i) => !new RegExp(`["']${i.key.replace(".", "\\.")}["']`).test(ops)).map((i) => i.key);
  ok("운영 화면의 카드 셋이 **저마다** 판단을 지난다 (수강료·상담일지·신규 문의)",
     안지킴.length === 0, 안지킴.join(" · "));
  const 글없는 = ITEMS.filter((i) => i.group === "ops")
    .filter((i) => !부름들(ops, "blockedBy").some((인자) => 인자.includes(i.key))).map((i) => i.key);
  ok("꺼진 카드마다 **까닭이 그 자리에 뜬다** (`blockedBy` — 빈 자리로 두지 않는다)",
     글없는.length === 0, 글없는.join(" · "));
  const 막고읽기 = (ops.match(/\?\s*await\s+load\w+\(/g) ?? []).length;
  ok(`⚠️ 꺼진 카드는 **자료를 아예 안 읽는다** (조건 뒤에서만 읽는 자리 ${막고읽기}곳 · §속도)`,
     막고읽기 >= 3, "읽고 안 그리면 헛일이고 느려진다");
}
{
  const 문지기 = [...앱코드].filter(([, code]) => /\bblockedBy\s*\(/.test(code)).map(([f]) => f);
  console.log(`   · \`blockedBy\` 를 지나는 자리: ${문지기.join(" · ") || "(없음)"}`);
  ok("⚠️ 서버 문지기가 **lib 의 한 벌**(`blockedBy`)을 지난다 (화면마다 다시 짜지 않는다)",
     문지기.length >= 5, `지금 ${문지기.length}곳`);
  const 안넘김 = [];
  for (const f of 문지기)
    for (const 인자 of 부름들(앱코드.get(f) ?? "", "blockedBy"))
      if (인자쪼개기(인자).length < 3) 안넘김.push(`${f}  blockedBy(${인자.trim()})`);
  ok("문지기가 `blockedBy` 에 **저장값까지** 넘긴다", 안넘김.length === 0, 안넘김.join("\n"));
}

/* ═══════════════════════════════════════════════════════════════════
 * 8. 화면이 항목 목록을 **다시 적지 않나** (검사-⑲ · 원칙-1)
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 8. 화면이 항목 목록을 다시 적지 않나 (검사-⑲)");

{
  const 설정파일 = APP.filter((f) => f.startsWith("app/settings/"));
  const 열쇠박힌 = [], 이름박힌 = [];
  for (const f of 설정파일) {
    const code = 앱코드.get(f) ?? "";
    /* ⚠️ **제 화면을 스스로 막는 자리는 뺀다.** `blockedBy(role, "page.settings", …)` 는
     *    목록을 다시 적는 것이 아니라 **그 화면이 제 문을 잠그는 것**이고, 대메뉴 일곱이
     *    저마다 그렇게 한다(그 자리를 다른 단언이 따로 지킨다).
     *    안 빼면: 문지기를 제대로 단 화면일수록 이 검사가 빨개진다 — 거꾸로 된 잣대다. */
    const 제문 = /blockedBy\s*\([^,]+,\s*["']([^"']+)["']/g;
    const 제문열쇠 = new Set([...code.matchAll(제문)].map((m) => m[1]));
    for (const it of ITEMS)
      if ((code.includes(`"${it.key}"`) || code.includes(`'${it.key}'`)) && !제문열쇠.has(it.key))
        열쇠박힌.push(`${f}: ${it.key}`);
    for (const r of ROLE_LIST) if (code.includes(`"${r.name}"`) || code.includes(`'${r.name}'`)) 이름박힌.push(`${f}: ${r.name}`);
  }
  ok(`⚠️ 설정 화면이 **열쇠를 손으로 안 적는다** (${설정파일.length}개 파일 · everyCell() 이 준 것만 그린다)`
       .replace(/`/g, ""), 열쇠박힌.length === 0, 열쇠박힌.join(" · "));
  ok("⚠️ 설정 화면이 **역할 이름도 손으로 안 적는다** (`ROLE_LIST` 에서 받는다)",
     이름박힌.length === 0, 이름박힌.join(" · "));

  const 설명박힌 = [];
  for (const [f, code] of 앱코드)
    for (const it of ITEMS) if (it.cost && code.includes(it.cost.slice(0, 20))) 설명박힌.push(`${f}: ${it.key}`);
  ok("⚠️ 「끄면 무엇이 사라지나」 글이 화면에 **베껴져 있지 않다**", 설명박힌.length === 0, 설명박힌.join(" · "));

  const 열쇠꼴 = "(?:page|ops|me|parent)\\.[a-z]+";
  const 나열 = [];
  for (const [f, code] of 온코드) {
    if (f === "lib/perm.js") continue;              // 여기가 원본이다
    const m = code.match(new RegExp(`["']${열쇠꼴}["']\\s*,\\s*["']${열쇠꼴}["']\\s*,\\s*["']${열쇠꼴}["']`));
    if (m) 나열.push(`${f}: ${m[0].slice(0, 60)}`);
  }
  ok("⚠️ 열쇠 목록을 **배열로 다시 적은 자리가 없다** (원본은 `lib/perm.js` 하나)",
     나열.length === 0, 나열.join(" · "));

  ok("역할 전부를 켜고 끌 때 열쇠를 **서버가 만든다** (`itemsFor(role)` · 화면이 안 보낸다)",
     /itemsFor\s*\(/.test(코드만(액션글)), "화면이 낡으면 새 항목만 조용히 안 바뀐다");
}

/* ═══════════════════════════════════════════════════════════════════
 * 9. 꺼진 카드는 안 그려지고 **자료도 안 읽는다**
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 9. 꺼진 카드 — 안 그려지나 · 자료를 안 읽나");

{
  const 켬 = {};
  for (const it of ITEMS) if (it.group === "me" || it.group === "parent")
    for (const r of it.roles) 켬[칸이름(r, it.key)] = true;
  const 끔 = { ...켬, [칸이름("student", "me.books")]: false, [칸이름("parent", "parent.reports")]: false };

  ok("전부 켜면 카드가 다 보인다",
     visibleCards("student", "me", [...CARDS.me], 켬).length === CARDS.me.length
     && visibleCards("parent", "parent", [...CARDS.parent], 켬).length === CARDS.parent.length);
  ok("끈 카드는 **안 그려진다**",
     !visibleCards("student", "me", [...CARDS.me], 끔).includes("books")
     && !visibleCards("parent", "parent", [...CARDS.parent], 끔).includes("reports"));
  ok("⚠️ 안 정한 카드도 안 그려진다 (fail closed)",
     visibleCards("student", "me", [...CARDS.me], {}).length === 0
     && visibleCards("parent", "parent", [...CARDS.parent], null).length === 0);
  const 차례 = [...CARDS.me];
  visibleCards("student", "me", 차례, 끔);
  ok("⚠️ 거르면서 **차례 목록 자체를 안 바꾼다** (다시 켜신 날 제자리로 와야 한다)",
     차례.join("|") === CARDS.me.join("|"));

  for (const [f, 화면] of [["app/me/screen.js", "me"], ["app/parent/view.js", "parent"]])
    ok(`${f} 가 \visibleCards\ 를 지난다 (${화면})`, /visibleCards\s*\(/.test(앱코드.get(f) ?? ""),
       "안 지나면 원장님이 꺼도 카드가 그대로 그려진다");
}
{
  for (const [f, 무리] of [["app/me/read.js", "me"], ["app/parent/read.js", "parent"]]) {
    const code = 앱코드.get(f) ?? "";
    const 연다인자 = 부름들(code, "연다").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    const 밖에있는 = ITEMS.filter((i) => i.group === 무리)
      .filter((i) => (code.includes(`"${i.key}"`) || code.includes(`'${i.key}'`)) && !연다인자.includes(i.key))
      .map((i) => i.key);
    ok(`${f} — 그 화면의 열쇠가 전부 **막는 자리 안에** 있다 (조회를 세우는 자리다)`,
       밖에있는.length === 0, `막는 자리 밖에서 쓰이는 열쇠: ${밖에있는.join(" · ")}`);
    ok(`${f} — 막고 읽는 카드가 하나 이상 있다 (${연다인자.length}개)`, 연다인자.length > 0);

    /* ⚠️ **순서가 뜻이다.** 권한을 뒤에 물으면 이미 다 읽은 뒤라 꺼진 카드의 자료도 읽어 버린다 */
    const 권한자리 = code.indexOf("TABLE.name");
    const 첫막음 = code.indexOf("연다(");
    ok(`${f} — **권한을 카드보다 먼저 읽는다** (뒤에 물으면 이미 다 읽은 뒤다)`,
       권한자리 > -1 && 첫막음 > -1 && 권한자리 < 첫막음,
       `권한 읽는 자리 ${권한자리} · 첫 막는 자리 ${첫막음}`);
    ok(`${f} — 표 이름을 **글자로 안 박고** \lib/perm.js\ 의 \TABLE\ 에서 받는다`,
       !/["']role_access["']/.test(code), "표가 바뀐 날 이 화면만 옛 이름을 쓴다");
    ok(`${f} — 못 읽으면 **기본값으로 안 돌고** null 로 둔다 (전부 닫힌다)`,
       /=\s*[^;\n]*\?\s*null\s*:/.test(code) || /\?\s*null\s*:/.test(code));
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 10. ⚠️ 등원 관문이 안 깨졌나 — `integration` 을 막았는데 그 표를 읽는다
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 10. 등원 관문 — `integration` 을 막았는데 `openGate` 가 그 표를 읽나");

if (c) {
  const 열쇠 = 짝.get("integration") ?? null;
  ok("`v2.integration` 이 `v2.can()` 을 탄다 (평문 열쇠가 든 표다 — 아이에게 열면 안 된다)", 열쇠 !== null);
  if (열쇠) await 문(`insert into v2.role_access(role,key,allowed) values ('instructor',$1,false)
                      on conflict (role,key) do update set allowed = false`, [열쇠]);
  const 강사 = await 되어(P.강사, `select count(*)::int n from v2.integration where id = 'arrival'`);
  ok("① 끈 뒤 **강사는 그 표를 못 읽는다** (그래야 아래 ③ 이 뜻이 있다)", 강사.err !== null || 강사.n === 0, "");
  const 아이가 = await 되어(P.학생, `select count(*)::int n from v2.integration where id = 'arrival'`);
  ok("② **아이는 언제나 못 읽는다** (솔라피·나이스 평문 열쇠가 같이 들어 있다)",
     아이가.err !== null || 아이가.n === 0, "");

  /* ③ ⚠️ 그런데도 관문은 읽혀야 한다 — `lib/arrival.js` 의 `readNet` 을 **그대로** 돌린다.
   *    `openGate()` 는 `process.env.DATABASE_URL` 로 **접근 규칙 밖(아무도 아닌 채)** 문을 연다.  */
  let net = null, 관문왜 = "";
  try {
    let 몇번 = 0;
    net = await readNet({
      query: (sql, params) => {
        if (++몇번 > 1) throw new Error("이 문으로는 한 줄 말고 아무것도 안 읽는다");
        return c.query(sql, params);
      },
    });
  } catch (e) { 관문왜 = String(e?.message ?? e).split("\n")[0]; }
  ok("③ ⚠️⚠️ **등원 관문은 그래도 읽힌다** (`lib/arrival.js` 의 `readNet` 을 그대로 돌렸다)",
     net !== null && net.has === true,
     `읽은 것: ${JSON.stringify(net)} ${관문왜}\n` +
     `→ 깨졌으면 아이가 「핸드폰 냈어요」를 눌러도 학원 회선 대역을 못 읽어 **등원이 통째로 막힌다.**`);
  ok("④ 관문 문이 **한 줄만** 읽는다 (자물쇠가 살아 있다)", net !== null && Array.isArray(net.ips));

  const 문코드 = 앱코드.get("app/api/arrival/route.js") ?? "";
  ok("⑤ 관문 문이 **접근 규칙 밖**으로 열린다 (`DATABASE_URL` · 그 사람 자격이 아니다)",
     /openGate/.test(문코드) && /process\.env\.DATABASE_URL/.test(문코드),
     "그 사람 자격으로 열면 아이에게는 늘 안 읽혀 등원이 막힌다");
  ok("⑥ 그 문으로 **다른 것을 더 읽지 못하게** 막아 두었다",
     부름들(문코드, "readNet").length > 0 && /\+\+\s*n\s*>\s*1/.test(문코드),
     "그 문은 접근 규칙 밖이라 자물쇠가 없으면 무엇이든 읽힌다");
  await 문(`delete from v2.role_access`);
}

/* ═══════════════════════════════════════════════════════════════════
 * 11. ⚠️ 크론·검사·이관이 안 깨졌나 — `auth.uid()` 가 없을 때
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 11. 크론·검사·이관 — 아무도 아닌 채로 돌 때 `v2.can()` 이 참인가");

if (c) {
  const 열쇠들 = [...new Set(ITEMS.map((i) => i.key))];
  const 아무도 = await 문(`select (auth.uid() is null)::int n`);
  ok("검사가 도는 이 자리가 정말 **아무도 아닌 채**다 (그래야 아래 말이 뜻이 있다)", 아무도.n === 1);
  const 거짓 = await 문(
    `select count(*)::int n from unnest($1::text[]) k where v2.can(k) is not true`, [열쇠들]);
  ok(`⚠️⚠️ 아무도 아닌 채면 \v2.can()\ 이 **모든 열쇠에 참이다** (거짓인 것 ${거짓.n}개)`,
     거짓.err === null && 거짓.n === 0,
     `${거짓.err ?? ""}\n→ 아니면 크론·검사·이관이 통째로 죽는다 (0082·0083 이 바로 이 자리에서 다쳤다).`);
  const 정의 = (await 문(
    `select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='v2' and p.proname='can'`)).rows[0]?.d ?? "";
  ok("`v2.can()` 안에 **`auth.uid() is null` 갈래가 있다**", /auth\.uid\(\)\s+is\s+null/.test(정의));
  ok("⚠️ `v2.can()` 안에 **원장 갈래가 있다** (없으면 원장님이 강사 칸을 끄시는 순간 원장 화면도 닫힌다)",
     /'principal'/.test(정의));
  ok("⚠️ `v2.can()` 이 **줄이 없으면 거짓**이다 (fail closed — 새 열쇠가 열린 채로 안 뜬다)",
     /coalesce\([\s\S]*?false\s*\)/.test(정의));
  const 표읽기 = await 문(`select count(*)::int n from v2.integration`);
  ok("아무도 아닌 채로 민감한 표가 읽힌다 (크론·이관이 도는 길)", 표읽기.err === null, 표읽기.err ?? "");
}

/* ═══════════════════════════════════════════════════════════════════
 * 12. 대시보드 부름 줄 — 안 정한 것을 **조용히 두지 않는다**
 * ═══════════════════════════════════════════════════════════════════ */
console.log("\n■ 12. 대시보드가 원장님을 부르나 (안 정한 채로 두면 아무도 까닭을 모른다)");

{
  const 홈 = 앱코드.get("app/page.js") ?? "";
  const 부품 = 앱코드.get("app/_home/parts.js") ?? "";
  const 설정부품 = 앱코드.get("app/settings/parts.js") ?? "";
  ok("대시보드가 「아직 안 정한 것 N개」를 **센다**", /readUnset\s*\(/.test(홈));
  ok("⚠️ **원장일 때만** 센다 (강사는 제 역할 줄만 읽어 숫자가 거짓이 된다)",
     /isPrincipal[\s\S]{0,80}readUnset/.test(홈));
  ok("⚠️ **0개면 안 뜬다** (다 정하셨는데 계속 부르면 다음부터 안 보신다)",
     /if\s*\(\s*!\s*n\s*\)\s*return\s+null/.test(부품));
  ok("⚠️ **못 셌으면 0 이라고 안 한다** — 까닭을 그대로 띄운다 (대전제-0)", /if\s*\(\s*why\s*\)/.test(부품));
  ok("부르는 줄이 **정하러 가는 길**을 준다", /href=["']\/settings["']/.test(부품));
  ok("⚠️ 세는 것은 `lib/perm.js` 한 벌이다 (화면이 다시 세지 않는다 · 원칙-5)",
     !/unsetCount/.test(부품) && /unsetCount/.test(읽기("app/settings/read.js")));
  ok("설정 화면에 역할마다 **「전부 켜기 / 전부 끄기」**가 있다 (32칸을 하나씩 누르게 하지 않는다)",
     /setRoleAll\s*\(/.test(설정부품));
  ok("⚠️ 「전부 끄기」를 **화면 안에서** 한 번 묻는다 (`confirm()` 을 안 쓴다 · 대전제-10)",
     !/\bconfirm\s*\(/.test(설정부품) && !/\balert\s*\(/.test(설정부품));
  ok("⚠️ 설정 화면이 **원장인지 한 번 더 본다** (`canSettings` 가 언젠가 강사에게 열려도 이 자리는 안 열린다)",
     /isPrincipal\s*\(/.test(앱코드.get("app/settings/page.js") ?? ""));
}

/* 12-2 **진짜로 세어 본다** — 대시보드가 부르는 그 함수를 그대로 돌린다.
 * ⚠️ 두 길(앱의 `readUnset` · lib 의 `unsetCount`)이 **같은 숫자**를 말해야 한다(원칙-1).
 * ⚠️ 이 문은 **다른 연결**이라 위 트랜잭션(비워 둔 상태)이 아니라 **진짜 값**을 본다 —
 *    그래서 트랜잭션 밖에서 먼저 읽어 둔 `처음줄` 과 견준다.                                   */
if (c) {
  process.env.DATABASE_URL ||= readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  let 앱셈 = null, 셈왜 = "";
  try { 앱셈 = await (await import("../app/settings/read.js")).readUnset(P.원장); }
  catch (e) { 셈왜 = String(e?.message ?? e).split("\n")[0]; }
  const lib셈 = unsetCount(rowsOf(처음줄));
  console.log(`   · 앱이 센 값 ${앱셈?.value?.n ?? "(못 셈)"} · lib 이 센 값 ${lib셈}`);
  ok("⚠️ 대시보드가 부르는 셈을 **진짜로 돌렸다** (문이 안 열리면 원장님이 안 정한 것을 영영 모르신다)",
     앱셈?.ok === true, 앱셈?.why || 셈왜);
  ok("⚠️ 앱이 센 값과 lib 이 센 값이 **같다** (두 벌이면 한쪽만 고쳐진다 · 원칙-1)",
     앱셈?.ok === true && 앱셈.value.n === lib셈, `앱 ${앱셈?.value?.n} · lib ${lib셈}`);
}

/* ═══════════════════════════════════════════════════════════════════
 * 끝 — 반드시 되돌리고, **세어서** 확인한다
 * ═══════════════════════════════════════════════════════════════════ */
if (c) {
  const 되돌리기전 = (await 문(`select count(*)::int n from v2.role_access`)).n;
  await 되돌리기();
  const 되돌린뒤 = Number((await c.query(`select count(*)::int n from v2.role_access`)).rows[0].n);
  const 사람 = Number((await c.query(`select count(*)::int n from v2.profiles`)).rows[0].n);
  console.log(`\n■ 되돌림 — v2.role_access ${되돌리기전}(검사 안) → ${되돌린뒤}(진짜) · 처음 ${처음줄.length}줄 · v2.profiles ${사람}줄`);
  ok("⚠️⚠️ **진짜 값을 그대로 되돌렸다** (트랜잭션 밖에서 다시 세어 확인)", 되돌린뒤 === 처음줄.length,
     `처음 ${처음줄.length}줄 → 지금 ${되돌린뒤}줄`);
  await c.end();
}

console.log(`\n■ 「누가 무엇을 보나」 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
