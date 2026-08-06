// 출제분석 검사 (lib/examAnalysis.js)
//
// 이 화면은 원장님이 **다음 시험 대비를 정하실 때** 보시는 것이다.
// 「교과서에서 60% 나왔다」 가 틀리면 한 학기 공부 방향이 틀어진다.
// 그리고 「몇 명 중 몇 명」 은 사람 수를 잘못 세면 곧바로 거짓말이 된다.
//
// 쓰는 법:  node scripts/check-analysis.mjs

import { analyze, advice } from "../lib/examAnalysis.js";

let fail = 0;
function eq(got, want, what) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) return;
  console.log(`  ✗ ${what}\n      나온 것: ${g}\n      바란 것: ${w}`);
  fail = 1;
}

// 신송중 2학년 1학기 중간 — 10문항짜리 작은 시험지로 셈을 확인한다
const QS = [
  { no: 1, area: "독해", topic: "대의파악", detail: "글의 목적", unit: "교과서 5과", source: "교과서", points: 3 },
  { no: 2, area: "독해", topic: "대의파악", detail: "글의 요지", unit: "교과서 5과", source: "교과서", points: 3 },
  { no: 3, area: "어법", topic: "어법", detail: "어법", unit: "교과서 5과", source: "교과서", points: 4 },
  { no: 4, area: "독해", topic: "빈칸추론", detail: "빈칸 추론", unit: "교과서 6과", source: "교과서", points: 3 },
  { no: 5, area: "독해", topic: "빈칸추론", detail: "빈칸 추론", unit: "교과서 6과", source: "부교재", points: 3 },
  { no: 6, area: "어휘", topic: "어휘", detail: "어휘", unit: "교과서 6과", source: "부교재", points: 3 },
  { no: 7, area: "독해", topic: "간접쓰기", detail: "문장 삽입", unit: "", source: "모의고사 변형", points: 4 },
  { no: 8, area: "독해", topic: "간접쓰기", detail: "글의 순서", unit: "", source: "모의고사 변형", points: 4 },
  { no: 9, area: "서술형", topic: "서술형", detail: "영작", unit: "교과서 5과", source: "교과서", points: 5 },
  { no: 10, area: "독해", topic: "장문독해", detail: "장문 제목", unit: "", source: "외부지문", points: 8 },
];
// 배점 합 = 3+3+4+3+3+3+4+4+5+8 = 40

const STUDENTS = [
  { id: "s1", name: "김서은" }, { id: "s2", name: "공시연" },
  { id: "s3", name: "왕희연" }, { id: "s4", name: "박윤찬" },
];
const SCORES = STUDENTS.map((s, i) => ({ id: `sc${i + 1}`, student_id: s.id, kind: "school" }));

// 오답 — 3번(어법)은 넷 다 틀렸고, 5과 문항에 몰려 있다
const ITEMS = [
  { score_id: "sc1", no: 3, wrong: true }, { score_id: "sc2", no: 3, wrong: true },
  { score_id: "sc3", no: 3, wrong: true }, { score_id: "sc4", no: 3, wrong: true },
  { score_id: "sc1", no: 1, wrong: true }, { score_id: "sc2", no: 1, wrong: true },
  { score_id: "sc1", no: 9, wrong: true },
  { score_id: "sc4", no: 10, wrong: true },
];

const a = analyze(QS, SCORES, ITEMS, STUDENTS);

console.log("== 바탕 ==");
eq(a.n, 4, "응시 4명");
eq(a.questionCount, 10, "10문항");
eq(a.totalPoints, 40, "배점 합 40");
eq(a.hasSpec, true, "문항표 있음");
eq(a.hasSource, true, "출처 적힘");
eq(a.hasUnit, true, "단원 적힘");

console.log("== 출처별 — 배점으로 센다 ==");
// **배점이 다 적혀 있으면 배점으로.** 3점짜리 객관식 둘과 8점짜리 장문은
// 시험에서 차지하는 무게가 다르다
const src = Object.fromEntries(a.bySource.map((s) => [s.key, s]));
eq(src["교과서"].count, 5, "교과서 5문항 (1·2·3·4·9)");
eq(src["교과서"].points, 18, "교과서 18점 (3+3+4+3+5)");
eq(src["교과서"].pct, 45, "교과서 45% (18/40)");
eq(src["교과서"].byPoints, true, "배점으로 셌다고 표시");
eq(src["외부지문"].count, 1, "외부지문 1문항");
eq(src["외부지문"].pct, 20, "외부지문 20% — 한 문항인데 8점이라 무겁다");
// 외부지문은 **한 문항인데 20%** 다. 문항 수로 세면 10% — 절반으로 보인다.
// **문항 수로만 보면 이 학교를 잘못 읽는다** (한 문항 놓치면 8점이 날아간다)
eq(a.bySource[0].key, "교과서", "많은 차례로");

