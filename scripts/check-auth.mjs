/** 로그인 검사 — **글자로 훑지 않고 lib/auth.js 를 실제로 돌린다.**
 *
 *  보는 것
 *    ① 전화번호 세 모양(`010-1234-5678` · `01012345678` · 공백 섞인 것)이 **한 사람**이 되는가
 *    ② `@chloe-eng.internal` 이 **lib/auth.js 한 곳에서만** 붙는가 · 화면엔 안 보이는가
 *    ③ 아이디 짓는 규칙이 **SQL 한 벌뿐**인가 (JS 가 몰래 두 벌로 안 짓는가)
 *    ④ 전화번호가 없거나 반쪽이면 **보류**로 막는가 (`'chloe'`·`'chloe1012'` 함정)
 *    ⑤ 겹치면(형제·뒤 4자리 같음) 지어내지 않고 **멈추는가**
 *    ⑥ ⚠️ 대전제 12 — 이 파일이 **비밀번호를 안 건드리고, DB 에 아무것도 안 쓰는가**
 *    ⑦ SQL 과 JS 의 전화번호 정규화가 **같은 답**을 내는가 (두 벌이 갈리는 것을 잡는 유일한 자리)
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import {
  INTERNAL_DOMAIN, normPhone, samePhone, phoneOk, toLoginEmail, displayLoginId,
  makeLoginId, findByLoginId, issueLoginId, loginIdOdd, loginIdCoverage,
} from "../lib/auth.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

/** ⚠️ 한 자리가 죽어도 **나머지를 끝까지 본다.**
 *  안 감싸면 첫 예외에서 통째로 멈춰 「■ … N건 · 실패 N」 줄이 안 나오고,
 *  뒤에 있던 진짜 실패를 아무도 못 본다 (실제로 한 번 겪었다). */
const sec = async (title, fn) => {
  console.log(title);
  try { await fn(); }
  catch (e) { n++; fail++; console.log(`   ❌ 이 자리가 도중에 죽었다 — ${e?.message ?? e}`); }
};

/** 가짜 DB — v2 함수를 **실측한 그대로** 흉내낸다 (함정까지 똑같이). 무엇을 물었는지 센다 */
function fakeDb({ taken = [], makeAs = null } = {}) {
  const calls = [];
  return { calls, async query(sql, p = []) {
    calls.push({ sql: sql.replace(/\s+/g, " ").trim(), p });
    if (sql.includes("v2.make_login_id")) {
      const [role, phone] = p;
      const d = String(phone ?? "").replace(/[^0-9]/g, "");
      if (makeAs) return { rows: [{ login_id: makeAs(role, d) }] };
      // ⚠️ 실측 그대로 — 폰이 비면 'chloe', '010-12' 면 'chloe1012' 가 나온다
      return { rows: [{ login_id: role === "student" ? "chloe" + d.slice(-4)
                      : role === "parent" ? d : null }] };
    }
    if (sql.includes("from v2.profiles where login_id")) {
      const hit = taken.find(t => t.login_id === p[0]);
      return { rows: hit ? [hit] : [] };
    }
    if (sql.includes("v2.login_id_odd")) return { rows: [{ login_id: "chloe8729-2", why: "학생인데 chloe+4자리가 아니다" }] };
    if (sql.includes("from v2.profiles")) return { rows: [] };
    return { rows: [] };
  } };
}

await sec("■ ① 전화번호 — 세 모양이 한 사람인가", async () => {
  const three = ["010-1234-5678", "01012345678", "  010 1234 5678 "];
  ok("숫자만 남기면 셋이 같다", new Set(three.map(normPhone)).size === 1, three.map(normPhone).join(" / "));
  ok("셋이 같은 로그인 이메일이 된다",
     new Set(three.map(t => toLoginEmail(t).email)).size === 1,
     three.map(t => toLoginEmail(t).email).join(" / "));
  ok("samePhone 이 셋을 같다고 한다", samePhone(three[0], three[1]) && samePhone(three[1], three[2]));
  // ⚠️ 여기가 뚫리면 전화번호 없는 48명이 전부 한 사람으로 뭉친다
  ok("⚠️ 빈 것 둘은 **같지 않다**", !samePhone("", "") && !samePhone(null, undefined) && !samePhone("-", " "));
  ok("모양 판정 — 10·11자리는 되고 9자리·02 는 안 된다",
     phoneOk("01012345678") && phoneOk("0101234567") && !phoneOk("010123456") && !phoneOk("0212345678"));
});

