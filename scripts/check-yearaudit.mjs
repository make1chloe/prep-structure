/**
 * **연도 점검** (lib/yearAudit.js)
 *
 * 원장님 (2026-08-06) — 「노션자료에서 24,25,26년이 서로 구별되지 않게
 * 적혀서 혼용된 거 없나 싹 확인해줘」
 *
 * 노션은 날짜를 「12/30」 처럼 **연도 없이** 적어둔 것이 많다. 옮길 때
 * 화면의 연도 칸 값을 붙이는데, 기본값이 올해라 지난 해 자료가 통째로
 * 올해로 들어간다 — **오류가 안 난다.** 그래서 모양으로 찾는다.
 *
 * 여기서 잘못 세면 **멀쩡한 자료를 1년 되돌리게** 된다. 되돌리기는
 * 되돌리기가 더 어렵다. 그래서 세는 규칙을 못 박아 둔다.
 *
 * 쓰는 법:  node scripts/check-yearaudit.mjs
 */

import { auditRows, byYear, futureRows, sameDayAcrossYears } from "../lib/yearAudit.js";
let fail=0; const eq=(g,w,t)=>{const a=JSON.stringify(g),b=JSON.stringify(w);
  if(a!==b){console.log(`  ✗ ${t}\n     나온 것: ${a}\n     바란 것: ${b}`);fail=1;}};
const T="2026-08-06";
console.log("== 연도별 세기 ==");
eq(byYear([{date:"2024-03-01"},{date:"2026-03-01"},{date:"2026-04-01"},{date:""}]),
   {"2024":1,"2026":2},"빈 것은 안 센다");
console.log("== 미래에 있는 것 ==");
eq(futureRows([{date:"2026-12-30"},{date:"2026-08-06"},{date:"2025-12-30"}],T).length,1,"오늘은 미래가 아니다");
console.log("== 같은 월일이 여러 해에 ==");
eq(sameDayAcrossYears([{student_id:"a",date:"2025-03-04"},{student_id:"a",date:"2026-03-04"},
                       {student_id:"b",date:"2026-03-04"}]).length,1,"a 만 걸린다");
console.log("== 한 묶음 점검 ==");
const a=auditRows("수업 기록",[{student_id:"a",date:"2026-12-30"},{student_id:"a",date:"2026-12-31"}],T);
eq(a.future,2,"미래 2건");
eq(a.notes[0].tone,"bad","제일 확실한 증거");
const b=auditRows("일정",[{id:"1",date:"2026-12-30"}],T,{future:false,keyOf:(r)=>r.id});
eq(b.future,0,"일정은 미래여도 된다");
if(fail){console.log("\n❌");process.exit(1);}
console.log("\n✅ 연도 점검 통과");
