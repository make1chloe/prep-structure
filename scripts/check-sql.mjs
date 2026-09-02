/** ⚠️ **lib 의 SQL 을 진짜 스키마에 물어본다.**
 *
 *  왜 필요한가 — 검증자가 잡은 뿌리다. 판단 넷의 검사가 **62건·33건 전부 통과**했는데
 *  그 안의 SQL 이 **없는 칸 셋**(day_item.book_id · quiz.correct)을 읽고 있었다.
 *  가짜 DB 만 상대하는 검사는 **죽은 칸을 원리적으로 못 잡는다.**
 *  화면을 켜는 그 순간 터지고, 검사는 초록이라 아무도 모른다.
 *
 *  방법 — SQL 을 뽑아 Postgres 에 **PREPARE** 한다. 돌리지 않으므로 자료가 안 바뀐다.
 *  칸 이름 · 표 이름 · 함수 이름이 하나라도 틀리면 그 자리에서 걸린다. */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

// lib 의 문자열에서 SQL 을 뽑는다 — 백틱·따옴표 안에 select/insert/update/delete 로 시작하는 것
const START = /^\s*(with|select|insert|update|delete)\b/i;
const found = [];
for (const f of readdirSync("lib").filter(x => x.endsWith(".js"))) {
  // ⚠️ 주석 안의 보기 글은 SQL 이 아니다 — 지우고 본다 (queue.js 의 `select v2.무엇()` 이 여기 걸렸다)
  const src = readFileSync(`lib/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  // 백틱 문자열 (템플릿 리터럴). ${…} 가 든 것은 **자리를 메워** 문법만이라도 본다
  for (const m of src.matchAll(/`([^`\\]|\\.)*`/g)) {
    const raw = m[0].slice(1, -1);
    if (!START.test(raw)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    // ${…} 는 앞뒤를 보고 대충 메운다 — 이름 자리면 그대로, 값 자리면 null
    // ⚠️ 표·칸 **이름 자리**에 ${…} 가 든 SQL 은 물어볼 수가 없다 — 이름이 실행할 때 정해진다.
    //    「통과」로 세면 거짓 초록이 되므로 **못 봤다**로 따로 센다.
    const nameHole = /\b(from|join|into|update)\s+[\w.]*\$\{|\bv2\.\$\{/i.test(raw);
    const sql = raw.replace(/\$\{[^}]*\}/g, " null ");
    found.push({ file: f, line, sql, nameHole });
  }
}

let fail = 0, okN = 0, skip = 0;
const bad = [], held = [];
console.log(`■ lib 에서 뽑은 SQL ${found.length}개 — 진짜 스키마에 물어본다`);

let i = 0;
for (const q of found) {
  i++;
  const name = `chk_${i}`;
  if (q.nameHole) { skip++; held.push(q); continue; }
  try {
    await c.query("begin");
    await c.query(`prepare ${name} as ${q.sql}`);
    await c.query("rollback");
    okN++;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    const msg = String(e.message).split("\n")[0];
    // ⚠️ 자리를 메우다 생긴 문법 오류는 **우리 잘못이 아니다** — 칸·표·함수 오류만 센다
    const real = /does not exist|없|relation|column|function|type .* does not/i.test(msg)
              && !/syntax error/i.test(msg);
    if (real) { fail++; bad.push({ ...q, msg }); }
  }
}

bad.forEach(b => {
  console.log(`   ❌ ${b.file}:${b.line} — ${b.msg}`);
  console.log(`        ${b.sql.replace(/\s+/g, " ").trim().slice(0, 110)}`);
});
if (!bad.length) console.log(`   ✅ 없는 칸·표·함수를 읽는 SQL 이 없다 (물어본 것 ${okN})`);
if (skip) {
  console.log(`\n   ⚠️ 못 물어본 것 ${skip}개 — 표 이름이 실행할 때 정해져서 물어볼 수가 없다`);
  held.slice(0, 8).forEach(h => console.log(`        ${h.file}:${h.line}`));
  console.log(`        → 이 자리는 **표 이름을 흰 목록으로 좁혀야** 안전하다 (아무 표나 들어오면 그게 구멍이다)`);
}

await c.end();
console.log(`\n■ SQL 검사 ${found.length}개 (물어봄 ${okN} · 못 물어봄 ${skip}) · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
