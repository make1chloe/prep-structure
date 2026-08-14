/**
 * **학생·학부모 위 메뉴 차례 = 화면 덩어리 기본 차례** (원장님, 2026-08-14 —
 * 「학부모·학생 메뉴 순서랑 실제 배치 순서 통일해줘」).
 *
 * 메뉴는 업로드 → 공지 → 일정 → 학습 → 성장인데 덩어리가 다른 차례로
 * 쌓여 있으면, 메뉴를 눌러 내려간 자리와 눈의 기대가 어긋난다. 새 덩어리를
 * 더할 때 아무 데나 끼우면 다시 어긋나므로 검사로 잡는다.
 * (원장님이 화면 설정에서 정한 차례는 이보다 우선한다 — 그건 DB 값이라
 * 여기서 볼 일이 없다)
 *
 * 쓰는 법:  node scripts/check-navorder.mjs
 */
import { PAGES, NAV_GROUPS } from "../lib/screenLayout.js";

let fail = 0;
const ok = (cond, what) => {
  if (!cond) { console.log(`  ✗ ${what}`); fail = 1; }
};

for (const page of PAGES) {
  const groups = NAV_GROUPS[page.key] || [];
  const navOrder = groups.flatMap((g) => g.blocks);
  const blockKeys = page.blocks.map((b) => b.key);

  console.log(`== ${page.label} (${page.key}) ==`);
  // 메뉴에 안 실린 덩어리 · 덩어리가 없는 메뉴 항목 — 둘 다 놓친 것이다
  for (const k of blockKeys) {
    ok(navOrder.includes(k), `덩어리 「${k}」 가 어느 대메뉴에도 없습니다 (NAV_GROUPS.${page.key})`);
  }
  for (const k of navOrder) {
    ok(blockKeys.includes(k), `대메뉴가 가리키는 「${k}」 덩어리가 화면에 없습니다 (PAGES.${page.key})`);
  }
  // 기본 차례가 메뉴 차례와 같은가
  const expected = navOrder.filter((k) => blockKeys.includes(k));
  const actual = blockKeys.filter((k) => navOrder.includes(k));
  ok(
    JSON.stringify(expected) === JSON.stringify(actual),
    `덩어리 기본 차례가 메뉴 차례와 다릅니다.\n     메뉴 차례: ${expected.join(" → ")}\n     지금 차례: ${actual.join(" → ")}`
  );
}

if (fail) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("✅ 메뉴 차례 = 배치 차례 통과");
