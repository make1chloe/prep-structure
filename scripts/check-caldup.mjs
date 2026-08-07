/**
 * **달력에 같은 것이 여러 줄로 뜨던 것** (lib/calendar.js 의 dedupeSameDay)
 *
 * 원장님 (2026-08-07) — 「중복이 있어」
 *
 * 8월 17일에 셋이 있었다.
 *   광복절 대체공휴일 — 정상 수업     ← 원장님이 정하신 것
 *   [전국] 대체공휴일                  ← 나이스 학사일정
 *   🚫 대체공휴일                      ← 휴강 표
 *
 * 각자 다른 표에서 왔으니 코드가 보기에는 다른 줄이지만, 달력을 보는
 * 사람에게는 **한 가지 일**이다. 세 줄이 차지하면 그날 정말 봐야 할
 * 보강·상담이 「+2」 뒤로 밀린다.
 *
 * 쓰는 법:  node scripts/check-caldup.mjs
 */
import { baseTitle, dedupeSameDay } from "../lib/calendar.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

console.log("== 이름에서 꾸밈을 뗀다 ==");
eq(baseTitle("[전국] 대체공휴일"), "대체공휴일", "[전국] 표시");
eq(baseTitle("🚫 대체공휴일"), "대체공휴일", "그림 표시");
eq(baseTitle("광복절 대체공휴일 — 정상 수업"), "광복절 대체공휴일", "뒤에 붙은 결정");
eq(baseTitle("여름방학"), "여름방학", "붙은 것이 없으면 그대로");
eq(baseTitle(""), "", "빈 값");

console.log("\n== 같은 날 같은 것은 하나로 ==");
const rank = (x) => (x.source === "휴강" ? 3 : x.source === "일정" ? 2 : 1);
const day = [
  { date: "2026-08-17", title: "광복절 대체공휴일 — 정상 수업", source: "일정" },
  { date: "2026-08-17", title: "[전국] 대체공휴일", source: "학사일정" },
  { date: "2026-08-17", title: "🚫 대체공휴일", source: "휴강" },
];
// **더 많이 말해주는 것**을 남긴다 — 휴강은 「그날 수업이 없다」 까지 담고 있다
eq(dedupeSameDay(day, rank).map((x) => x.title), ["광복절 대체공휴일 — 정상 수업", "🚫 대체공휴일"],
   "「광복절 대체공휴일」 과 「대체공휴일」 은 이름이 다르다 — 각각 남는다");

const same = [
  { date: "2026-08-17", title: "[전국] 대체공휴일", source: "학사일정" },
  { date: "2026-08-17", title: "🚫 대체공휴일", source: "휴강" },
];
eq(dedupeSameDay(same, rank).map((x) => x.source), ["휴강"], "같은 이름이면 더 말해주는 쪽만");

console.log("\n== 붙이면 안 되는 것 ==");
// 「대체공휴일」 과 「개교기념일」 이 같은 날 있을 수 있고, 그건 정말 두 가지다
eq(
  dedupeSameDay([
    { date: "2026-08-17", title: "대체공휴일", source: "학사일정" },
    { date: "2026-08-17", title: "개교기념일", source: "학사일정" },
  ], rank).length,
  2,
  "이름이 다르면 안 합친다"
);
// 날이 다르면 당연히 두 줄
eq(
  dedupeSameDay([
    { date: "2026-08-17", title: "대체공휴일", source: "학사일정" },
    { date: "2026-08-18", title: "대체공휴일", source: "학사일정" },
  ], rank).length,
  2,
  "날이 다르면 안 합친다"
);
// 이름이 없는 줄은 서로 뭉개면 안 된다
eq(
  dedupeSameDay([
    { date: "2026-08-17", title: "", source: "학사일정" },
    { date: "2026-08-17", title: "", source: "휴강" },
  ], rank).length,
  2,
  "이름이 빈 것끼리는 안 합친다"
);

console.log("\n== 차례는 그대로 ==");
eq(
  dedupeSameDay([
    { date: "2026-08-17", title: "가", source: "학사일정" },
    { date: "2026-08-17", title: "나", source: "학사일정" },
    { date: "2026-08-17", title: "다", source: "학사일정" },
  ], rank).map((x) => x.title),
  ["가", "나", "다"],
  "합칠 것이 없으면 순서가 안 바뀐다"
);

if (fail) { console.log("\n❌ 달력 중복 정리에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 달력 중복 정리 통과");
