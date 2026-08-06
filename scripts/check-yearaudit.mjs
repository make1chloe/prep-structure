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

import { auditRows, byYear, futureRows, sameDayAcrossYears, dowMismatch } from "../lib/yearAudit.js";
import { parseDate } from "../lib/importNotion.js";
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

/**
 * **요일이 반과 안 맞는 것** — 2026-08-06 에 이것으로 잡았다.
 *
 * 한 해는 52주 + 1일이라 연도가 밀리면 요일이 정확히 하루 밀린다.
 * 원장님 화면의 「2026-08-14」 는 금요일인데 이 학원은 월수 / 화목이고
 * 금요일은 보강일이다. 한 해 당긴 2025-08-14 는 목요일 — 화목반과 맞는다.
 */
console.log("== 요일이 반과 안 맞나 ==");
const daysOf = new Map([["a", ["화", "목"]], ["b", ["월", "수"]]]);
const m = dowMismatch([
  { student_id: "a", date: "2026-08-14" },   // 금 — 한 해 당기면 목 (맞다)
  { student_id: "a", date: "2026-08-13" },   // 목 — 맞다
  { student_id: "b", date: "2026-08-15" },   // 토 — 당겨도 금 (안 맞다)
], daysOf);
eq(m.length, 2, "안 맞는 것 둘");
eq(m[0].fits, true, "한 해 당기면 맞는다 → 연도가 밀린 것");
eq(m[1].fits, false, "당겨도 안 맞으면 다른 까닭 (보강·특강)");
// 반을 모르는 학생은 견줄 수가 없다 — 조용히 넘어간다
eq(dowMismatch([{ student_id: "없는아이", date: "2026-08-15" }], daysOf).length, 0, "반이 없으면 안 센다");

const c = auditRows("수업 기록", [{ student_id: "a", date: "2026-08-14" }], "2026-08-06", { daysOf });
eq(c.shifted, 1, "점검 결과에 실린다");

/**
 * **다시는 미래로 안 들어가게** (lib/importNotion).
 *
 * 예전에는 연도 칸이 있으면 「미래면 작년」 규칙을 아예 안 탔다. 그래서
 * 「08/14」 가 2026-08-14(미래)로 들어갔다. 수업 기록은 미래일 수 없다.
 */
console.log("== 옮길 때 미래로 안 들어가나 ==");
const THIS_YEAR = new Date().getFullYear();
const future = `${String(THIS_YEAR).slice(2)}`;   // 눈으로 보기 좋으라고
eq(parseDate("12/30", THIS_YEAR), `${THIS_YEAR - 1}-12-30`, "12/30 은 지난해 것 (미래가 아니다)");
eq(parseDate("01/05", THIS_YEAR), `${THIS_YEAR}-01-05`, "이미 지난 날은 그대로");
// 일정·할일은 앞으로 잡는 것이라 미래여도 맞다
eq(parseDate("12/30", THIS_YEAR, false), `${THIS_YEAR}-12-30`, "일정은 미래 그대로");
// 파일에 연도가 적혀 있으면 손대지 않는다
eq(parseDate("2025-12-30", THIS_YEAR), "2025-12-30", "적힌 연도가 이긴다");

if(fail){console.log("\n❌");process.exit(1);}
console.log("\n✅ 연도 점검 통과");