console.log("== 배점을 안 적으면 문항 수로 ==");
const noPts = analyze(
  QS.map(({ points, ...q }) => q), SCORES, ITEMS, STUDENTS
);
const src2 = Object.fromEntries(noPts.bySource.map((s) => [s.key, s]));
eq(src2["교과서"].pct, 50, "배점이 없으면 문항 수로 (5/10)");
eq(src2["교과서"].byPoints, false, "배점으로 안 셌다고 표시");

console.log("== 문항별 ==");
const at = new Map(a.rows.map((r) => [r.no, r]));
eq(at.get(3).wrong, 4, "3번은 넷 다 틀림");
eq(at.get(3).rate, 0, "3번 정답률 0%");
eq(at.get(3).who.sort(), ["공시연", "김서은", "박윤찬", "왕희연"], "누가 틀렸나");
eq(at.get(2).wrong, 0, "2번은 아무도 안 틀림");
eq(at.get(2).rate, 100, "2번 정답률 100%");

console.log("== 다 같이 틀린 문항 ==");
// 절반 넘게 틀렸으면 아이 문제가 아니다
eq(a.shared.map((r) => r.no), [3, 1], "3번(4명) · 1번(2명)");

console.log("== 몰려 틀린 단원 ==");
const w = Object.fromEntries(a.weakUnits.map((x) => [x.unit, x]));
// 5과는 문항 셋(1·2·3·9 중 1,2,3,9 → 넷) × 4명 = 16번 풀었고 7번 틀렸다
eq(w["교과서 5과"].questions, 4, "5과 4문항");
eq(w["교과서 5과"].wrongTotal, 7, "5과에서 7번 틀림 (3번×4 + 1번×2 + 9번×1)");
eq(w["교과서 5과"].wrongPct, 43.8, "5과 43.8% (7/16)");
eq(w["교과서 5과"].touched, 3, "5과에서 한 명이라도 틀린 문항 3개");
eq(a.weakUnits[0].unit, "교과서 5과", "제일 많이 틀린 단원");

console.log("== 사람이 적으면 아무 말도 안 한다 ==");
// **둘 가지고 「이 단원이 약합니다」 라고 하면 그다음부터 안 믿게 된다**
const few = analyze(QS, SCORES.slice(0, 2), ITEMS, STUDENTS.slice(0, 2));
eq(few.n, 2, "둘이 봤다");
eq(few.weakUnits, [], "몰려 틀린 단원을 안 센다");
eq(few.shared, [], "다 같이 틀린 문항도 안 센다");
eq(few.bySource.length > 0, true, "출제 구성은 그대로 보인다 (사람 수와 상관없다)");

console.log("== 문항표가 없어도 돈다 ==");
// 오답만 있고 문항표가 없는 시험 — 그래도 몇 번을 몇 명이 틀렸는지는 나와야 한다
const noSpec = analyze([], SCORES, ITEMS, STUDENTS);
eq(noSpec.hasSpec, false, "문항표 없음");
eq(noSpec.n, 4, "사람 수는 센다");
eq(noSpec.rows, [], "문항표가 없으면 문항 줄이 없다");

console.log("== 다음 대비 문장 ==");
const notes = advice(a, "신송중 1학기 중간");
eq(notes.some((n) => n.head === "출제 구성"), true, "출제 구성 문장");
eq(notes.find((n) => n.head === "출제 구성").body.includes("교과서에서 45%"), true, "비율을 그대로 말한다");
eq(notes.some((n) => n.head === "다 같이 틀린 곳"), true, "다 같이 틀린 곳");
eq(notes.some((n) => n.head === "다시 볼 단원"), true, "다시 볼 단원");

const fewNotes = advice(few, "신송중 1학기 중간");
eq(fewNotes.some((n) => n.body.includes("2명이라 아직 견줄 수 없습니다")), true, "사람이 적으면 그렇게 말한다");
eq(fewNotes.some((n) => n.head === "다시 볼 단원"), false, "없는 얘기를 지어내지 않는다");

const none = advice(analyze(QS, [], [], []), "신송중 1학기 중간");
eq(none.some((n) => n.body.includes("아직 이 시험 성적이 없습니다")), true, "성적이 없으면 그렇게 말한다");

if (fail) {
  console.log("\n❌ 출제분석에 어긋난 것이 있습니다.");
  process.exit(1);
}
console.log("\n✅ 출제분석 통과");
