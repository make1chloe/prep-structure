// 성적 옮기기 · 리포트 계산 검사
//
// 노션 두 표를 옮기는 것은 **한 번뿐이라 더 위험하다.** 그리고 리포트는
// 원장님이 상담 중에 펴놓고 학부모께 설명하시는 화면이라, 숫자가 틀리면
// 그 자리에서 곤란해지신다. 그래서 실제 자료에서 부딪힌 것을 못 박아 둔다.
//
// 쓰는 법:  node scripts/check-report.mjs

import { parseUnitAoA, parseWrongAoA, pointOf, nameFromTitle, toDate } from "../lib/importExam.js";
import { MOCK_SPEC, byTopic, byArea, parseWrongNos, specFor, byReason } from "../lib/examSpec.js";
import { oneRound, stack, trendOf, points } from "../lib/report.js";

let fail = 0;
function eq(got, want, what) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) return;
  console.log(`  ✗ ${what}\n      나온 것: ${g}\n      바란 것: ${w}`);
  fail = 1;
}

console.log("== 표준 문항표 ==");
// 원장님 엑셀의 정답DB 를 옮긴 것이다. 여기가 어긋나면 모든 리포트가 어긋난다
eq(MOCK_SPEC.length, 45, "45문항");
eq(MOCK_SPEC.filter((q) => q.area === "듣기").length, 17, "듣기 17문항");
eq(MOCK_SPEC.filter((q) => q.area === "독해").length, 28, "독해 28문항");
eq(MOCK_SPEC[0].detail, "말의 목적", "1번은 말의 목적");
eq(MOCK_SPEC[17].detail, "글의 목적", "18번은 글의 목적");
eq(MOCK_SPEC[28].topic, "어법", "29번은 어법");
eq(MOCK_SPEC[29].topic, "어휘", "30번은 어휘");
eq(MOCK_SPEC[44].detail, "장문 내용 불일치", "45번은 장문 내용 불일치");
eq(
  ["빈칸추론", "간접쓰기", "장문독해"].map((t) => MOCK_SPEC.filter((q) => q.topic === t).length),
  [4, 6, 5],
  "빈칸추론 4 · 간접쓰기 6 · 장문독해 5"
);

console.log("== 문항표는 고칠 수 있어야 한다 ==");
// 원장님 — 「기본값을 세팅하되, 수정 가능하게 해줘」
const base = [{ kind: "mock", no: 18, area: "독해", topic: "대의파악", detail: "심경 변화" }];
eq(specFor("mock", [], 0, []).from, "standard", "아무것도 없으면 표준표");
eq(specFor("mock", [], 0, base).from, "base", "학원 기본 문항표가 있으면 그것");
eq(specFor("mock", [{ no: 1, topic: "듣기" }], 0, base).from, "exam", "그 회차 문항표가 제일 세다");
eq(specFor("mock", [], 0, base)[0].detail, "심경 변화", "기본 문항표가 표준표를 덮는다");
eq(specFor("unit", [], 0, []).length, 0, "단원평가는 문항표가 없다");

console.log("== 틀린 번호 읽기 ==");
// 노션에 세 가지 모양으로 적혀 있었다
eq(parseWrongNos("14,21,24,32"), [14, 21, 24, 32], "쉼표");
eq(parseWrongNos("21 22 23 30"), [21, 22, 23, 30], "빈칸");
eq(parseWrongNos("1,3,8,18,20 번"), [1, 3, 8, 18, 20], "「번」 꼬리");
eq(parseWrongNos("12, 14, 21, 29번"), [12, 14, 21, 29], "쉼표 + 「번」");
eq(parseWrongNos(""), [], "빈 칸");

console.log("== 점수 읽기 ==");
eq(pointOf("67점 (-10/30문제)"), 67, "「67점 (-10/30문제)」");
eq(pointOf("100점 (-0/25문제)"), 100, "만점");
// 「100-2-20-15=63」 이라고 적어 놓으신 줄이 있다 — 앞의 100 을 쓰면 안 된다
eq(pointOf("100-2-20-15=63 "), 63, "계산식은 = 뒤엣것");
eq(pointOf(""), null, "빈 칸");

console.log("== 이름 건지기 ==");
eq(nameFromTitle("김서은-26/03/24"), "김서은", "오답분석 제목");
eq(nameFromTitle("07/30/수 양정호 통과"), "양정호", "단원평가 제목");
eq(nameFromTitle("01/15/목  통과"), "", "이름이 빠진 제목은 비운다");
eq(toDate("2025년 6월 3일 오전 11:23"), "2025-06-03", "생성 일시");