await sec("\n■ ② 속 도메인 — 여기서만 붙고, 화면엔 안 보인다", async () => {
  ok("학생 아이디에 붙는다", toLoginEmail("chloe0515").email === `chloe0515@${INTERNAL_DOMAIN}`,
     toLoginEmail("chloe0515").email);
  ok("학부모는 숫자만 남겨 붙는다", toLoginEmail("010-6290-8729").email === `01062908729@${INTERNAL_DOMAIN}`,
     toLoginEmail("010-6290-8729").email);
  // ⚠️ 두 번 붙으면 `...internal@...internal` 이 되어 아무도 못 들어온다
  ok("⚠️ 이미 붙여 쳐도 두 번 안 붙는다",
     toLoginEmail(`chloe0515@${INTERNAL_DOMAIN}`).email === `chloe0515@${INTERNAL_DOMAIN}`,
     toLoginEmail(`chloe0515@${INTERNAL_DOMAIN}`).email);
  // ⚠️ 여기가 뚫리면 원장님이 못 들어온다
  ok("⚠️ 진짜 이메일(원장·강사)에는 **안 붙는다**",
     toLoginEmail("bdyj10@gmail.com").email === "bdyj10@gmail.com"
     && toLoginEmail("bdyj10@gmail.com").typedAs === "email", toLoginEmail("bdyj10@gmail.com").email);
  ok("대문자로 쳐도 같은 곳으로 간다", toLoginEmail("CHLOE0515").email === toLoginEmail("chloe0515").email);
  ok("폰 자판이 넣는 공백을 턴다", toLoginEmail(" chloe0515 ").email === `chloe0515@${INTERNAL_DOMAIN}`);
  ok("빈 글자는 못 지나간다", toLoginEmail("").ok === false && toLoginEmail("   ").ok === false);
  ok("전화번호 모양이 아닌 숫자는 못 지나간다 (0515)",
     toLoginEmail("0515").ok === false && toLoginEmail("0515").why === "bad-phone");
  ok("화면에는 도메인이 안 보인다", displayLoginId(`chloe0515@${INTERNAL_DOMAIN}`) === "chloe0515");
  ok("진짜 이메일은 그대로 보인다", displayLoginId("bdyj10@gmail.com") === "bdyj10@gmail.com");
  ok("갈래를 알려 준다 (화면이 안내글을 고를 수 있게)",
     toLoginEmail("chloe0515").typedAs === "id" && toLoginEmail("01012345678").typedAs === "phone");
});

await sec("\n■ ③ 아이디 짓는 규칙은 SQL 한 벌뿐인가", async () => {
  const db = fakeDb();
  const r = await makeLoginId(db, "student", "010-1234-0515");
  ok("학생 — chloe + 폰 뒤 4자리", r.ok && r.loginId === "chloe0515", JSON.stringify(r));
  ok("DB 의 make_login_id 를 부른다 (딱 한 번)",
     db.calls.length === 1 && db.calls[0].sql.includes("v2.make_login_id"), JSON.stringify(db.calls));
  ok("DB 에 **숫자만 남긴 번호**를 넘긴다", db.calls[0]?.p?.[1] === "01012340515", JSON.stringify(db.calls[0]?.p));

  const r2 = await makeLoginId(fakeDb(), "parent", "010 6290 8729");
  ok("학부모 — 전화번호 그대로", r2.ok && r2.loginId === "01062908729", JSON.stringify(r2));

  // ⚠️ 규칙이 JS 에도 한 벌 더 있으면 DB 가 뭐라 하든 'chloe0515' 가 나온다. 그걸 잡는다
  const odd = await makeLoginId(fakeDb({ makeAs: (role, d) => "ZZZ" + d.slice(-4) }), "student", "010-1234-0515");
  ok("⚠️ DB 가 다른 답을 주면 **그 답을 따른다** (JS 가 몰래 두 벌로 안 짓는다)",
     odd.ok && odd.loginId === "ZZZ0515", JSON.stringify(odd));

  const st = await makeLoginId(fakeDb(), "principal", "010-1234-0515");
  ok("원장·강사는 아이디를 안 만든다", st.ok === false && st.why === "staff-no-id", JSON.stringify(st));
});

