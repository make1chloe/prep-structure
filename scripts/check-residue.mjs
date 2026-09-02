/** ⚠️⚠️ **검사가 진짜 자료에 남긴 것이 있나.**
 *
 *  실제로 났다 — `scripts/check-day.mjs` 가 `state='active'` 로 학생을 골라
 *  **장원우의 오늘 판에 검사 자료 52줄**을 남겼고, 2028년 날짜에도 8줄이 굳었다.
 *  원장님이 앱을 열면 **없는 숙제가 보인다.** 오류도 안 나고 아무도 모른다.
 *
 *  검사는 트랜잭션 안에서 쓰고 되돌리기로 되어 있지만, **한 번 실패하면 그대로 굳는다.**
 *  그래서 「되돌렸겠지」를 믿지 않고 **남은 것을 직접 센다.** */
import { Client } from "pg";
import { readFileSync } from "node:fs";

let fail = 0, n = 0;
const ok = (t, bad, why = "") => { n++;
  if (bad.length) { fail++; console.log(`   ❌ ${t} — ${bad.length}개`);
    bad.slice(0, 8).forEach(x => console.log(`        ${x}`));
    if (why) console.log(`        → ${why}`); }
  else console.log(`   ✅ ${t}`); };

const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

console.log("■ 검사가 진짜 자료에 남긴 것");

// ① 앞날에 판 항목이 서 있나 — 앞날 숙제는 배정하지 않는다(오늘 것만 굳힌다)
const future = (await c.query(`
  select s.name, d.date::text as date, count(*)::int n
    from v2.day_item i join v2.day_sheet d on d.id = i.sheet_id
    join v2.students s on s.id = d.student_id
   where d.date > v2.today() group by 1, 2 order by 2`)).rows;
ok("앞날 판에 숙제 줄이 없다", future.map(x => `${x.name} ${x.date} — ${x.n}줄`),
   "앞날 숙제는 안 굳힌다 — 검사가 남긴 것이다");

// ② 앞날 날짜로 찍힌 진도
const fp = (await c.query(`
  select count(*)::int n from v2.progress
   where done_on > v2.today() or marked_on > v2.today()`)).rows[0].n;
ok("앞날 날짜로 찍힌 진도가 없다", fp ? [`${fp}줄`] : [], "아직 안 한 것이 완료로 찍혀 있다");

// ③ 리허설이 아닌 학생의 판인데 묶음이 안 붙은 것
//    ⚠️ 이관 판은 import · 리허설은 rehearsal 이다. 둘 다 아니면 어디서 왔는지 모른다
const orphan = (await c.query(`
  select s.name, d.date::text as date
    from v2.day_sheet d join v2.students s on s.id = d.student_id
   where d.import_batch is null and s.import_batch <> 'fixture'
   order by d.date desc limit 20`)).rows;
ok("묶음이 안 붙은 판이 없다 (진짜 학생 쪽)", orphan.map(x => `${x.name} ${x.date}`),
   "이관도 리허설도 아니면 **어디서 왔는지 모르는 줄**이다");

// ④ 리허설 계정 밖에서 「방금」 생긴 판 항목 — 검사가 도는 중이면 잠깐 뜰 수 있다
const fresh = (await c.query(`
  select s.name, count(*)::int n
    from v2.day_item i join v2.day_sheet d on d.id = i.sheet_id
    join v2.students s on s.id = d.student_id
   where i.created_at > now() - interval '30 minutes' and s.import_batch <> 'fixture'
   group by 1`)).rows;
ok("30분 안에 진짜 학생 판에 새로 선 줄이 없다", fresh.map(x => `${x.name} — ${x.n}줄`),
   "검사가 도는 중이면 잠깐 뜬다. 검사가 끝났는데도 남아 있으면 **되돌리기가 실패한 것**이다");

// ⑤ 검사가 리허설 학생을 쓰는가 — 글자로 훑는다
const dayChk = readFileSync("scripts/check-day.mjs", "utf8");
ok("check-day 가 **리허설 학생**으로만 쓴다",
   /import_batch\s*=\s*'fixture'/.test(dayChk) ? [] : ["state='active' 로 진짜 학생을 고른다"],
   "진짜 학생 판에 쓰면 원장님이 없는 숙제를 본다");

await c.end();
console.log(`\n■ 잔해 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
