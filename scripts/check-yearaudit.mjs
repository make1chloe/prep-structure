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
/**
 * **앞으로 잡아둔 것은 이상하지 않다** (2026-08-06).
 *
 * 원장님 화면에서 보강 4건이 빨갛게 떴다 — 앞으로 잡아둔 보강 예정일이었다.
 * 보강은 원래 미래에 잡고, 시험 기간 결석도 미리 넣는다. 그것을
 * 「연도가 잘못됐다」 고 하면 멀쩡한 것을 고치게 만든다.
 */
{
  const { attendanceAhead } = await import("../lib/yearAudit.js");
  const rows = [
    { date: "2026-08-14", status: "makeup" },              // 보강 예정 — 정상
    { date: "2026-08-20", status: "absent", planned: true },// 사전 연락 — 정상
    { date: "2026-08-25", status: "present" },             // 지나간 출석이 미래에 — 이상
  ];
  eq(futureRows(rows, T, (r) => r.date, attendanceAhead).length, 1, "보강·사전연락은 빼고 센다");
  eq(futureRows(rows, T).length, 3, "규칙을 안 주면 다 센다 (다른 표는 그대로)");
}
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
 * **요일만으로는 확정하지 않는다** (2026-08-06 원장님 화면에서 배운 것).
 *
 * 자료를 제대로 올리신 뒤 306건이 요일로 걸렸는데, 원본에 2024년 자료가
 * 없으니 밀린 것이 아니었다 — **반이 바뀐 아이들**이었다. 반 요일은 지금
 * 것만 알 수 있어서, 작년에 월·수였다가 지금 화·목인 아이의 옛 기록이
 * 전부 걸린다. 확정을 남발하면 정작 진짜일 때 안 믿게 된다.
 */
{
  // 미래가 함께 있으면 강한 증거 (빨강)
  const withFuture = auditRows("수업 기록",
    [{ student_id: "a", date: "2026-12-30" }, { student_id: "a", date: "2026-08-14" }],
    "2026-08-06", { daysOf });
  eq(withFuture.notes.some((n) => n.tone === "bad" && n.text.includes("요일")), true,
     "미래가 함께면 빨강");
  // 미래가 없으면 「반이 바뀌었을 수 있다」 (회색)
  const noFuture = auditRows("수업 기록",
    [{ student_id: "a", date: "2025-07-02" }], "2026-08-06", { daysOf });
  eq(noFuture.notes.some((n) => n.tone === "bad"), false, "미래가 없으면 확정하지 않는다");
  eq(noFuture.notes.some((n) => n.text.includes("반이 바뀐")), true, "왜 그럴 수 있는지 적어준다");
}

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

/**
 * **연도 다시 맞추기** (lib/yearFix).
 *
 * 원장님 (2026-08-06) — 「올해인지 작년인지 재작년인지 모르는데 뭘 돌린다는거야」
 *
 * 여기서 잘못 판단하면 **멀쩡한 기록을 다른 해로 옮긴다.** 옮기고 나면
 * 무엇을 건드렸는지도 모르게 되어 지금보다 나빠진다. 그래서 「하나로
 * 좁혀졌을 때만 고친다」 는 규칙을 못 박아 둔다.
 */
const { decide, plan, candidates } = await import("../lib/yearFix.js");

console.log("== 후보 지우기 ==");
{
  // 2026-08-14 는 금요일. 화·목반 아이의 수업 기록일 수 없다.
  // 2025-08-14 는 목요일 — 맞는다. 2024-08-14 는 수요일 — 아니다
  const d = decide("2026-08-14", { today: "2026-08-06", classDays: ["화", "목"] });
  eq(d.verdict, "fix", "하나로 좁혀진다");
  eq(d.to, "2025-08-14", "2025년 목요일");
}
{
  // 미래이기만 하고 요일을 모르면 (반 없는 아이) — 지난 해로만 좁혀진다
  const d = decide("2026-12-30", { today: "2026-08-06" });
  eq(d.verdict, "ask", "요일을 모르면 2025·2024 둘이 남는다");
}
{
  // 지금 연도도 후보에 있으면 **건드리지 않는다**
  const d = decide("2026-03-04", { today: "2026-08-06", classDays: ["수"] });   // 2026-03-04 는 수요일
  eq(d.verdict, "keep", "지금 것이 맞을 수 있으면 그대로");
}
{
  /**
   * **요일로 「지금 것」 을 지우지 않는다.** 반이 바뀐 아이의 옛 기록은
   * 요일이 안 맞는 것이 당연하다 — 그걸로 옮기면 멀쩡한 기록이 망가진다.
   */
  const d = decide("2025-07-02", { today: "2026-08-06", classDays: ["화", "목"] });
  eq(d.verdict, "keep", "과거인데 요일만 안 맞으면 그대로 둔다");
}
{
  // 등록 전이면 그 해가 아니다
  const d = decide("2026-08-14", {
    today: "2026-08-06", classDays: ["화", "목"], startedOn: "2026-01-01",
  });
  eq(d.verdict, "none", "미래도 아니고 등록 전도 아닌 해가 없다");
}
{
  // 어느 해로도 요일이 안 맞으면 손대지 않는다 (보강·특강일 수 있다)
  const d = decide("2026-08-15", { today: "2026-08-06", classDays: ["월", "수"] });
  eq(d.verdict, "none", "토요일은 어느 해로도 월·수가 아니다");
}