await sec("\n■ ④ 못 지을 자리는 **보류**로 막는가", async () => {
  // ⚠️ 실측 — DB 는 폰이 비면 'chloe' 를 돌려준다. 저장하면 폰 없는 아이가 전부 같은 아이디가 된다
  const a = await makeLoginId(fakeDb(), "student", null);
  ok("⚠️ 전화번호가 없으면 보류 (DB 에 묻지도 않는다)",
     a.ok === false && a.why === "no-phone", JSON.stringify(a));
  const dbA = fakeDb(); await makeLoginId(dbA, "student", "");
  ok("⚠️ 빈 번호로 DB 를 부르지 않는다 ('chloe' 를 받아 오는 길을 막는다)", dbA.calls.length === 0);

  // ⚠️ 실측 — '010-12' 는 'chloe1012' 가 되어 **그럴듯하게 틀린다**
  const b = await makeLoginId(fakeDb(), "student", "010-12");
  ok("⚠️ 반쪽 번호는 보류 (그럴듯한 chloe1012 를 안 만든다)",
     b.ok === false && b.why === "bad-phone", JSON.stringify(b));

  const c = await makeLoginId(fakeDb({ makeAs: () => null }), "student", "010-1234-0515");
  ok("DB 가 빈 답을 주면 보류", c.ok === false && c.why === "sql-empty", JSON.stringify(c));
  const d = await makeLoginId(fakeDb({ makeAs: () => "chloe" }), "student", "010-1234-0515");
  ok("⚠️ DB 가 'chloe' 를 주면 보류 (뒤 4자리가 없으면 아이디가 아니다)",
     d.ok === false && d.why === "sql-empty", JSON.stringify(d));
});

await sec("\n■ ⑤ 겹치면 — 형제·뒤 4자리가 같을 때", async () => {
  // 실측 — 박주영 chloe8729 · 박주하 chloe8729-2 (학부모 폰 01062908729 의 뒤 4자리가 같다)
  const taken = [{ id: "u1", role: "student", name: "박주영", login_id: "chloe8729" }];
  const r = await issueLoginId(fakeDb({ taken }), { role: "student", phone: "010-6290-8729" });
  // ⚠️ 여기서 '-2' 를 지어내면 제약 profiles_login_id_shape 가 저장할 때 거절한다 (0034)
  ok("⚠️ 겹치면 **멈춘다** — 뒤에 숫자를 지어 붙이지 않는다",
     r.ok === false && r.why === "taken" && !/-2/.test(String(r.loginId)), JSON.stringify(r));
  ok("누가 쓰고 있는지 알려 준다", r.holder?.name === "박주영", JSON.stringify(r.holder));

  const free = await issueLoginId(fakeDb({ taken }), { role: "student", phone: "010-1234-0515" });
  ok("안 겹치면 아이디와 이메일을 함께 준다",
     free.ok && free.loginId === "chloe0515" && free.email === `chloe0515@${INTERNAL_DOMAIN}`,
     JSON.stringify(free));

  const who = await findByLoginId(fakeDb({ taken }), "chloe8729");
  ok("아이디로 사람을 찾는다", who?.name === "박주영");
  ok("없는 아이디는 null", (await findByLoginId(fakeDb({ taken }), "chloe0000")) === null);
  ok("빈 아이디로는 DB 를 부르지 않는다", (await findByLoginId(fakeDb(), "")) === null);

  const oddRows = await loginIdOdd(fakeDb());
  ok("어긋난 아이디 세는 일도 SQL 에 맡긴다 (원칙 5)",
     oddRows.length === 1 && oddRows[0].login_id === "chloe8729-2");
});

