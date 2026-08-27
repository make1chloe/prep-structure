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
/**
 * 위 메뉴는 두 조각이다 (성능수리 3차) — **세는 쪽**(TopBar, 서버)과
 * **그리는 쪽**(NavGrid, 브라우저). 「지금 여기」 표시가 화면을 옮길 때
 * 따라와야 해서 갈랐다 (뿌리 레이아웃은 화면을 옮겨도 다시 안 그려진다).
 * 검사는 **위 메뉴 전체**를 보는 것이 뜻이므로 둘을 붙여서 본다 —
 * 한쪽만 보면 나머지 반쪽이 사라져도 초록으로 뜬다.
 */
const bar =
  readFileSync("components/TopBar.jsx", "utf8") +
  readFileSync("components/NavGrid.jsx", "utf8");
eq(bar.includes("unreadForStaff"), true, "위 메뉴가 센다");
// 학생·학부모 메뉴에는 대시보드가 없다 — 괜히 물어보면 그만큼 느려진다
eq(bar.includes("isStaff(profile?.role)"), true, "선생님 계정에서만 센다");
// 대시보드는 묶음 안에 화면이 없어서 **묶음 이름 칸이 곧 그 화면**이다
// (2026-08-07, 메뉴를 묶음별 줄로 바꾸면서). 배지도 거기 붙는다
eq(bar.includes('row.solo?.key === "home" && badge'), true, "「대시보드」 옆에 붙는다");
eq(readFileSync("app/globals.css", "utf8").includes(".navbadge"), true, "배지 모양이 있다");

if (fail) { console.log("\n❌ 배지에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 안 본 알림 배지 통과");
