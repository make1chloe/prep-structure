import { Client } from "pg"; import { readFileSync } from "node:fs";
const url = readFileSync(".env.local","utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new Client({ connectionString:url, ssl:{rejectUnauthorized:false}, connectionTimeoutMillis:20000 });
for(let i=1;;i++){try{await c.connect();break}catch(e){if(i>=4)throw e;await new Promise(r=>setTimeout(r,3000))}}
const tbls=['progress','progress_part','progress_flag','day_item','day_sheet','student_book','units','books','progress_edit','students'];
for(const t of tbls){
  const r=await c.query(`select column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='v2' and table_name=$1 order by ordinal_position`,[t]);
  console.log("\n== "+t);
  console.log(r.rows.map(x=>`${x.column_name}:${x.data_type}${x.is_nullable==='NO'?' NN':''}${x.column_default?' ='+x.column_default:''}`).join(" | "));
}
const f=await c.query(`select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_function_result(p.oid) res
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='v2' order by p.proname`);
console.log("\n== functions");
f.rows.forEach(x=>console.log(`  v2.${x.proname}(${x.args}) -> ${x.res}`));
await c.end();