await sec("\n■ ⑥ ⚠️ 대전제 12 — 비밀번호를 안 건드리고, 아무것도 안 쓴다", async () => {
  const src = readFileSync("lib/auth.js", "utf8");
  // 주석을 떼고 **코드만** 본다 (주석에는 '비밀번호'·must_change_pw 얘기가 일부러 들어 있다)
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  ok("주석을 뗀 뒤에도 코드가 남아 있다 (검사 자신이 헛돌지 않는지)",
     /export function normPhone/.test(code) && code.length > 500, `${code.length}자`);

  const pwApi = /password|updateUser|admin\.|setSession|signIn|signOut|must_change_pw/i;
  const hitPw = code.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => pwApi.test(l));
  ok("⚠️ 비밀번호를 만들거나 바꾸는 코드가 **하나도 없다** (켜는 순간 그 아이가 그날 옛 앱에 못 들어간다)",
     hitPw.length === 0, hitPw.map(([i, l]) => `${i}행: ${l.trim()}`).join(" | "));

  const writeSql = /\b(insert|update|delete|alter|create|drop|truncate)\s/i;
  const hitW = code.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => writeSql.test(l));
  ok("⚠️ DB 에 **쓰는 문이 없다** — 이 파일은 읽기만 한다 (저장은 부르는 쪽이 한다)",
     hitW.length === 0, hitW.map(([i, l]) => `${i}행: ${l.trim()}`).join(" | "));

  const dom = (code.match(/chloe-eng\.internal/g) || []).length;
  ok("속 도메인 글자가 코드에 **딱 한 번**만 있다", dom === 1, `${dom}번`);
});

await sec("\n■ ⑥-2 속 도메인을 다른 파일이 몰래 안 붙이는가", async () => {
  // ⚠️ lib/session.js · word.js · close.js · attend.js 는 지금 **다른 사람이 짓는 중**이라 비켜 뒀다.
  //    다 지어지면 이 예외 목록에서 빼라 — 안 빼면 거기 붙은 두 번째 도메인을 아무도 못 본다.
  const SKIP = ["lib/session.js", "lib/word.js", "lib/close.js", "lib/attend.js"];
  const walk = (d, out = []) => { if (!existsSync(d)) return out;
    for (const f of readdirSync(d)) { const p = join(d, f);
      statSync(p).isDirectory() ? walk(p, out) : /\.(js|jsx|mjs)$/.test(f) && out.push(p); } return out; };
  const files = [...walk("app"), ...walk("lib")]
    .filter(p => !p.endsWith("lib/auth.js") && !SKIP.includes(p));
  const bad = files.filter(p => /chloe-eng\.internal/.test(readFileSync(p, "utf8")));
  ok(`app·lib 에서 도메인을 붙이는 곳은 lib/auth.js 뿐이다 (${files.length}개 훑음, ${SKIP.length}개는 짓는 중이라 비켜 둠)`,
     bad.length === 0, bad.join(" "));
});

console.log("\n■ ⑦ 진짜 DB 와 맞댄다 — SQL 과 JS 가 갈리지 않았는가");
const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) { console.log("   ❌ DB 에 못 붙었다 —", e.message); process.exit(1); }
              await new Promise(r => setTimeout(r, 3000)); } }
