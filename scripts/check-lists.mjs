// 목록이면 **찾을 수 있고 늘어세울 수 있나**
//
// 원장님 (2026-08-13): 「학습항목도 정렬 필터가 안되는데 기본적으로 목록이라는건
// 다 정렬 필터가 있어야하는거잖아」
//
// 이건 화면 하나의 문제가 아니라 **다음에 만들 목록에서도 또 빠질 일**이다.
// 실제로 학습항목·영상·단원·반·상담일지가 저마다 다르게 빠져 있었다 —
// 어떤 건 검색만, 어떤 건 정렬만, 단원은 둘 다 없었다.
//
// 그래서 목록 화면을 이름으로 못 박고, 셋을 갖췄는지 본다.
//   검색   이름을 알 때 칠 데가 있나
//   정렬   무엇으로 늘어설지 고를 수 있나
//   빠진것 채워야 할 줄만 골라 볼 수 있나 (있는 화면만)
//
// 여기 없는 새 목록을 만들면 이 표에 한 줄 늘린다.

import { readFileSync, existsSync } from "node:fs";

let bad = 0;
const say = (m) => { console.log(`  ❌ ${m}`); bad++; };
const ok = (m) => console.log(`  ✅ ${m}`);

/** [화면 이름, 파일, 「빠진 것만」 도 있어야 하나] */
const LISTS = [
  ["재원생", "app/students/StudentList.jsx", true],
  ["교재", "app/textbooks/TextbookList.jsx", true],
  ["단원", "app/textbooks/UnitList.jsx", true],
  ["학습항목", "app/homework/HomeworkList.jsx", true],
  ["수업(반)", "app/classes/ClassManager.jsx", true],
  ["영상", "app/videos/VideoBoard.jsx", false],
  ["상담일지", "app/notes/NotesBoard.jsx", false],
];

// 검색칸 — placeholder 에 「검색」·「찾기」 가 있으면 그것이다
const HAS_SEARCH = /placeholder="[^"]*(검색|찾기)/;
// 정렬 — 고르는 칸이나 누르는 열 이름
const HAS_SORT = /title="목록 정렬"|sortRows\(|sortBooks\(|sortableTh\(|setSort\(|setSortBy\(|setSortKey\(/;
// 빠진 것만 — 채워야 할 줄만 보기
const HAS_MISSING = /빠진 것만|없는 것만|없는 교재만|hasMissing\(/;

console.log("== 목록마다 검색 · 정렬이 있나 ==");
for (const [name, file, needMissing] of LISTS) {
  if (!existsSync(file)) { say(`${name} — 파일이 없습니다 (${file}). 이 표를 고쳐주세요`); continue; }
  const s = readFileSync(file, "utf8");
  if (!HAS_SEARCH.test(s)) say(`${name} (${file}) — 검색칸이 없습니다`);
  if (!HAS_SORT.test(s)) say(`${name} (${file}) — 늘어세울 기준을 고를 수가 없습니다`);
  if (needMissing && !HAS_MISSING.test(s)) {
    say(`${name} (${file}) — 「빠진 것만」 보기가 없습니다`);
  }
}
if (!bad) ok(`목록 ${LISTS.length}곳 — 검색 · 정렬 · 빠진 것만 갖춰져 있습니다`);

/**
 * 늘어세우는 **규칙**은 한 곳에 (lib/listSort). 화면마다 따로 적으면
 * 재원생에서는 빈 값이 뒤로 가는데 교재에서는 앞으로 오는 식으로 갈린다.
 */
console.log("\n== 빈 값을 뒤로 보내는 규칙이 한 곳에 있나 ==");
const lib = readFileSync("lib/listSort.js", "utf8");
if (!/if \(!va\) return 1;/.test(lib)) say("lib/listSort 가 빈 값을 뒤로 보내지 않습니다");
if (!bad) ok("lib/listSort 한 곳에서 정한다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 목록 검사 통과");
