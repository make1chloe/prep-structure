/**
 * **안 본 알림 배지** (lib/inbox.js)
 *
 * 원장님 (2026-08-07) — 「확인 안 한 알람이 있으면 카톡처럼 대시보드 메뉴에
 * 배지로 확인 안 한 갯수를 표시해줘」
 *
 * 배지는 **틀리면 안 뜨느니만 못하다.** 「3」 이라고 떠 있는데 들어가서
 * 아무것도 없으면 그다음부터 안 믿게 되고, 그러면 진짜 3건이 왔을 때도
 * 안 들어가신다.
 *
 * 쓰는 법:  node scripts/check-inbox.mjs
 */
import { readFileSync } from "node:fs";
import { unreadForStaff, badgeText } from "../lib/inbox.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

console.log("== 숫자 적기 ==");
eq(badgeText(0), null, "0 이면 안 그린다");
eq(badgeText(null), null, "없으면 안 그린다");
eq(badgeText(3), "3", "3");
eq(badgeText(99), "99", "99");
// 세 자리가 되면 메뉴가 밀린다
eq(badgeText(100), "99+", "100 은 99+");
eq(badgeText(4821), "99+", "아무리 많아도 99+");

console.log("\n== 못 세면 0 으로 본다 ==");
/**
 * **배지가 안 뜨는 것이 잘못된 숫자가 뜨는 것보다 낫다.**
 * SQL 을 아직 안 돌리셨거나 읽기가 막히면 조용히 0 이다.
 */
const dead = {
  from: () => ({
    select: () => ({
      eq: async () => ({ count: null, error: { code: "42P01" } }),
      is: () => ({ neq: async () => ({ count: null, error: { code: "42P01" } }) }),
    }),
  }),
};
eq(await unreadForStaff(dead), { total: 0, requests: 0, comments: 0 }, "표가 없을 때");
eq(await unreadForStaff(null), { total: 0, requests: 0, comments: 0 }, "아무것도 없을 때");

console.log("\n== 두 가지를 더한다 ==");
const ok = (req, com) => ({
  from: (t) => ({
    select: () => ({
      eq: async () => ({ count: req, error: null }),
      is: () => ({ neq: async () => ({ count: com, error: null }) }),
    }),
  }),
});
eq(await unreadForStaff(ok(2, 3)), { total: 5, requests: 2, comments: 3 }, "결석·문의 2 + 댓글 3");
eq(await unreadForStaff(ok(0, 0)), { total: 0, requests: 0, comments: 0 }, "둘 다 없으면");

console.log("\n== 화면이 실제로 쓰고 있나 ==");
const bar = readFileSync("components/TopBar.jsx", "utf8");
eq(bar.includes("unreadForStaff"), true, "위 메뉴가 센다");
// 학생·학부모 메뉴에는 대시보드가 없다 — 괜히 물어보면 그만큼 느려진다
eq(bar.includes("isStaff(profile?.role)"), true, "선생님 계정에서만 센다");
/**
 * 배지는 **「대시보드」 묶음 이름 칸**에 붙는다.
 *
 * 2026-08-28 에 대메뉴가 다섯이 되면서 대시보드에도 하위 화면이 생겼다
 * (오늘 수업 · 재원생 · 일일/월간 리포트 · 숙제 검사). 그전에는 하위가
 * 없어서 `row.solo` 로 가렸는데, 그대로 두면 **조용히 안 붙는다** — 배지가
 * 안 뜨는 것은 오류가 아니라서 아무도 못 잡는다. 그래서 묶음 키로 본다.
 */
eq(bar.includes('row.group === "home" && badge'), true, "「대시보드」 옆에 붙는다");
eq(readFileSync("app/globals.css", "utf8").includes(".navbadge"), true, "배지 모양이 있다");

if (fail) { console.log("\n❌ 배지에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 안 본 알림 배지 통과");
