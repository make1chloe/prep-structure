/**
 * 접근 규칙 **전수** 검사 — 표 85개를 학생·학부모인 척하고 전부 훑는다.
 * 읽기만 한다.
 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = (process.env.DATABASE_URL ?? readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
// 무료 요금제 pooler 가 가끔 튕긴다 — 세 번 시도
for (let i=1;;i++) { try { await c.connect(); break; }
  catch(e){ if(i>=4) throw e; await new Promise(r=>setTimeout(r,3000)); } }

const stu = (await c.query(`select p.id pid, s.id sid, s.name from public.profiles p
  join public.students s on s.profile_id=p.id where p.role='student' limit 1`)).rows[0];
const par = (await c.query(`select p.id pid, ps.student_id sid from public.profiles p
  join public.parent_student ps on ps.parent_profile_id=p.id where p.role='parent' limit 1`)).rows[0];

const tabs = (await c.query(`select t.tablename,
   exists(select 1 from information_schema.columns col
          where col.table_schema='public' and col.table_name=t.tablename and col.column_name='student_id') has_sid,
   (select count(*)::int from pg_policies p where p.schemaname='public' and p.tablename=t.tablename) npol
   from pg_tables t where t.schemaname='public' order by t.tablename`)).rows;

async function asUser(pid, sql) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims',$1,true)",
    [JSON.stringify({sub:pid, role:"authenticated"})]);
  await c.query("set local role authenticated");
  let n=0, err=null;
  try { n = (await c.query(sql)).rows[0].n; } catch(e){ err=e.message.split("\n")[0]; }
  finally { await c.query("rollback"); }
  return {n, err};
}

/**
 * 표마다 **보여도 되는가**를 못 박는다. 이걸 안 적으면 멀쩡한 것을 사고로 읽는다
 * (실제로 그럴 뻔했다 — scores 의 source='form' 자리).
 */
const 보여도됨 = new Set([
  "app_assets","holidays","homework_items","schools","screen_layouts","screen_notes",
  "textbooks","textbook_units",            // 목록·설정 — 이름뿐이라 새는 것이 없다
  "classes","profiles","students","notices","daily_report_items","score_items",
  "integrations",                          // 학생에게 보이는 1줄은 열쇠 없는 schedule (2026-09-02 확인)
]);
const 봐도되지만줄일것 = new Set([
  "tasks",         // 학사일정만 보인다(private 0) — 다만 **다른 학교 것도** 보인다
  "exam_periods",  // 학교 8곳 58줄 전부 — 개인정보는 아니나 필요 없다
]);
const leak=[], fine=[], skip=[], minor=[];
for (const t of tabs) {
  const total = (await c.query(`select count(*)::int n from public."${t.tablename}"`)).rows[0].n;
  if (total === 0) { skip.push(`${t.tablename} (빈 표)`); continue; }
  for (const [who, u] of [["학생", stu], ["학부모", par]]) {
    if (!u) continue;
    const sql = t.has_sid
      ? `select count(*)::int n from public."${t.tablename}" where student_id <> '${u.sid}'`
      : `select count(*)::int n from public."${t.tablename}"`;
    const r = await asUser(u.pid, sql);
    if (r.err) continue;
    if (r.n > 0) {
      const kind = t.has_sid ? "남의 것" : "표 전체";
      const row = {tab:t.tablename, who, n:r.n, total, kind, npol:t.npol};
      if (보여도됨.has(t.tablename)) fine.push(`${t.tablename}/${who} (보여도 됨)`);
      else if (봐도되지만줄일것.has(t.tablename)) minor.push(row);
      else leak.push(row);
    } else fine.push(`${t.tablename}/${who}`);
  }
}
console.log(`■ 표 ${tabs.length}개 · 빈 표 ${skip.length}개는 건너뜀\n`);
console.log(`■ ❌ 새는 자리 ${leak.length}건\n`);
const byTab={}; leak.forEach(l=>(byTab[l.tab]=byTab[l.tab]||[]).push(l));
for (const [tab, ls] of Object.entries(byTab)) {
  const w=ls.map(l=>`${l.who} ${l.n}/${l.total}`).join(" · ");
  console.log(`   ${tab.padEnd(26)} ${ls[0].kind.padEnd(7)} ${w}   (정책 ${ls[0].npol}개)`);
}
if (!leak.length) console.log("   없음\n");
console.log(`■ ⚠️ 새지는 않지만 줄일 것 ${minor.length}건`);
minor.forEach(l=>console.log(`   ${l.tab.padEnd(20)} ${l.who} ${l.n}/${l.total}`));
console.log(`\n■ ✅ 막혔거나 보여도 되는 자리 ${fine.length}건`);
process.exitCode = leak.length ? 1 : 0;
await c.end();
