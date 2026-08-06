/**
 * **날짜 읽기** (lib/importNotion.js 의 parseDate · isRealDate)
 *
 * 2026-08-06, 원장님 화면에서 보강 **171줄이 통째로 실패**했다 —
 *   `실패: date/time field value out of range: "2026-25-08"`
 *
 * 25가 **월 자리**에 들어간 것이다. 날짜를 「일/월」 순으로 적은 줄이 하나
 * 섞여 있었고, Postgres 는 한 덩어리로 받으므로 **그 한 줄 때문에 171줄이
 * 다 안 들어갔다.** 170줄이 들어가고 한 줄이 빠지는 것이 0줄보다 낫다.
 *
 * 날짜는 **자료가 예상 밖으로 들어오는 대표적인 자리**다. 노션·엑셀·손으로
 * 적은 것이 다 섞이고, 어느 것도 「우리 규칙」 을 따를 이유가 없다.
 * 그래서 실제로 부딪힌 모양들을 못 박아 둔다.
 *
 * 쓰는 법:  node scripts/check-date.mjs
 */

import { parseDate, isRealDate } from "../lib/importNotion.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

console.log("== 실제로 터진 것 ==");
// 「25/08/2026」 — 앞자리가 12를 넘으면 월일 수가 없다. 날이다
eq(parseDate("25/08/2026"), "2026-08-25", "일/월/연");
eq(parseDate("25.08.2026"), "2026-08-25", "점으로 적은 일/월/연");
eq(parseDate("25-08-2026"), "2026-08-25", "붙임표로 적은 일/월/연");
eq(parseDate("25/08", 2026), "2026-08-25", "연도 없이 일/월");
eq(parseDate("2026-25-08"), "2026-08-25", "월 자리에 날이 들어온 것");

console.log("\n== 없는 날은 없는 것으로 ==");
// 지어낸 날짜를 넘기면 DB 에서 터지고, 그러면 그 줄이 아니라 전부가 안 들어간다
eq(parseDate("2026-13-13"), null, "13월 13일 — 어느 쪽으로도 못 읽는다");
eq(parseDate("2026-02-31"), null, "2월 31일");
eq(parseDate("2026-00-05"), null, "0월");
eq(parseDate("그냥 글자"), null, "날짜가 아닌 것");
eq(parseDate(""), null, "빈 칸");
eq(parseDate(null), null, "없는 값");

console.log("\n== 원래 잘 읽던 것은 그대로 ==");
eq(parseDate("2026-08-25"), "2026-08-25", "제대로 적은 것");
eq(parseDate("2026/8/25"), "2026-08-25", "빗금");
eq(parseDate("2026. 8. 25."), "2026-08-25", "점과 띄어쓰기");
eq(parseDate("2025년 6월 2일"), "2025-06-02", "한국어 노션");
eq(parseDate("2025년 6월 2일 오후 4:00"), "2025-06-02", "뒤에 시간이 붙은 것");
eq(parseDate("June 2, 2025"), "2025-06-02", "영어 표기");
eq(parseDate("8/25", 2026), "2026-08-25", "연도 없이 월/일");
eq(parseDate("08/05/2026"), "2026-08-05", "둘 다 12 이하면 월/일로 본다");

console.log("\n== 연도 없는 것은 미래가 되지 않는다 ==");
// 노션의 「12/30」 이 올해로 붙어서 「최근 수업 12월 30일」 이 떴던 일이 있다
const now = new Date();
const y = now.getFullYear();
const got = parseDate("12/30");
const ok = got === `${y}-12-30` || got === `${y - 1}-12-30`;
if (!ok) { console.log(`  ✗ 연도 없는 12/30\n     나온 것: ${got}`); fail = 1; }
if (got > `${y}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`) {
  console.log(`  ✗ 연도 없는 날짜가 미래가 됐다: ${got}`); fail = 1;
}

console.log("\n== isRealDate ==");
eq(isRealDate("2026-08-25"), true, "있는 날");
eq(isRealDate("2026-25-08"), false, "25월");
eq(isRealDate("2024-02-29"), true, "윤년 2월 29일");
eq(isRealDate("2026-02-29"), false, "평년 2월 29일");
eq(isRealDate("2026-8-5"), false, "자릿수가 안 맞는 것");
eq(isRealDate(""), false, "빈 칸");

if (fail) { console.log("\n❌ 날짜 읽기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 날짜 읽기 통과");
