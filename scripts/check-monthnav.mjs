/**
 * **달력은 한 번에 한 달, 넘겨서 본다** (원장님, 2026-08-09 — 「달력의 세부
 * 내용을 보려면 스크롤을 끝까지 내려서 보고 다시 위로 올라와야 해. 달력을
 * 오늘이 포함된 월부터 한 칸만 보여주고 양옆으로 버튼 눌러 넘겨서 보는
 * 방식으로 바꿔줘. 전체 페이지에 있는 모든 달력들 다 그렇게 바꿔줘」).
 *
 * 달력을 쌓아 놓으면 아래 것을 보려고 끝까지 내렸다가 다시 올라와야 한다.
 * 그리고 **넘기는 방법은 온 앱이 한 벌**이어야 한다 — 화면마다 다르게 넘기면
 * 원장님이 화면마다 다시 배우신다.
 *
 * 쓰는 법:  node scripts/check-monthnav.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";

let fail = 0;
const ok = (cond, what) => {
  if (!cond) { console.log(`  ✗ ${what}`); fail = 1; }
};

const read = (p) => readFileSync(p, "utf8");

console.log("== 넘기는 조각이 한 벌인가 ==");
const nav = read("components/MonthNav.jsx");
ok(/export default function MonthNav/.test(nav), "components/MonthNav 하나가 넘김을 맡는다");
// **몇 년인지도 적는다** — 학사일정은 3월에 시작해 다음 해 2월에 끝난다
ok(/\{Number\(month\.slice\(0, 4\)\)\}년/.test(nav), "해가 바뀌어도 몇 년인지 보인다");
// 있는 것보다 밖으로 나가면 빈 달만 보게 된다
ok(/const canBack = !bounds\?\.min \|\| back >= bounds\.min;/.test(nav), "앞으로 못 갈 땐 막는다");
ok(/const canNext = !bounds\?\.max \|\| next <= bounds\.max;/.test(nav), "뒤로 못 갈 땐 막는다");
ok(/disabled=\{month === home\}/.test(nav), "이미 이번 달이면 「이번 달」 을 못 누른다");

console.log("\n== 달력마다 다 그렇게 바뀌었나 ==");
/**
 * **달력을 새로 만들 때 이 검사가 잡아야 한다.** monthGrid 로 달력 칸을
 * 그리는 화면은 전부 MonthNav 로 넘겨야 한다 — 하나라도 옛 방식으로 남으면
 * 그 화면만 스크롤로 훑게 된다.
 */
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = `${d}/${f}`;
    if (statSync(p).isDirectory()) { if (!/node_modules|\.next|\.git/.test(f)) walk(p); }
    else if (/\.jsx$/.test(f)) files.push(p);
  }
})("app");

const calendars = files.filter((f) => /monthGrid\(/.test(read(f)));
ok(calendars.length >= 2, `달력을 그리는 화면을 찾았다 (${calendars.length}곳)`);
for (const f of calendars) {
  const s = read(f);
  ok(/MonthNav/.test(s), `${f} 가 MonthNav 로 넘긴다`);
  // **여러 달을 쌓지 않는다** — 한 번에 하나만 그린다
  ok(!/months\.map\(\(ym\)/.test(s), `${f} 가 여러 달을 쌓지 않는다`);
}
// 회차 관리도 (MonthGrid 를 쓰므로 monthGrid( 로는 안 잡힌다)
const sb = read("app/schedule/ScheduleBoard.jsx");
ok(/<MonthNav/.test(sb), "회차 관리도 MonthNav 로 넘긴다");
ok(!/monthList\.map\(\(ym\) => \(\s*<MonthCard/.test(sb), "회차 관리가 석 달을 쌓지 않는다");
// 「지난 달 보기 / 접기」 로 따로 접어두던 것은 없앴다 — 같은 줄에서 넘어간다
ok(!/지난 달 접기/.test(sb), "지난 달도 같은 자리에서 넘어간다");

console.log("\n== 오늘이 든 달부터 여나 ==");
const peek = read("app/neis/PeekCalendar.jsx");
ok(/months\.includes\(today\.slice\(0, 7\)\)/.test(peek), "오늘이 든 달이 있으면 거기서 시작한다");
// 없으면 오늘에 제일 가까운 달로 — 3월을 보여주고 10월까지 여덟 번 누르게 하지 않는다
ok(/months\.find\(\(m\) => m >= today\.slice\(0, 7\)\)/.test(peek), "없으면 오늘에 가까운 달로");
ok(/const shownYM = allMonths\.includes\(calYM\)/.test(sb), "회차 관리도 이번 달부터 연다");

console.log("\n== 달 이름을 두 번 적지 않나 ==");
/**
 * PRINCIPLES 원칙 1 — 같은 정보를 두 벌로 그리지 않는다. 넘김 머리가 곧
 * 달 제목이므로, 그 아래에 「8월」 을 또 적으면 한 화면에 같은 말이 두 번이다.
 */
ok(!/<h2[^>]*>\{ymLabel\(ym\)\}<\/h2>/.test(sb), "회차 관리에 달 이름이 한 번만 나온다");
ok(!/<b style=\{\{ fontSize: 13 \}\}>\{Number\(ym\.slice\(5, 7\)\)\}월<\/b>/.test(peek),
   "나이스 원본에 달 이름이 한 번만 나온다");

if (fail) { console.log("\n❌ 달력 넘기기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 달력 넘기기 통과");