console.log("== 여러 줄 ==");
{
  const rows = [
    { id: "1", date: "2026-08-14", student_id: "a" },   // 고칠 것
    { id: "2", date: "2026-03-05", student_id: "a" },   // 목요일 — 화·목반과 맞다. 그대로
  ];
  const p = plan(rows, () => ({ today: "2026-08-06", classDays: ["화", "목"] }));
  eq(p.fix.length, 1, "고칠 것 하나");
  eq(p.fix[0].to, "2025-08-14", "옮길 날짜");
}
// 2월 29일이 없는 해는 후보에서 빠진다
eq(candidates("2026-02-28", { today: "2026-08-06" }).length, 3, "평범한 날은 세 해 다");


/**
 * **1000줄에서 잘리지 않나** (lib/pageAll).
 *
 * Supabase 는 한 번에 1000줄까지만 준다 — `.limit(20000)` 을 걸어도 그렇다.
 * 오류도 안 난다. 그래서 점검 화면이 앞의 1000줄만 보고 「2026년 한 해에
 * 몰려 있습니다」 라는 거짓 답을 냈다 (2026-08-06 원장님 화면).
 * 세는 것이 틀리면 그다음 결정이 전부 틀어진다.
 */
console.log("\n== 1000줄에서 안 잘리나 ==");
{
  const { pageAll } = await import("../lib/pageAll.js");
  const ALL = Array.from({ length: 2130 }, (_, i) => ({ i }));
  // 서버가 1000줄에서 자르는 것을 흉내낸다
  const { rows } = await pageAll(async (from, to) =>
    ({ data: ALL.slice(from, Math.min(to + 1, from + 1000)), error: null }));
  eq(rows.length, 2130, "2130줄을 다 읽는다");

  const { rows: few } = await pageAll(async () => ({ data: [{ i: 1 }], error: null }));
  eq(few.length, 1, "적게 오면 거기서 멈춘다 (무한 반복 안 한다)");

  const { rows: none, error } = await pageAll(async () => ({ data: null, error: { message: "x" } }));
  eq([none.length, !!error], [0, true], "오류는 그대로 돌려준다");
}


/**
 * **관계 열에 붙는 주소** (lib/importNotion 의 relName).
 *
 * 원장님 화면 (2026-08-06) — 보강 474줄 중 **473줄이 「재원생 목록에 없음」**
 * 으로 건너뛰었다. 노션이 관계(relation) 열을 CSV 로 내보낼 때 이름 뒤에
 * 페이지 주소를 괄호로 붙인다 —
 *
 *     서한결 (https://app.notion.com/p/1cce8b8e...?pvs=21)
 *
 * 그 통짜 글자로 학생을 찾으니 하나도 못 찾았다. **오류는 안 난다** —
 * 「이 학생이 없습니다」 라고 얌전히 건너뛸 뿐이라 눈으로는 못 찾는다.
 */
console.log("\n== 관계 열에서 이름만 뽑나 ==");
{
  const { relName } = await import("../lib/importNotion.js");
  eq(relName("서한결 (https://app.notion.com/p/1cce8b8e40f7801b8d1bca68aee6b364?pvs=21)"),
     "서한결", "이름 뒤 주소를 뗀다");
  eq(relName("김규빈"), "김규빈", "주소가 없으면 그대로");
  eq(relName("문가은 (https://a.b/c), 최민서 (https://d/e)"), "문가은", "여럿이면 첫 번째");
  eq(relName(""), "", "빈 칸");
  eq(relName(null), "", "없는 값");
  // 이름에 괄호가 들어간 경우는 건드리지 않는다 (주소가 아니면 그대로 둔다)
  eq(relName("김서은(중2)"), "김서은(중2)", "주소가 아닌 괄호는 안 뗀다");

  const { nameOf } = await import("../lib/importExam.js");
  eq(nameOf("서한결 (https://a.b/c)"), "서한결", "성적 옮기기도 같은 규칙");
}

if (fail) { console.log("\n❌ 연도 맞추기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("✅ 연도 맞추기 통과");
