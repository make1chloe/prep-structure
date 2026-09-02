/** 단원 자료의 질 검사 — 「진도는 맞는데 화면에 무엇인지 안 보이는」 자리를 잡는다.
 *  ⚠️ 옛 앱은 **소단원 칸에 갈래 이름(본책/워크북)** 을 넣어 두었다. 진짜 소단원 이름이 없어서
 *     아이 화면에 「Unit 01 시제 › 본책」만 뜨고 어느 줄인지 모른다.
 *     그리고 「소단원 몇 개」 갯수 조절이 뜻을 잃는다(소단원이 1종뿐이라). */
import { Client } from "pg";
import { readFileSync } from "node:fs";

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

let fail = 0, n = 0;
const decided = (await c.query(`select why_like, decided from v2.hold_decision`)).rows;
const isDecided = (s) => decided.find(d => new RegExp(d.why_like.replace(/%/g, '.*')).test(s));
const ok = (t, bad0, note) => { n++;
  const held = bad0.filter(isDecided), bad = bad0.filter(x => !isDecided(x));
  held.forEach(h => console.log(`   ⏸️  ${String(h).slice(0,40)} — ${isDecided(h).decided.slice(0,70)}`));
  if (bad.length) { fail++; console.log(`   ❌ ${t} — ${bad.length}권`);
    bad.slice(0, 6).forEach(x => console.log(`        ${x}`));
    if (bad.length > 6) console.log(`        … ${bad.length - 6}권 더`);
    if (note) console.log(`        → ${note}`); }
  else console.log(`   ✅ ${t}`); };

console.log("■ 단원 자료의 질");

// ① 소단원 칸에 갈래 이름이 들어간 교재
const a = (await c.query(`
  select b.name, count(*)::int n from v2.books b join v2.units u on u.book_id=b.id
  where u.state='active' and u.sub in ('본책','워크북','본교재')
  group by b.name order by 2 desc`)).rows;
ok("소단원 칸에 **갈래 이름**(본책/워크북)이 안 들어 있다",
   a.map(x => `${x.name} — ${x.n}줄`),
   "진짜 소단원 이름이 없어 아이 화면에 어느 줄인지 안 보이고, 「소단원 몇 개」 조절이 뜻을 잃는다");

// ② 워크북이 있는데 대단원 안에 소단원이 한 종뿐 — 두 기준이 구별이 안 된다
const b = (await c.query(`
  select b.name from v2.books b
  where b.order_basis='chapter' and exists (
    select 1 from v2.units u where u.book_id=b.id and u.state='active' and u.is_workbook)
  and (select count(distinct u.sub) from v2.units u
       where u.book_id=b.id and u.state='active' and u.sub is not null) <= 1
  order by b.name`)).rows;
ok("「대단원 기준」이 실제로 뜻이 있다 (소단원이 두 종 이상)",
   b.map(x => x.name),
   "소단원이 한 종뿐이면 대단원 기준과 소단원 기준의 차례가 **똑같다** — 켜도 아무것도 안 바뀐다");

// ③ 소단원이 빈 교재(31권)는 **자료 문제가 아니라 규칙 문제**다 —
//    「소단원이 비면 대단원 이름을 쓴다」(절 ㉘ 3번). 규칙이 실제로 도는지 본다.
const lab = (await c.query(`
  select v2.unit_label(u.id) label, u.sub from v2.units u
  where u.state='active' and (u.sub is null or u.sub='') limit 200`)).rows;
ok("소단원이 비어도 이름이 뜬다 (v2.unit_label 이 대단원으로 받는다)",
   lab.filter(x => !x.label || x.label.trim() === '').map(() => '빈 이름'),
   "이 함수가 없으면 화면에 「Unit 03 › (빈칸)」이 뜬다");

// ④ 소단원만 띄우면 안 되는 교재 — 같은 이름이 여러 대단원에 되풀이된다
const dup = (await c.query(`
  select b.name, count(*)::int n from v2.books b join v2.units u on u.book_id=b.id
  where u.state='active' and u.sub is not null and u.sub <> ''
  group by b.name, u.sub having count(distinct u.chapter) > 1`)).rows;
console.log(`   ℹ️  소단원 이름이 여러 대단원에 되풀이되는 교재 ${new Set(dup.map(x=>x.name)).size}권`
  + ` — 화면은 **언제나 「대단원 › 소단원」**으로 쓴다 (v2.unit_label 기본값)`);

await c.end();
console.log(`\n■ 단원 자료 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
