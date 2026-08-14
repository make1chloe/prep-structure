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
  // 진도는 수업 중 훑는 자리(유형 A)라 정렬 대신 「오늘 수업만」 필터가 기본이다
  ["진도", "app/progress/ProgressBoard.jsx", false],
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


/**
 * **진도를 적는 자리가 오늘 수업에만 있으면 안 된다** (원장님, 2026-08-14 —
 * 「학생별로 진도를 저장하는 화면이 오늘수업밖에 없고 그마저도 조악함」).
 *
 * 진도는 수업 중에만 적는 것이 아니다 — 상담 전에 보고, 결석한 아이 것을
 * 나중에 채우고, 회독을 넘긴다. 그때마다 오늘 수업에서 날짜를 찾아 들어갈
 * 수는 없다.
 *
 * 그리고 **한 벌이어야 한다.** 두 벌이면 한쪽에서 찍은 진도가 다른 쪽에
 * 안 보이고, 어느 쪽이 맞는지 알 수 없게 된다.
 */
console.log("\n== 진도를 적는 자리가 한 벌로 여러 화면에 있나 ==");
const PROG = "components/BookProgress.jsx";
if (!existsSync(PROG)) {
  say(`진도 판이 ${PROG} 에 없습니다 — 한 화면 안에 있으면 다른 화면에서 못 씁니다`);
} else {
  const users = ["app/today/StudentPanel.jsx", "app/students/StudentList.jsx"];
  for (const f of users) {
    if (!/BookProgress/.test(readFileSync(f, "utf8"))) {
      say(`${f} 에서 진도 판을 안 씁니다`);
    }
  }
  const src = readFileSync(PROG, "utf8");
  // 회독을 넘기는 길 — 표와 서버 액션은 있었는데 누를 데가 없었다
  if (!/nextRound/.test(src)) say(`${PROG} — 회독을 넘기는 단추가 없습니다`);
  // 하다 만 것과 아직 안 한 것은 다르다
  if (!/doing/.test(src)) say(`${PROG} — 「하는 중」 을 적을 수가 없습니다`);
  if (!bad) ok("진도 판이 한 벌로 오늘 수업 · 재원생 두 곳에 있습니다");
}

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 목록 · 진도 검사 통과");
