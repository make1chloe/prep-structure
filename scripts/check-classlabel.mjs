/**
 * **반 이름에 시간이 두 번 나오지 않나** (원장님, 2026-08-11 —
 * 「19:30-22:00 화목 7:30~10:00 이게 왜 중복으로 보이는지 모르겠어」).
 *
 * 노션에서 온 반 이름에는 시간이 이름 안에 적혀 있고, 반에는 시간 칸이
 * 따로 있다. 화면은 칸의 시간만 한 번 적고, 이름 속 시간은 걷어낸다.
 *
 * 쓰는 법:  node scripts/check-classlabel.mjs
 */
import { readFileSync } from "node:fs";
import { cleanClassName, classLabel } from "../lib/classLabel.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const ok = (cond, what) => { if (!cond) { console.log(`  ✗ ${what}`); fail = 1; } };

console.log("== 이름 속 시간을 걷어내나 ==");
eq(cleanClassName("화목 7:30~10:00"), "화목", "노션에서 온 그 모양");
eq(cleanClassName("화목 19:30-22:00"), "화목", "24시간 표기도");
eq(cleanClassName("월수금 5시~7시"), "월수금", "시 표기도");
eq(cleanClassName("고1 A"), "고1 A", "시간이 없으면 그대로 (고1 의 1 을 안 건드린다)");
eq(cleanClassName("중2 심화"), "중2 심화", "학년 숫자는 그대로");
// 이름이 시간뿐이면 지우지 않는다 — 빈 이름보다는 겹치는 이름이 낫다
eq(cleanClassName("7:30~10:00"), "7:30~10:00", "이름이 시간뿐이면 그대로");

console.log("\n== 한 줄 이름표 ==");
eq(classLabel({ name: "화목 7:30~10:00", start_time: "19:30:00", end_time: "22:00:00" }),
   "19:30-22:00 화목", "시간은 칸에서 한 번만");
eq(classLabel({ name: "고1 A", start_time: "17:00:00" }), "17:00 고1 A", "끝 시간이 없으면 시작만");
eq(classLabel({ name: "고1 A" }), "고1 A", "시간 칸이 비면 이름만");

console.log("\n== 화면이 이 규칙을 쓰나 ==");
{
  const board = readFileSync("app/today/TodayBoard.jsx", "utf8");
  ok(/classLabel\(klass\)/.test(board), "오늘 수업 반 머리가 classLabel 을 쓴다");
  ok(!/cut\(klass\.start_time\)[\s\S]{0,80}klass\.name/.test(board),
     "시간과 이름을 따로 이어붙이지 않는다");
}

if (fail) { console.log("\n❌ 반 이름표에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 반 이름표 통과");
