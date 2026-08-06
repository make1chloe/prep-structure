// 단원 엑셀 검사 (lib/importUnit.js)
//
// 교재마다 「분량」 을 말하는 방식이 다르다 — 문법 워크북은 한 쪽에 25문항,
// 어법 교재는 네 쪽, 단어책은 40단어. 하나를 놓치면 그 교재는 화면에서
// 분량을 알 수 없게 된다. 원장님이 실제로 쓰시는 세 권으로 못 박아 둔다.
//
// 쓰는 법:  node scripts/check-unit.mjs

import { parseUnitAoA, UNIT_HEADERS, countRange, minutesOf, volumeText } from "../lib/importUnit.js";
let fail=0; const eq=(g,w,t)=>{const a=JSON.stringify(g),b=JSON.stringify(w);
  if(a!==b){console.log(`  ✗ ${t}\n     나온 것: ${a}\n     바란 것: ${b}`);fail=1;}};

console.log("== 문항 범위 세기 ==");
eq(countRange("01-06"), 6, "01-06");
eq(countRange("16-25"), 10, "16-25");
eq(countRange("1~25"), 25, "물결");
eq(countRange("3,5,7"), 3, "쉼표로 낱개");
eq(countRange("1-6, 12-15"), 10, "두 묶음");
eq(countRange(""), null, "빈 칸");

console.log("== 예상 시간 짐작 ==");
eq(minutesOf({ minutes: 30 }), { minutes: 30, guessed: false }, "적으신 것이 이긴다");
eq(minutesOf({ question_count: 25 }), { minutes: 25, guessed: true }, "문항 하나 1분");
eq(minutesOf({ word_count: 40 }), { minutes: 13, guessed: true }, "단어 셋에 1분");
// **셋을 더하지 않는다** — 같은 분량이 문항으로도 쪽으로도 적히면 두 번 세게 된다
eq(minutesOf({ question_count: 25, total_pages: 1 }), { minutes: 25, guessed: true }, "제일 큰 것 하나만");
eq(minutesOf({}), { minutes: null, guessed: false }, "아무것도 없으면 안 지어낸다");

console.log("== 분량 한 줄 ==");
// 중2 워크북 Unit 02 — 한 쪽인데 25문항
eq(volumeText({ page_start: 3, page_end: 3, total_pages: 1, question_count: 25, question_range: "1-25" }),
   "p.3 · 1-25번 (25문항) · 약 25분", "문법 워크북");
// 어법 교재 — 네 쪽
eq(volumeText({ page_start: 14, page_end: 17, total_pages: 4 }), "p.14~17 · 약 40분", "어법 교재");
// 단어책
eq(volumeText({ page_start: 10, page_end: 13, total_pages: 4, word_count: 40 }),
   "p.10~13 · 단어 40 · 약 40분", "단어책");

console.log("== 엑셀 한 장 ==");
eq(UNIT_HEADERS.slice(-5), ["문항수","문항범위","단어수","핵심내용","예상시간"], "늘어난 다섯 열");
const aoa = [
  UNIT_HEADERS,
  ["중2 문법 워크북","2026","A 문장의 형식과 종류","","","Unit 02 1형식·2형식","","","3","3","1",
   "25","1-25","","보어 자리 형용사/부사 고르기","25"],
  // **문항범위만 적었다** — 개수는 앱이 센다 (범위가 먼저 떠오르지 개수가 아니다)
  ["중2 문법 워크북","2026","A 문장의 형식과 종류","","","Unit 02 1형식·2형식","","어휘 복습","3","3","1",
   "","16-25","","핵심 어휘 영↔한",""],
  // **총분량을 안 적었다** — 페이지에서 센다 (옛 규칙 그대로)
  ["어법끝","2025","Part 1","UNIT 01 문장 구조","","Testing Point 01","","","14","17","",
   "","","","본동사와 준동사 가려내기",""],
];
const { rows } = parseUnitAoA(aoa);
eq(rows.length, 3, "세 줄");
eq(rows[0].question_count, 25, "문항수");
eq(rows[0].summary, "보어 자리 형용사/부사 고르기", "핵심내용");
eq(rows[0].minutes, 25, "예상시간");
eq(rows[1].question_count, 10, "범위만 적으면 개수를 센다 (16-25 → 10)");
eq(rows[2].total_pages, 4, "총분량이 없으면 페이지로 (14~17 → 4)");
eq(rows[2].question_count, null, "없는 것은 지어내지 않는다");

// 옛 파일도 그대로 올라가야 한다 — 열 이름을 안 바꿨다
const old = [
  ["교재명","출판년도","대단원","중단원","소단원","단원명","문제번호","활동명","시작페이지","끝페이지","총분량"],
  ["리딩튜터 입문","2025","Part 1","Chapter 1","","Unit 1. 관계사","","설명","8","15","8"],
];
const o = parseUnitAoA(old);
eq(o.rows.length, 1, "옛 양식도 읽힌다");
eq(o.rows[0].total_pages, 8, "옛 양식 총분량");
eq(o.rows[0].question_count, null, "옛 양식에는 문항수가 없다");

if (fail) { console.log("\n❌ 단원 엑셀에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 단원 엑셀 통과");