console.log("== 영역별 세기 ==");
const nos = [14, 21, 24, 32, 33, 34, 37, 38, 42];   // 김서은 26/03/24 실제 자료
const a = byArea(MOCK_SPEC, nos);
eq([a.listen.right, a.listen.total], [16, 17], "듣기 16/17");
eq([a.read.right, a.read.total], [20, 28], "독해 20/28");
const t = byTopic(MOCK_SPEC, nos);
eq(t.find((x) => x.topic === "빈칸추론").wrong, 3, "빈칸추론 3개 틀림");
eq(t.find((x) => x.topic === "어법").wrong, 0, "어법은 안 틀림");
eq(t[0].topic, "듣기", "영역 차례는 늘 같다 (듣기부터)");

console.log("== 한 장 통째로 — 단원평가 ==");
const uH = ["제목", "3재원생DB", "날짜", "단원명", "상태", "생성 일시", "전체문항수", "점수", "틀린문제수"];
const uRows = [
  uH,
  ["07/30/수 양정호 통과", "양정호 (https://app.notion.com/p/abc?pvs=21)", "2025/07/28",
   "전치사", "통과", "2025년 6월 11일 오후 3:21", "25", "84점 (-4/25문제)", "4"],
  // **날짜 칸이 빈 줄** — 적어둔 날로 대신한다. 버리면 기록에 구멍이 난다
  ["", "", "", "명사", "재시험", "2025년 6월 3일 오전 11:23", "30", "67점 (-10/30문제)", "10"],
  // **틀린 개수가 12.5** (부분점수) — 반올림하면 점수와 안 맞는다
  ["08/12/화 공시연 통과", "공시연 (https://app.notion.com/p/x?pvs=21)", "2025/08/12",
   "해송고 기출", "통과", "2025년 8월 12일 오후 7:41", "33", "62점 (-12.5/33문제)", "12.5"],
];
const U = parseUnitAoA(uRows);
eq(U.rows.length, 3, "세 줄 다 나온다");
eq(U.rows[0].name, "양정호", "관계 칸에서 이름");
eq(U.rows[0].point, 84, "점수");
eq(U.rows[0].passed, true, "통과");
eq(U.rows[1].date, "2025-06-03", "날짜가 없으면 생성 일시로");
eq(U.rows[1].skipWhy, "학생을 못 찾았어요", "학생을 모르면 그 까닭을 적어준다");
eq(U.rows[2].wrongCount, 12.5, "부분점수는 그대로");

console.log("== 한 장 통째로 — 모의고사 오답 ==");
const wH = [
  "제목", "시험제목", "시험본 날짜", "학년", "틀린 문제 번호", "실제총점수", "제출한 점수",
  "이름", "이번 시험에서 내가 잘한 점", "기타 선생님에게 하고 싶은 말",
  "14번 틀린 이유", "21번 틀린 이유", "23번 틀린 이유", "22번 틀린 이유", "30번 틀린 이유",
];
const wRows = [
  wH,
  // 그냥 맞는 줄
  ["김서은-26/03/24", "26년 3월 고1 모의고사", "2026년 3월 24일", "고1", "14,21", "75", "75",
   "김서은", "모르는 단어가 줄었어요", "", "발음이 들리지 않았어요", "해석을 못했어요", "", "", ""],
  // **번호 칸이 통째로 빈 줄** — 이유가 적힌 번호를 쓴다 (김서은 25/11/04)
  ["김서은-25/11/04", "", "2025년 11월 4일", "중3", "", "68", "",
   "김서은", "", "", "", "", "", "", "단어를 몰랐어요, 해석을 못했어요"],
  // **번호와 이유가 한 칸 어긋난 줄** (공시연 26/03/24 — 23 ↔ 22).
  // 노션이 세어둔 개수와 견주니 **번호 칸 쪽이 맞았다** → 번호를 쓴다
  ["공시연-26/03/24", "26년 3월 고1 모의고사", "2026년 3월 24일", "고1", "14,21,23", "71", "70",
   "공시연", "", "", "실수했어요", "해석을 못했어요", "", "단어를 몰랐어요", ""],
];
const W = parseWrongAoA(wRows);
eq(W.rows.length, 3, "세 줄");
eq(W.rows[0].nos, [14, 21], "적으신 번호 그대로");
eq(W.rows[0].items[0].reason, "발음이 들리지 않았어요", "14번의 이유");
eq(W.rows[0].self.includes("모르는 단어가 줄었어요"), true, "아이가 적은 것을 남긴다");
eq(W.rows[0].mismatch, false, "점수가 같으면 표시 안 함");

