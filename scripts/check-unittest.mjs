/**
 * **단원평가는 검사 대상이 아니다** (0106)
 *
 * 원장님 (2026-08-07) — 「숙제에 체크하면 검사할 대상이 아니라 공지의
 * 개념으로 잡혀야 해서 완료·미완료·미흡 체크 안 함」
 *
 * 여기가 무너지면 조용히 나쁜 일이 벌어진다 — 단원평가가 검사 목록에
 * 남아서 매일 「안 낸 숙제」 로 뜨고, 그것이 경고 1회가 되고, 세 번이면
 * **안 한 적도 없는 아이가 반성문 대상**이 된다. 오류는 안 난다.
 *
 * 쓰는 법:  node scripts/check-unittest.mjs
 */
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const read = (p) => readFileSync(p, "utf8");

console.log("== 검사 목록에서 빠지나 ==");
const today = read("app/today/page.jsx");
eq(today.includes("unitTestIds"), true, "오늘 수업 — 단원평가를 가려낸다");
eq(/!unitTestIds\.has\(iid\)/.test(today), true, "오늘 수업 — 검사 대상에서 뺀다");

const check = read("app/check/page.jsx");
eq(check.includes("unitTest"), true, "숙제 검사 — 단원평가를 가려낸다");
eq(/\.filter\(\(i\) => !unitTest\.has\(i\.homework_item_id\)\)/.test(check), true,
   "숙제 검사 — 검사 대상에서 뺀다");

console.log("\n== 아이는 결과만 낸다 ==");
const box = read("app/me/UnitTestBox.jsx");
// **단원 이름을 아이가 적으면** 같은 단원이 여러 이름으로 쌓여서
// 「관계사에서 세 번째」 를 셀 수가 없게 된다
eq(/name="term"|placeholder="단원/.test(box), false, "단원 이름을 적는 칸이 없다");
eq(box.includes("맞은 수"), true, "맞은 개수");
eq(box.includes("전체"), true, "전체 문항 수");
// **통과 여부도 아이가 안 고른다** — 고르게 하면 기록이 아니라 주장이 된다
// 왜 그렇게 뒀는지는 주석에 적혀 있다 — 주석까지 걸면 설명을 못 남긴다
const boxCode = box.replace(/\/\*[\s\S]*?\*\//g, "");
eq(/통과했어요|passed/.test(boxCode), false, "통과 여부를 고르는 칸이 없다");

const act = read("app/me/unitTestActions.js");
eq(act.includes("word_cut_pct"), true, "통과선은 선생님이 정하신 것으로 판단한다");
eq(act.includes('kind: "unit"'), true, "성장 기록에 단원평가로 들어간다");
// 두 번 내도 한 줄. 선생님이 매기신 것은 안 건드린다
eq(act.includes('have.source !== "form"'), true, "선생님이 채점하신 줄은 안 덮는다");

console.log("\n== 배정하는 쪽 ==");
const hw = read("app/homework/HomeworkList.jsx");
eq(hw.includes("unit_test"), true, "학습 항목에 단원평가 표시가 있다");
const hwAct = read("app/homework/actions.js");
eq(hwAct.includes("row.unit_test"), true, "그 표시가 저장된다");
// 0106 전 DB 에서도 나머지는 저장돼야 한다 — 한 칸 때문에 전부 못 고치면 안 된다
eq(hwAct.includes("unit_test: _ut"), true, "0106 전이면 그 칸만 빼고 저장한다");

if (fail) { console.log("\n❌ 단원평가에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 단원평가 통과");
