/**
 * **이 학생에게만 더한 항목** (0182, 원장님 2026-08-28 — 「재원생에서
 * 루틴에 학습항목 추가할 수 있게 해줘」).
 *
 * 이 기능의 무서운 실패는 **조용한 어긋남**이다:
 *   화면(routineChoices)에는 더한 항목이 보이는데
 *   차림(nextRoutine)이 그걸 안 실으면 → 「루틴엔 있는데 아이한테 안 나감」
 * 오류도 안 나고, 원장님은 수업이 끝난 뒤에야 안다.
 *
 * 그래서 둘째 묶음이 **읽는 자리 셋이 다 이 칸을 실제로 읽는지**를
 * 소스에서 확인한다. 한 곳만 빠져도 빨강이다.
 *
 * 쓰는 법:  node scripts/check-routineadd.mjs
 */
import { readFileSync } from "node:fs";
import { ADD_BUCKETS, normalizeAdd, addIds, addBucketsOf, pruneAdd } from "../lib/routineAdd.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const ok = (cond, what) => { if (!cond) { console.log(`  ✗ ${what}`); fail = 1; } };

console.log("== 담긴 모양을 믿을 수 있게 푸나 ==");
// 0182 전 DB 는 칸 자체가 없다 — undefined 가 와도 빈 세 갈래여야 한다.
// 안 그러면 화면과 차림이 저마다 다르게 터진다.
eq(normalizeAdd(undefined), { inclass: [], home: [], next: [] }, "칸이 없으면 빈 세 갈래");
eq(normalizeAdd(null), { inclass: [], home: [], next: [] }, "null 이어도 빈 세 갈래");
eq(normalizeAdd([]), { inclass: [], home: [], next: [] }, "배열이 와도(잘못 담김) 빈 세 갈래");
eq(normalizeAdd({ inclass: "x" }), { inclass: [], home: [], next: [] }, "배열이 아닌 값은 버린다");
eq(
  normalizeAdd({ inclass: ["a", "a", "", null, "b"], home: ["c"] }),
  { inclass: ["a", "b"], home: ["c"], next: [] },
  "중복·빈 값은 걷어낸다"
);
// 모르는 갈래는 조용히 버린다 — 갈래는 ADD_BUCKETS 한 벌이 정한다
eq(normalizeAdd({ 몰라: ["a"] }), { inclass: [], home: [], next: [] }, "모르는 갈래는 안 싣는다");

console.log("\n== 갈래 ==");
eq(ADD_BUCKETS.map((b) => b.key), ["inclass", "home", "next"], "갈래는 셋 (등원·숙제·예습)");
// 루틴 표의 세 칸과 **같은 뜻**이어야 한다 — 새 잣대를 만들지 않았다는 못
eq(
  ADD_BUCKETS.map((b) => b.step),
  ["inclass_items", "home_items", "home_next"],
  "갈래가 routine_steps 의 세 칸과 짝이 맞는다"
);
// 등원과 숙제 양쪽에 같은 항목 — 루틴이 원래 허용하는 것이다 (2026-08-28)
eq(addBucketsOf({ inclass: ["a"], home: ["a"] }, "a"), ["inclass", "home"], "양쪽에 넣는 것이 된다");
eq(addIds({ inclass: ["a"], home: ["a", "b"], next: ["c"] }), ["a", "b", "c"], "전부 모으면 중복이 없다");

console.log("\n== 죽은 이름표 걷어내기 ==");
{
  const alive = new Set(["a", "c"]);
  const r = pruneAdd({ inclass: ["a", "b"], home: ["b"], next: ["c"] }, alive);
  eq(r.add, { inclass: ["a"], home: [], next: ["c"] }, "죽은 것만 빠진다");
  eq(r.cut, 2, "몇 개 걷었는지 센다");
  // 지운 것이 없으면 원본을 그대로 — 쓸데없는 저장을 안 만든다
  const same = pruneAdd({ inclass: ["a"], home: [], next: [] }, alive);
  eq(same.cut, 0, "지울 것이 없으면 0");
}

console.log("\n== 읽는 자리가 하나도 안 빠졌나 (조용한 어긋남 방지) ==");
/**
 * 0182 를 더할 때 **화면에만 넣고 차림에 안 넣는** 것이 이 기능의 대표
 * 사고다. 세 자리가 실제로 이 칸을 읽는지 소스에서 확인한다.
 */
const SITES = [
  ["app/students/routinePickActions.js", "화면 목록 (재원생 → 루틴)"],
  ["app/today/routineActions.js", "실제 차림 (오늘 수업)"],
  ["lib/itemRefs.js", "죽은 이름표 청소 (항목을 지울 때)"],
];
for (const [f, what] of SITES) {
  const src = readFileSync(f, "utf8");
  ok(/routine_add/.test(src), `${what} — ${f} 가 routine_add 를 안 읽습니다`);
  ok(
    /from ["']@\/lib\/routineAdd["']/.test(src),
    `${what} — ${f} 가 lib/routineAdd 를 안 씁니다 (모양을 따로 풀면 어긋납니다)`
  );
}

/**
 * 차림은 **세 갈래를 저마다 제 칸에** 실어야 한다. 하나만 빠뜨려도 그
 * 갈래만 조용히 안 나간다 — 화면에는 그대로 보이므로 눈으로는 안 잡힌다.
 *
 * 「어딘가에 myAdd.next 라고 적혀 있나」 로는 못 잡는다. 실제로 그 글자는
 * 화면에 돌려주는 줄(steps.homeItems)에도 있어서, 진짜 차림에서 빠뜨려도
 * 검사가 초록이었다 (2026-08-28, 이 검사를 일부러 깨뜨려 확인).
 * 그래서 **그 갈래가 제 짝 칸과 함께 합쳐지는지**를 본다.
 */
{
  const src = readFileSync("app/today/routineActions.js", "utf8");
  for (const b of ADD_BUCKETS) {
    const pair = new RegExp(`withAdd\\(\\s*step\\.${b.step}\\s*,\\s*myAdd\\.${b.key}\\s*\\)`);
    ok(
      pair.test(src),
      `차림이 「${b.label}」을 제 칸에 안 붙입니다 — withAdd(step.${b.step}, myAdd.${b.key}) 가 없습니다`
    );
  }
}

if (fail) {
  console.log("\n❌ 위를 고쳐주세요");
  process.exit(1);
}
console.log("\n✅ 이 학생만 더한 항목 통과");
