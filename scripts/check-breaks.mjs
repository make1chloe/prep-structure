/**
 * **쉬는 시간을 언제 알릴까** (lib/breaks.js)
 *
 * 원장님 (2026-08-07) — 「반복적으로 5분이상이거나, 1회 10분이상일때」
 *
 * 여기서 넓게 잡으면 **알림이 하루에 스무 번 울린다.** 그러면 알림을
 * 꺼버리시게 되고, 정작 봐야 할 것까지 같이 죽는다. 좁게 잡으면 20분씩
 * 사라지는 아이를 놓친다. 그래서 못 박아 둔다.
 *
 * 쓰는 법:  node scripts/check-breaks.mjs
 */
import { notable, minutesOf, breakLine, LONG_MIN, OFTEN_MIN, OFTEN_N } from "../lib/breaks.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const done = (m) => ({ started_at: "2026-08-07T05:00:00Z", ended_at: "2026-08-07T05:10:00Z", minutes: m });

console.log("== 원장님이 주신 규칙 그대로 ==");
eq([LONG_MIN, OFTEN_MIN, OFTEN_N], [10, 5, 2], "10분 · 5분 두 번");

console.log("\n== 한 번에 10분이면 그것만으로 ==");
eq(notable([done(10)])?.why, "한 번에 10분", "딱 10분");
eq(notable([done(12)])?.why, "한 번에 12분", "12분");
eq(notable([done(9)]), null, "9분은 안 알린다");

console.log("\n== 5분 넘는 것이 두 번이면 ==");
eq(notable([done(5), done(5)])?.why, "5분 넘는 쉼이 2번", "5분 두 번");
eq(notable([done(6), done(7), done(8)])?.why, "5분 넘는 쉼이 3번", "세 번");
// **한 번은 안 알린다.** 화장실 한 번 다녀오는 것까지 울리면 안 된다
eq(notable([done(5)]), null, "5분 한 번");
eq(notable([done(4), done(4), done(4)]), null, "4분씩 세 번 — 짧은 것은 여러 번이어도");

console.log("\n== 아무것도 없을 때 ==");
eq(notable([]), null, "쉰 적 없음");

console.log("\n== 아직 안 돌아온 아이 ==");
// **돌아올 때까지 기다리면 늦다.** 나가 있는 시간이 이미 10분을 넘었으면 센다
const NOW = Date.parse("2026-08-07T06:00:00Z");
const open = { started_at: "2026-08-07T05:45:00Z", ended_at: null, minutes: null };
eq(minutesOf(open, NOW), 15, "15분째 나가 있다");
eq(notable([open], NOW)?.why, "한 번에 15분", "돌아오기 전에도 걸린다");
// 끝난 줄은 적힌 값을 그대로 쓴다 (나중에 다시 세면 화면마다 달라진다)
eq(minutesOf(done(7), NOW), 7, "끝난 것은 적힌 값");

console.log("\n== 화면에 한 줄로 ==");
eq(breakLine([done(5), done(12)], NOW), "2번 · 모두 17분 (제일 긴 것 12분)", "여러 번");
eq(breakLine([done(5)], NOW), "1번 · 모두 5분", "한 번이면 「제일 긴 것」 을 안 적는다");
eq(breakLine([], NOW), null, "없으면 안 그린다");

if (fail) { console.log("\n❌ 쉬는 시간 규칙에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 쉬는 시간 통과");
