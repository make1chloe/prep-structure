/** 스키마 짝 검사 — 트리거·칸·파기 목록·CASCADE 가 맞물리는가 */
import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:15000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const bad=[], ok=[];
const j=(n,rows,why)=>rows.length?bad.push(`❌ ${n} (${rows.length}) — ${why}\n      ${rows.slice(0,4).map(r=>Object.values(r).join(" · ")).join("\n      ")}`):ok.push(`✅ ${n}`);

// ① touch 트리거가 있는데 updated_at 칸이 없다
j("고친 때 도장 — 트리거만 있고 칸이 없는 표", (await c.query(`
  select c.relname t from pg_trigger g join pg_class c on c.oid=g.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='v2' and g.tgname like '%_touch' and not g.tgisinternal
    and not exists (select 1 from information_schema.columns col
      where col.table_schema='v2' and col.table_name=c.relname and col.column_name='updated_at')`)).rows,
  "고치는 순간 터진다");

// ② 사람 이름·전화·글이 든 칸이 파기 목록에 있나
j("파기 목록에 없는 개인정보 칸", (await c.query(`
  select col.table_name||'.'||col.column_name v from information_schema.columns col
  where col.table_schema='v2'
    and (col.column_name in ('name','phone','comment','body','said','note','reason','staff_note','orig_name','title')
         and col.table_name not in ('purge_map','import_check','area_map','import_skip','books','units','learn_items','material_type','grammar_topics',
             'schools','video','msg_template','auto_rule','notice','todo','material','file_bin','exams','classes'))
    and not exists (select 1 from v2.purge_map p
      where p.tbl=col.table_name and p.col=col.column_name)`)).rows,
  "파기가 여기를 안 지나간다 (자동 검사 ⑨)");

// ③ 진도·기록을 가리키는 외래키가 CASCADE 면 안 된다
j("기록이 CASCADE 로 딸려 지워지는 자리", (await c.query(`
  select tc.table_name||'.'||kcu.column_name||' → '||ccu.table_name v
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
  join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name
  join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name
  where tc.table_schema='v2' and tc.constraint_type='FOREIGN KEY' and rc.delete_rule='CASCADE'
    and tc.table_name in ('progress','progress_part','progress_flag','score','payment','day_sheet','audit')`)).rows,
  "옛 앱은 단원을 지우면 진도가 같이 갔다");

// ④ RLS 안 켠 표
j("접근 규칙을 안 켠 표", (await c.query(`
  select tablename v from pg_tables where schemaname='v2' and not rowsecurity`)).rows, "다 보인다");

// ⑤ 정책이 하나도 없는 표
j("정책이 하나도 없는 표", (await c.query(`
  select t.tablename v from pg_tables t where t.schemaname='v2'
    and not exists (select 1 from pg_policies p where p.schemaname='v2' and p.tablename=t.tablename)`)).rows,
  "RLS 를 켜고 정책이 없으면 원장님도 못 본다");

console.log("■ 스키마 짝");
ok.forEach(x=>console.log("  ",x));
if (bad.length){ console.log("\n■ 어긋난 것"); bad.forEach(x=>console.log("  ",x)); }
console.log(`\n합계 — 맞음 ${ok.length} · 어긋남 ${bad.length}`);
await c.end(); process.exit(bad.length?1:0);
