/** 시간대 검사 — 마이그레이션에 `current_date`·`now()::date` 가 있으면 실패.
 *  ⚠️ 서울과 UTC 는 9시간 차이라 **밤 9시 이후 하루가 어긋난다.** */
import { readdirSync, readFileSync } from "node:fs";
const bad=[];
for (const f of readdirSync("supabase/migrations").filter(x=>x.endsWith(".sql"))) {
  const s=readFileSync("supabase/migrations/"+f,"utf8");
  s.split("\n").forEach((l,i)=>{
    if (/^\s*--/.test(l)) return;
    if (/current_date|now\(\)::date|current_timestamp::date/.test(l))
      bad.push(`${f}:${i+1}  ${l.trim().slice(0,80)}`);
  });
}
console.log("■ 시간대 — 서울 아닌 오늘을 쓰는 자리");
bad.length ? bad.forEach(x=>console.log("   ❌",x)) : console.log("   ✅ 없음");
console.log(`\n   → 오늘은 **v2.today()** 하나로만 센다`);
process.exit(bad.length?1:0);
