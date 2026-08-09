import { readFileSync } from "node:fs";
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
  groupExams, mockMess, isSuneung, EXAM_SORT_DEFAULT,
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


console.log("\n== 시험 묶음으로 늘어세우나 ==");
/**
 * 원장님 (2026-08-09) — 「앞으로 학교시험 페이지는 시험 기준으로 재정렬해줘.
 * 1학기 기말 - 학교별 날짜순 나열, 2학기 중간 - 학교별 날짜순 나열 이렇게」
 *
 * 날짜순으로만 늘어놓으면 신정중 기말과 박문중 중간이 뒤섞인다. 원장님이
 * 챙기시는 단위는 「이번 기말」 이고, 그 안에서 어느 학교가 먼저인지를 보신다.
 */
const many = [
  { id: 1, school: "신정중", name: "1학기 기말고사", from_date: "2026-07-08" },
  { id: 2, school: "박문중", name: "1학기 기말고사", from_date: "2026-07-06" },
  { id: 3, school: "해송고", name: "2학기 중간고사", from_date: "2026-10-13" },
  { id: 4, school: "전국", name: "2026년 10월 고1 모의고사", from_date: "2026-10-20" },
  { id: 5, school: "신정중", name: "2학기 중간고사", from_date: "2026-10-14" },
  { id: 6, school: "박문중", name: "1학기 중간고사", from_date: "2026-04-28" },
];
const g = groupExams(many);
eq(g.map((x) => x.label), ["26년 1학기 중간", "26년 1학기 기말", "26년 2학기 중간", "모의고사"],
   "묶음이 학기·회차 차례로 선다");
eq(g[1].rows.map((r) => r.school), ["박문중", "신정중"], "묶음 안에서는 날짜순 (7/6 → 7/8)");
// **모의고사는 늘 맨 뒤** — 대비하는 시험이 아니라 챙길 것이 없다
eq(g.at(-1).label, "모의고사", "모의고사는 맨 뒤");
eq(EXAM_SORT_DEFAULT.key, "term", "기본이 묶음 차례다");
const sb = readFileSync("app/schedule/ScheduleBoard.jsx", "utf8");
eq(/eSort\.key === "term" && groupExams\(/.test(sb), true, "묶음 차례일 때만 머리를 붙인다");
// **줄은 한 벌이어야 한다** — 묶어 볼 때와 죽 볼 때가 다르면 언젠가 어긋난다
eq((sb.match(/<ExamRow key=\{e\.id\} e=\{e\}/g) || []).length, 2,
   "묶어 볼 때와 죽 볼 때가 같은 줄을 쓴다");
// 머리에 「26년 2학기 중간」 이라 적어놓고 줄마다 또 붙이면 같은 말이 세 번 나온다
eq(/<ExamRow key=\{e\.id\} e=\{e\} inGroup \/>/.test(sb), true, "묶음 안에서는 학기 표를 또 안 붙인다");
// 「일정만」 태그는 뗐다 (2026-08-09)
eq(/tag-lav">일정만</.test(sb), false, "「일정만」 태그가 남아 있지 않다");


console.log("\n== 치울 모의고사가 있다고 알려주나 ==");
/**
 * 원장님 (2026-08-09) — 「9월 10월 둘 다 전국연합학력평가로 표시되어 있어.
 * 그게 아니라 고1~고3 모의고사로만 입력하기로 한 거야」
 *
 * **안 세면 단추가 안 나온다.** 전에는 「학교마다 한 줄씩 있는 모의고사」 만
 * 셌는데, 원장님 화면에 남아 있던 것은 이미 「전국」 이면서 학년만 없는 옛
 * 줄이었다 — 안내가 안 뜨니 치울 단추도 없었다. 화면에서 직접 겪었다.
 */
const OLD = [
  { id: "a", school: "전국", grade: "고1", name: "2026년 10월 고1 모의고사", from_date: "2026-10-20" },
  { id: "b", school: "전국", grade: "고2", name: "2026년 10월 고2 모의고사", from_date: "2026-10-20" },
  { id: "c", school: "전국", grade: "", name: "전국연합학력평가", from_date: "2026-10-20" },
];
eq(mockMess(OLD), { perSchool: 0, stale: 1, any: true }, "전국인데 학년만 없는 옛 줄을 센다");
// **같은 날에 학년 회차가 없으면 그 줄이 유일한 기록이다** — 치우면 안 된다
eq(mockMess([{ id: "c", school: "전국", grade: "", name: "전국연합학력평가", from_date: "2026-11-20" }]),
   { perSchool: 0, stale: 0, any: false }, "혼자 있는 옛 줄은 치울 것이 아니다");
eq(mockMess([{ id: "d", school: "박문중", grade: "고1", name: "3월 모의고사", from_date: "2026-03-04" }]),
   { perSchool: 1, stale: 0, any: true }, "학교마다 한 줄씩인 것도 그대로 센다");
eq(mockMess(EXAMS.filter((e) => e.id !== "3")).any, false, "합칠 것이 없으면 안내를 안 띄운다");
eq(/mockMess\(exams\)\.any &&/.test(sb), true, "화면이 mockMess 로 안내를 띄운다");


console.log("\n== 수능은 모의고사가 아니다 ==");
/**
 * 원장님 (2026-08-09) — 「수능이 내신 시험으로 잡혀 있으면 안 되는 거잖아.
 * 수능 모의고사인데, 수능은 그냥 대수능!!」
 *
 * 셋이 다 다르다 — 내신은 범위가 있고, 모의고사는 성적만 붙고, 대수능은
 * 한 해에 하루다. 모의고사 묶음에 대수능이 섞이면 「11월 모의고사」 처럼
 * 읽힌다.
 */
[
  ["대학수학능력시험", true],
  ["2026학년도 수능", true],
  ["수능", true],
  // 「모의」 가 붙으면 평가원 모의고사다 — 대수능이 아니다
  ["수능 모의평가", false],
  ["6월 모의평가", false],
  ["전국연합학력평가", false],
  ["2학기 기말고사", false],
].forEach(([name, want]) => eq(isSuneung({ name }), want, `「${name}」`));
// 대수능도 범위를 안 담는다 (내신이 아니다)
eq(needsScope({ name: "대학수학능력시험" }), false, "대수능은 범위를 안 담는다");
{
  const g = groupExams([
    { id: 1, school: "신정중", name: "2학기 기말고사", from_date: "2026-12-14" },
    { id: 2, school: "전국", name: "2026년 11월 고3 모의고사", from_date: "2026-11-19" },
    { id: 3, school: "전국", name: "대학수학능력시험", from_date: "2026-11-19" },
  ]);
  eq(g.map((x) => x.label), ["26년 2학기 기말", "모의고사", "대수능"], "대수능이 따로 · 맨 뒤에 선다");
}

if (fail) { console.log("\n❌ 시험 목록에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 시험 목록 통과");
