/**
 * 시험 목록 정돈 (lib/examList.js)
 *
 * 원장님 (2026-08-06)
 *   「시험목록 정돈이 필요해. 이름별 정렬, 학교별 필터 등」
 *   「시험 연도 학기 구별이 안 되고, 전국연합학력평가는 대비하는 시험이
 *    아니라서 일정만 확인하면 되고 시험범위자료는 필요없어」
 *
 * **전국연합을 잘못 가리면 두 가지가 동시에 망가진다** —
 * 내신을 모의고사로 보면 그 시험의 범위를 못 담게 되고(대비를 못 한다),
 * 모의고사를 내신으로 보면 「범위 미등록」 재촉이 영영 꺼지지 않는다.
 * 그래서 이름 모양들을 실제로 나올 법한 대로 못 박아 둔다.
 *
 * 쓰는 법:  node scripts/check-examlist.mjs
 */

import { commonName } from "../lib/neis.js";
import {
  isMockExam, needsScope, termOf, termLabel, sortExams, filterExams, facetsOf,
} from "../lib/examList.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

console.log("== 전국연합인가 (범위를 안 물어볼 시험인가) ==");
[
  ["2026년 3월 전국연합학력평가", true],
  ["전국연합 학력평가", true],
  ["9월 모의고사", true],
  ["6월 모평", true],
  ["학력평가", true],
  ["2학기 중간고사", false],
  ["1학기 기말고사", false],
  ["중간", false],
  ["", false],
].forEach(([name, want]) => eq(isMockExam({ name }), want, `「${name}」`));
// 나이스가 준 이름이 따로 있을 수도 있다
eq(isMockExam({ name: "", neis_name: "전국연합학력평가" }), true, "나이스 이름으로도 알아본다");
eq(needsScope({ name: "2학기 중간고사" }), true, "내신은 범위를 담는다");
eq(needsScope({ name: "9월 모의고사" }), false, "모의고사는 범위를 안 담는다");

console.log("\n== 몇 년 몇 학기인가 ==");
// 작년 2학기와 올해 2학기가 같은 얼굴이었다 — 연도는 날짜에서 온다
eq(termLabel({ name: "2학기 중간고사", from_date: "2026-10-14" }), "26년 2학기 중간", "이름에 학기가 있을 때");
eq(termLabel({ name: "2학기 중간고사", from_date: "2025-10-14" }), "25년 2학기 중간", "연도가 다르면 다르게");
// 이름에 학기가 없으면 달로 가른다 (3~7월 1학기 · 나머지 2학기)
eq(termOf({ name: "중간고사", from_date: "2026-04-28" }).half, 1, "4월은 1학기");
eq(termOf({ name: "중간고사", from_date: "2026-10-14" }).half, 2, "10월은 2학기");
eq(termOf({ name: "기말", from_date: "2027-01-05" }).half, 2, "1월은 앞 학년도 2학기");
// 이름이 이긴다 — 학교가 이상한 달에 보더라도 적힌 대로
eq(termOf({ name: "1학기 기말고사", from_date: "2026-08-03" }).half, 1, "이름에 적힌 학기가 이긴다");
eq(termLabel({ from_date: "" }), "", "날짜도 이름도 없으면 안 지어낸다");

const EXAMS = [
  { id: "1", school: "연송중", grade: "중3", name: "2학기 중간고사", from_date: "2026-10-14", to_date: "2026-10-17" },
  { id: "2", school: "신송중", grade: "중2", name: "2학기 중간고사", from_date: "2026-09-14", to_date: "2026-09-17" },
  { id: "3", school: "박문여고", grade: "고1", name: "전국연합학력평가", from_date: "2026-09-02", to_date: "2026-09-02" },
  { id: "4", school: "신송중", grade: "중3", name: "1학기 기말고사", from_date: "2026-07-01", to_date: "2026-07-03" },
];
const ids = (l) => l.map((e) => e.id);

console.log("\n== 차례 ==");
eq(ids(sortExams(EXAMS, { key: "date", dir: "asc" })), ["4", "3", "2", "1"], "날짜순");
eq(ids(sortExams(EXAMS, { key: "date", dir: "desc" })), ["1", "2", "3", "4"], "뒤집기");
// 학교 안에서는 학년 차례로 (중2 가 중3 보다 앞)
eq(ids(sortExams(EXAMS, { key: "school", dir: "asc" })), ["3", "2", "4", "1"], "학교 › 학년");
eq(ids(sortExams(EXAMS, { key: "name", dir: "asc" })), ["4", "2", "1", "3"], "이름순");
// 원래 배열을 건드리지 않는다
const before = ids(EXAMS);
sortExams(EXAMS, { key: "name", dir: "desc" });
eq(ids(EXAMS), before, "준 배열을 바꾸지 않는다");

console.log("\n== 거르기 ==");
eq(ids(filterExams(EXAMS, { school: "신송중" })), ["2", "4"], "학교로");
eq(ids(filterExams(EXAMS, { kind: "school" })), ["1", "2", "4"], "내신만");
eq(ids(filterExams(EXAMS, { kind: "mock" })), ["3"], "전국연합만");
eq(ids(filterExams(EXAMS, { q: "기말" })), ["4"], "검색어");
eq(ids(filterExams(EXAMS, { q: "고1" })), ["3"], "학년으로도 찾힌다");
eq(ids(filterExams(EXAMS, {})), ["1", "2", "3", "4"], "아무것도 안 고르면 다");

console.log("\n== 거르기 칸을 채울 것 ==");
const f = facetsOf(EXAMS);
eq(f.schools, ["박문여고", "신송중", "연송중"], "학교 (가나다순)");
eq(f.years, [2026], "연도 (최근부터)");

console.log("\n== 전국연합 = 모의평가 = 모의고사 ==");
/**
 * 원장님 (2026-08-07) — 「전국연합학력평가 = 모의평가 = 모의고사」
 *
 * 교육청이 내는 것을 「전국연합학력평가」, 평가원이 내는 6·9월 것을
 * 「모의평가」 라고 학교가 나눠 적을 뿐, 원장님과 학부모에게는 다 모의고사다.
 * 따로 두면 **같은 날 같은 시험이 두 이름으로** 달력에 앉는다 —
 * 열쇠(source_id)에 이름이 들어가기 때문이다.
 */
[
  "전국연합학력평가",
  "3월 전국연합학력평가",
  "고1·2 전국연합학력평가 실시",
  "전국연합 학력평가",
  "전국연합학력평가(1,2학년)",
  "모의평가",
  "6월 모의평가",
  "모의고사",
].forEach((t) => eq(commonName(t), "모의고사", `「${t}」`));

// **수능만 따로 둔다.** 그건 정말 다른 날이다
eq(commonName("대학수학능력시험"), "대학수학능력시험", "수능은 따로");
eq(commonName("수능 예비소집"), "대학수학능력시험", "수능 관련도 수능으로");
// 아는 것이 아니면 손대지 않는다 — 함부로 바꾸면 멀쩡한 일정이 뭉개진다
eq(commonName("개학식"), "개학식", "모르는 것은 그대로");
eq(commonName(""), "", "빈 값");

if (fail) { console.log("\n❌ 시험 목록에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 시험 목록 통과");
