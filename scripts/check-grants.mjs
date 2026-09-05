/** ⚠️⚠️ **규칙(정책)과 권한(GRANT)은 짝이다. 하나만 있으면 아무 일도 안 일어난다.**
 *
 *  실측 2026-09-02 — v2 의 표 **82개 중 56개**가 「쓰라는 규칙은 있는데 권한이 없어」
 *  앱이 통째로 읽기 전용이었다. 출결·마감·부모님께 나갈 글·시험 점수가 전부 permission denied.
 *  0005 가 처음에 적어 둔 함정인데, 그 뒤에 만든 표에는 아무도 권한을 안 줬다.
 *  **표를 하나 더 세울 때마다 다시 날 수 있는 사고**라 검사로 막는다. */
import { Client } from "pg";
import { readFileSync } from "node:fs";

let fail = 0, n = 0;
const ok = (t, bad, why = "") => { n++;
  if (bad.length) { fail++; console.log(`   ❌ ${t} — ${bad.length}개`);
    bad.slice(0, 10).forEach(x => console.log(`        ${x}`));
    if (bad.length > 10) console.log(`        … ${bad.length - 10}개 더`);
    if (why) console.log(`        → ${why}`); }
  else console.log(`   ✅ ${t}`); };

const url = (process.env.DATABASE_URL ?? readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1]).trim();
const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
for (let i = 1; ; i++) { try { await c.connect(); break; }
  catch (e) { if (i >= 4) throw e; await new Promise(r => setTimeout(r, 3000)); } }

const rows = (await c.query(`
  select t.relname tbl,
    (select count(*) from pg_policies p where p.schemaname='v2' and p.tablename=t.relname
       and p.cmd in ('ALL','INSERT','UPDATE'))::int wrules,
    (select count(*) from pg_policies p where p.schemaname='v2' and p.tablename=t.relname)::int rules,
    has_table_privilege('authenticated','v2.'||quote_ident(t.relname),'select') sel,
    has_table_privilege('authenticated','v2.'||quote_ident(t.relname),'insert') ins,
    has_table_privilege('authenticated','v2.'||quote_ident(t.relname),'update') upd,
    has_table_privilege('authenticated','v2.'||quote_ident(t.relname),'delete') del,
    t.relrowsecurity rls, t.relforcerowsecurity forced
  from pg_class t join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'v2' and t.relkind = 'r' order by t.relname`)).rows;
await c.end();

console.log(`■ v2 의 표 ${rows.length}개 — 규칙과 권한이 짝이 맞나`);

ok("「쓰라는 규칙」이 있는데 **쓸 권한이 없는** 표가 없다",
   rows.filter(x => x.wrules > 0 && (!x.ins || !x.upd))
       .map(x => `${x.tbl} (규칙 ${x.wrules} · insert ${x.ins ? "○" : "✕"} · update ${x.upd ? "○" : "✕"})`),
   "규칙만 있고 권한이 없으면 **아무 일도 안 일어난다** — 화면은 permission denied 만 본다");

ok("「읽으라는 규칙」이 있는데 **읽을 권한이 없는** 표가 없다",
   rows.filter(x => x.rules > 0 && !x.sel).map(x => x.tbl),
   "아무도 못 본다");

ok("**지울 권한을 가진 표가 없다** (대전제 6 — 지우지 않는다, 상태로 내린다)",
   rows.filter(x => x.del).map(x => x.tbl));

// ⚠️ 반대 방향 — 권한만 주고 규칙을 안 쓰면 **force RLS 때문에 아무도 못 쓴다**(조용히 0줄)
ok("**권한은 있는데 쓰라는 규칙이 없는** 표가 없다",
   rows.filter(x => (x.ins || x.upd) && x.wrules === 0).map(x => x.tbl),
   "force RLS 아래서는 규칙이 없으면 **조용히 0줄**이다 — 화면은 「성공」이라 말한다");

ok("접근 규칙이 **켜져 있고 강제**된다 (enable + force)",
   rows.filter(x => !x.rls || !x.forced).map(x => `${x.tbl} (enable ${x.rls ? "○" : "✕"} · force ${x.forced ? "○" : "✕"})`),
   "force 가 없으면 표 주인은 규칙을 그냥 지나간다");

// ⚠️ 감사와 이관은 **사람이 쓰면 안 된다**
ok("감사·이관 표에 **사람이 쓸 권한이 없다**",
   rows.filter(x => ["audit", "import_map", "import_skip", "import_check"].includes(x.tbl) && (x.ins || x.upd))
       .map(x => x.tbl),
   "감사에 사람이 쓸 수 있으면 감사가 아니다. 이관 표를 사람이 고치면 대조가 뜻을 잃는다");

console.log(`\n■ 규칙·권한 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
