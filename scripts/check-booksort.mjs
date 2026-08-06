/**
 * 교재 정렬 검사 (lib/bookSort.js)
 *
 * 원장님 (2026-08-06) — 「교재정렬이 기준이 없어 정렬기능 넣어줘」
 *
 * 정렬은 **틀려도 오류가 안 난다.** 그냥 차례가 이상할 뿐이라, 화면을 보고도
 * 「원래 이런가 보다」 하고 넘어간다. 그래서 걸리기 쉬운 셋을 못 박아 둔다 —
 *
 *   1) 학년을 글자로 견주면 **「고1」 이 「중1」 보다 앞**에 온다 (ㄱ < ㅈ)
 *   2) 빈칸을 0 으로 치면 **안 적은 교재가 맨 위**에 몰려 목록을 가린다
 *   3) 값이 같은 줄들의 차례가 **열 때마다 달라지면** 「방금 거기 있었는데」 가 된다
 *
 * 쓰는 법:  node scripts/check-booksort.mjs
 */

import { sortBooks, gradeRank, BOOK_SORTS, DEFAULT_SORT } from "../lib/bookSort.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const names = (list) => list.map((t) => t.name);

const BOOKS = [
  { id: "a", name: "워드마스터 중등실력", area: "단어",  target_grade: "중2", total_pages: 200, price: 13000, status: "active",       created_at: "2026-01-05" },
  { id: "b", name: "어법끝",             area: "문법",  target_grade: "고1", total_pages: 180, price: 16000, status: "active",       created_at: "2026-03-01" },
  { id: "c", name: "리딩튜터 입문",       area: "독해",  target_grade: "중1", total_pages: null, price: null,  status: "active",       created_at: "2026-02-01" },
  { id: "d", name: "Grammar Build Up",   area: "문법",  target_grade: "중2", total_pages: 120, price: 12000, status: "paused",       created_at: "2026-04-01" },
  { id: "e", name: "능률 보카",          area: "단어",  target_grade: "",   total_pages: 90,  price: 11000, status: "discontinued", created_at: "2026-05-01" },
];
const UNITS = { a: 40, b: 12, c: 0, d: 8, e: 25 };

console.log("== 학년은 글자가 아니라 차례다 ==");
// 글자로 견주면 「고1」 < 「중1」 이 된다 (ㄱ < ㅈ). 실제 학년 차례로 세어야 한다
eq(gradeRank("중1") < gradeRank("고1"), true, "중1 이 고1 보다 앞");
eq(gradeRank("중2") < gradeRank("중3"), true, "중2 가 중3 보다 앞");
eq(gradeRank("초6") < gradeRank("중1"), true, "초6 이 중1 보다 앞");
eq(gradeRank("중1~중3"), gradeRank("중1"), "범위는 시작 학년으로 본다");
eq(gradeRank(""), Infinity, "안 적은 것은 맨 뒤");

console.log("\n== 기본은 영역 › 이름 ==");
eq(names(sortBooks(BOOKS, DEFAULT_SORT, UNITS)),
   ["리딩튜터 입문", "Grammar Build Up", "어법끝", "능률 보카", "워드마스터 중등실력"],
   "독해 → 문법 → 단어, 영역 안에서는 이름순");

console.log("\n== 빈칸은 뒤집어도 맨 뒤 ==");
// 「페이지 많은 순」 을 눌렀는데 안 적은 교재가 맨 위면 정렬을 누른 보람이 없다
const pagesDesc = sortBooks(BOOKS, { key: "total_pages", dir: "desc" }, UNITS);
eq(names(pagesDesc).at(-1), "리딩튜터 입문", "페이지 많은 순 — 안 적은 것이 맨 뒤");
eq(names(pagesDesc)[0], "워드마스터 중등실력", "200쪽이 맨 앞");
const pagesAsc = sortBooks(BOOKS, { key: "total_pages", dir: "asc" }, UNITS);
eq(names(pagesAsc).at(-1), "리딩튜터 입문", "적은 순으로 뒤집어도 안 적은 것은 그대로 맨 뒤");
eq(names(pagesAsc)[0], "능률 보카", "90쪽이 맨 앞");
// 0원짜리와 안 적은 것은 다른 이야기다
eq(names(sortBooks(BOOKS, { key: "price", dir: "asc" }, UNITS)).at(-1), "리딩튜터 입문",
   "교재비도 안 적은 것이 맨 뒤");
eq(names(sortBooks(BOOKS, { key: "target_grade", dir: "asc" }, UNITS)).at(-1), "능률 보카",
   "레벨도 안 적은 것이 맨 뒤");

console.log("\n== 이름은 엑셀과 같은 차례로 (숫자 → 영문 → 한글) ==");
// localeCompare(_, "ko") 만 쓰면 한글이 영문 앞에 온다. 원장님은 늘 엑셀과
// 견주시므로 **원장님이 아는 차례**여야 한다
eq(names(sortBooks([
  { id: "1", name: "어법끝", area: "문법" },
  { id: "2", name: "Grammar Build Up", area: "문법" },
  { id: "3", name: "1316 팬클럽", area: "문법" },
  { id: "4", name: "Word Master", area: "문법" },
], { key: "name", dir: "asc" }, {})),
   ["1316 팬클럽", "Grammar Build Up", "Word Master", "어법끝"],
   "숫자 → 영문 → 한글");

console.log("\n== 그 밖의 기준 ==");
eq(names(sortBooks(BOOKS, { key: "units", dir: "asc" }, UNITS))[0], "리딩튜터 입문",
   "단원 수 — 안 채운 교재가 위로");
eq(names(sortBooks(BOOKS, { key: "status", dir: "asc" }, UNITS)).at(-1), "능률 보카",
   "상태 — 사용중 → 중단 → 절판");
eq(names(sortBooks(BOOKS, { key: "created_at", dir: "desc" }, UNITS))[0], "능률 보카",
   "넣은 순서(예전 차례)도 남아 있다");

console.log("\n== 값이 같으면 늘 이름으로 갈라준다 ==");
// 안 그러면 차례가 열 때마다 달라져서 「방금 거기 있었는데」 가 생긴다
const same = [
  { id: "1", name: "나 교재", area: "문법", total_pages: 100 },
  { id: "2", name: "가 교재", area: "문법", total_pages: 100 },
  { id: "3", name: "다 교재", area: "문법", total_pages: 100 },
];
eq(names(sortBooks(same, { key: "total_pages", dir: "asc" }, {})),
   ["가 교재", "나 교재", "다 교재"], "페이지가 같으면 이름순");
eq(names(sortBooks([...same].reverse(), { key: "total_pages", dir: "asc" }, {})),
   ["가 교재", "나 교재", "다 교재"], "넣은 차례가 달라도 같은 답");

console.log("\n== 원래 배열을 건드리지 않는다 ==");
const before = names(BOOKS);
sortBooks(BOOKS, { key: "name", dir: "desc" }, UNITS);
eq(names(BOOKS), before, "sortBooks 가 준 배열을 바꾸지 않는다");

console.log("\n== 고르는 칸에 있는 기준은 다 돌아간다 ==");
BOOK_SORTS.forEach((s) => {
  const got = sortBooks(BOOKS, { key: s.key, dir: "asc" }, UNITS);
  if (got.length !== BOOKS.length) { console.log(`  ✗ ${s.label} 에서 줄이 사라진다`); fail = 1; }
});

if (fail) { console.log("\n❌ 교재 정렬에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 교재 정렬 통과");