eq(W.rows[1].nos, [30], "번호 칸이 비면 이유가 적힌 번호를 쓴다");
eq(W.rows[1].fromReasons, true, "그렇게 찾았다고 표시한다");
eq(W.rows[1].term, "25년 11월 모의고사", "시험명이 없으면 날짜로 만든다");

// **여기가 제일 중요하다.** 합집합으로 하면 오답이 하나 늘어난다
eq(W.rows[2].nos, [14, 21, 23], "어긋나면 **번호 칸이 이긴다** (22를 넣지 않는다)");
eq(W.rows[2].orphan, [22], "이유만 있는 번호는 버리지 말고 알려준다");
eq(W.rows[2].noReason, [23], "번호만 있고 이유가 없는 것도 알려준다");
eq(W.rows[2].point, 71, "성적에는 **실제** 점수를 쓴다");
eq(W.rows[2].said, 70, "아이가 적어 낸 점수도 남긴다");
eq(W.rows[2].mismatch, true, "어긋났다고 표시한다");

console.log("== 왜 틀렸나 세기 ==");
// 노션은 한 문항에 이유를 여럿 적을 수 있었다
const rs = byReason([
  { wrong: true, reason: "단어를 몰랐어요, 해석을 못했어요" },
  { wrong: true, reason: "해석을 못했어요" },
  { wrong: false, reason: "실수했어요" },
]);
eq(rs[0], { reason: "해석을 못했어요", n: 2 }, "많은 것부터");
eq(rs.length, 2, "안 틀린 문항은 안 센다");

console.log("== 리포트 계산 ==");
const mk = (term, day, point, wrongs) =>
  oneRound(
    { kind: "mock", term, taken_on: day, raw_score: point, full_score: 100, grade: null },
    wrongs.map((no) => ({ no, wrong: true, reason: "해석을 못했어요" }))
  );
const rounds = [
  mk("1회", "2026-03-24", 74, [31, 32, 33, 34]),      // 빈칸추론 전멸
  mk("2회", "2026-04-28", 79, [31, 32]),
  mk("3회", "2026-06-04", 88, [31]),
];
eq(rounds[0].listen.rate, 1, "1회 듣기 만점");
eq(Math.round(rounds[0].rate * 100), 91, "1회 전체 정답률 91%");
const st = stack(rounds);
eq(st.n, 3, "3회");
eq(st.mean, 80.3, "평균");
eq(st.last, 88, "최근");
eq(st.best, 88, "최고");
eq(st.trend.label, "상승", "흐름");
// **누적은 문항을 합쳐서 센다** — 회차별 정답률을 평균 내면 안 된다
const blank = st.topics.find((x) => x.topic === "빈칸추론");
eq([blank.wrong, blank.total], [7, 12], "빈칸추론 누적 7/12 틀림 (문항을 합쳐서)");

console.log("== 흐름은 함부로 말하지 않는다 ==");
eq(trendOf([74]).key, "none", "한 번 보고 「상승」은 거짓말이다");
eq(trendOf([80, 80, 80]).label, "유지", "그대로면 유지");
eq(trendOf([90, 80, 70]).label, "하락", "내려가면 하락");

console.log("== 학습포인트 ==");
const ps = points(st, "김서은");
eq(ps.some((p) => p.head === "성적 흐름"), true, "흐름 문장");
eq(ps.some((p) => p.body.includes("김서은 학생")), true, "이름을 부른다");
// **문항이 하나뿐인 영역(어법)을 「제일 약한 영역」이라고 말하면 안 된다.**
// 45문항 중 한 문항이라 하나만 틀려도 0% 가 되어 매번 어법이 나온다
const weakSaid = ps.find((p) => p.head === "보완할 부분");
eq(weakSaid?.body.startsWith("빈칸추론"), true, "제일 약한 것은 빈칸추론");
eq(ps.some((p) => p.body.includes("어법 영역의 정답률")), false, "한 문항짜리 영역은 안 고른다");

// 회차가 하나면 없는 얘기를 안 한다
const solo = points(stack([mk("1회", "2026-03-24", 74, [31])]), "박서현");
eq(solo.some((p) => p.head === "성적 흐름"), false, "한 회차에는 흐름 문장이 없다");

if (fail) {
  console.log("\n❌ 성적 옮기기·리포트에 어긋난 것이 있습니다.");
  process.exit(1);
}
console.log("\n✅ 성적 옮기기·리포트 통과");
