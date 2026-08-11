/**
 * **본보기 루틴** (원장님, 2026-08-11 — 「학습항목이랑 루틴설계해야 하는데
 * 엄두가 안나」 → 「도와줘」).
 *
 * 본보기가 **가리키는 학습 항목 이름이 진짜 있어야** 한다. 이름을 하나
 * 틀리면 그 단계가 조용히 비어서 들어가고, 원장님은 「루틴 다음」 을
 * 눌렀을 때에야 안다.
 *
 * 쓰는 법:  node scripts/check-routinetpl.mjs
 */
import { readFileSync } from "node:fs";
import { ROUTINE_TEMPLATES, TEMPLATE_AREAS, templateFor, buildSteps } from "../lib/routineTemplates.js";
import { BASIC_HOMEWORK } from "../lib/basicHomework.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const ok = (cond, what) => { if (!cond) { console.log(`  ✗ ${what}`); fail = 1; } };

console.log("== 본보기가 가리키는 항목이 진짜 있나 ==");
/**
 * 여기가 이 검사의 핵심이다. 이름 하나가 어긋나면 그 단계는 빈 채로
 * 들어가고, 아무 오류도 안 난다.
 */
const known = new Set(BASIC_HOMEWORK.map((i) => i.name));
for (const [area, steps] of Object.entries(ROUTINE_TEMPLATES)) {
  steps.forEach((s, i) => {
    [...(s.inclass || []), ...(s.home || [])].forEach((n) => {
      if (!known.has(n)) { console.log(`  ✗ ${area} ${i + 1}단계 — 「${n}」 는 기본 학습 목록에 없습니다`); fail = 1; }
    });
  });
}
if (!fail) console.log(`  ${TEMPLATE_AREAS.length}개 영역이 모두 있는 항목만 가리킵니다`);

console.log("\n== 단계마다 할 것이 있나 ==");
// 등원도 숙제도 비어 있는 단계는 넣어봐야 아무 일도 안 한다
for (const [area, steps] of Object.entries(ROUTINE_TEMPLATES)) {
  ok(steps.length > 0, `${area} 에 단계가 있다`);
  steps.forEach((s, i) => {
    ok((s.inclass || []).length + (s.home || []).length > 0, `${area} ${i + 1}단계에 할 것이 있다`);
    ok((s.label || "").trim().length > 0, `${area} ${i + 1}단계에 이름이 있다`);
  });
}

console.log("\n== 이름을 id 로 옮기나 ==");
{
  const items = [
    { id: "id-1", name: "문법 개념 정독 · 문답노트 정리" },
    { id: "id-2", name: "셀프녹음테스트 (문답노트)" },
    { id: "id-3", name: "문법 문제풀기" },
  ];
  const { rows, missing } = buildSteps(templateFor("문법"), items);
  eq(rows[0].inclass_items, ["id-1"], "등원 항목을 id 로");
  eq(rows[0].home_items, ["id-2", "id-3"], "숙제 항목을 id 로");
  eq(rows[0].sort, 10, "차례는 10, 20, 30…");
  eq(rows[1].sort, 20, "두 번째는 20");
  // **못 찾은 것은 버리지 않고 돌려준다** — 무엇이 빠졌는지 알아야 채우신다
  ok(missing.includes("구두테스트 (문답노트)"), "없는 이름은 알려준다");
  ok(!missing.includes("문법 문제풀기"), "있는 이름은 안 알린다");
}
eq(templateFor("없는영역"), null, "본보기 없는 영역은 null");
eq(templateFor(""), null, "영역이 비면 null");

console.log("\n== 넣을 때 지키는 것 ==");
{
  const act = readFileSync("app/textbooks/routineActions.js", "utf8");
  ok(/export async function seedRoutine/.test(act), "본보기를 넣는 자리가 있다");
  /**
   * **이미 있는 루틴을 덮으면 안 된다.** 손으로 짜두신 것을 덮으면
   * 되돌릴 길이 없다 — 지우는 것은 원장님 손에 둔다.
   */
  ok(/\.limit\(1\)/.test(act) && /이미 루틴이 있어요/.test(act), "이미 있으면 안 덮는다");
  ok(/missing/.test(act), "못 찾은 항목을 돌려준다");
  /**
   * **하나도 못 이었으면 안 넣는다** — 빈 단계 세 줄이 들어가고 본보기
   * 단추는 사라져서, 쓸모없는 줄을 손으로 지우는 일이 늘었다 (검사판에서 걸림)
   */
  ok(/filled\.length === 0/.test(act), "하나도 못 이으면 아무것도 안 넣는다");
  ok(/insert\(\s*filled/.test(act), "채워진 단계만 넣는다");

  const ed = readFileSync("app/textbooks/RoutineEditor.jsx", "utf8");
  ok(/steps\.length === 0 && \(/.test(ed), "루틴이 없을 때만 본보기 단추가 뜬다");
}

if (fail) { console.log("\n❌ 본보기 루틴에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 본보기 루틴 통과");