// ⚠️ 여기도 감싼다 — DB 쪽에서 예외가 나면 `c.end()` 를 못 불러 노드가 안 끝나고,
//    「■ … N건 · 실패 N」 줄도 안 나온다
await sec("", async () => {
  const one = async (s, p = []) => (await c.query(s, p)).rows[0];

  const fn = await one(`select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='v2' and p.proname in ('make_login_id','login_id_odd')`);
  ok("v2.make_login_id · v2.login_id_odd 이 둘 다 있다 (없으면 아이디를 못 짓는다)", fn.n === 2, `${fn.n}개`);

  const con = await one(`select pg_get_constraintdef(oid) def, convalidated v from pg_constraint
    where conrelid='v2.profiles'::regclass and conname='profiles_login_id_shape'`);
  ok("모양 제약이 있다", !!con?.def);
  // JS 의 PHONE_SHAPE 는 이 제약에서 베껴 온 것이다. **여기서 맞대야 갈리지 않는다**
  const re = con?.def?.match(/'(\^01\[0-9\][^']*)'/)?.[1] ?? null;
  ok("제약에서 전화번호 정규식을 뽑았다", !!re, String(con?.def).slice(0, 120));
  if (re) {
    const cases = ["01012345678", "0101234567", "010123456", "0212345678", "010123456789"];
    const mism = [];
    for (const v of cases) {
      const dbSays = (await one(`select ($1 ~ $2) m`, [v, re])).m;
      if (dbSays !== phoneOk(v)) mism.push(`${v}: DB ${dbSays} / JS ${phoneOk(v)}`);
    }
    ok("⚠️ 전화번호 잣대가 DB 제약과 **한 글자도 안 갈렸다** (두 벌이 갈리는 것을 잡는 유일한 자리)",
       mism.length === 0, mism.join(" | "));
  }
  const st = await one(`select ('chloe8729-2' ~ '^chloe[0-9]{4}$') a, ('chloe8729' ~ '^chloe[0-9]{4}$') b`);
  ok("⚠️ 제약이 `chloe8729-2` 모양을 **막는다** — 그래서 겹칠 때 '-2' 를 지어 붙이면 안 된다",
     st.a === false && st.b === true, JSON.stringify(st));

  const uq = await one(`select count(*)::int n from pg_indexes where schemaname='v2'
    and tablename='profiles' and indexname='profiles_login_id_key'`);
  ok("login_id 유일 인덱스가 있다 (두 사람이 같은 아이디를 못 갖는다)", uq.n === 1);

  // 같은 입력으로 SQL 과 JS 를 맞댄다
  const phones = ["010-6290-8729", "  010 1234 0515 ", "01099998888"];
  const drift = [];
  for (const p of phones) {
    const sql = await one(`select v2.make_login_id('parent',$1) id`, [p]);
    if (sql.id !== toLoginEmail(p).id) drift.push(`${p}: SQL ${sql.id} / JS ${toLoginEmail(p).id}`);
  }
  ok("⚠️ 학부모 아이디 — SQL 과 JS 가 **같은 답**을 낸다", drift.length === 0, drift.join(" | "));

  const real = { query: (s, p) => c.query(s, p) };
  const mk = await makeLoginId(real, "student", "010-6290-8729");
  ok("진짜 DB 로 지어도 chloe8729 다", mk.ok && mk.loginId === "chloe8729", JSON.stringify(mk));
  const who = await findByLoginId(real, "chloe8729");
  ok("그 아이디를 이미 쓰는 사람이 진짜로 있다", !!who && who.role === "student", JSON.stringify(who));
  const iss = await issueLoginId(real, { role: "student", phone: "010-6290-8729" });
  ok("⚠️ 그래서 발급은 **보류**로 돌아온다 (형제 자리)", iss.ok === false && iss.why === "taken");

  console.log("\n   — 실측 (2026-09-02 기준. 이 숫자가 바뀌면 검사가 세운다)");
  const cov = await loginIdCoverage(real);
  cov.forEach(r => console.log(`     ${r.role} ${r.people}명 · 아이디 ${r.has_id} · 전화번호 ${r.has_phone} · 다시 지을 수 있는 사람 ${r.canMake}`));
  // ⚠️ 이 0 이 지금 사정의 전부다 — 전화번호를 안 채우면 아이디 발급 화면은 아무 일도 못 한다
  ok("⚠️ 전화번호가 **한 명도** 없어 아이디를 다시 지을 수 있는 사람이 0명이다 (사실을 못 박는다)",
     cov.every(r => r.canMake === 0), JSON.stringify(cov));

  const odd = await loginIdOdd(real);
  odd.forEach(r => console.log(`     ⚠️ 어긋난 아이디 — ${r.login_id} (${r.why})`));
  // 오늘 실측 1건(chloe8729-2). **늘면 새로 잘못 지은 것**이므로 실패다
  ok("어긋난 아이디가 오늘 실측(1건)보다 늘지 않았다", odd.length <= 1, `${odd.length}건`);
});
await c.end();

console.log(`\n■ 로그인 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
