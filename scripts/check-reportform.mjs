/**
 * **데일리리포트와 숙제 안내 — 같은 말을 두 번 하지 않는다**
 *
 * 원장님 (2026-08-07) — 「데일리리포트와 숙제문자 양식이 필요해.
 * 중복정보는 가급적 제거하고」
 *
 * 예전에는 **다음 숙제 목록이 두 글에 다 들어갔다.** 리포트에도 다섯 줄,
 * 숙제 안내에도 같은 다섯 줄. 어머니는 같은 것을 두 번 읽으시고, 그러다
 * 정작 위쪽의 「단어 12/20」 을 놓치신다.
 *
 *   데일리리포트 (어머니)  결과 — 왔나 · 몇 점 · 어디까지 · 숙제는 해왔나
 *   숙제 안내 (아이)       할 것 — 무엇을 · 어디까지 · 못 한 것은 무엇
 *
 * 쓰는 법:  node scripts/check-reportform.mjs
 */
import { buildReportText, buildHomeworkText } from "../lib/reportText.js";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};

const R = {
  student: { name: "이서연" },
  report: {
    attendance_kind: "present",
    word_correct: 19, word_total: 20,
    sent_correct: 8, sent_total: 10,
    own_progress: "분사구문 설명 정독",
    attitude: "Good",
  },
  checks: [
    { name: "분사구문 워크북", status: "done" },
    { name: "영문법 문장훈련", status: "missing" },
  ],
  next: [
    { name: "분사구문 워크북", units: ["p.44~48"] },
    { name: "단어", units: ["Day 12"] },
  ],
  progress: [],
  stay: [{ body: "오답 정리", status: "moved" }],
  notices: [],
};

const rep = buildReportText(R, "2026-07-21");
const hw = buildHomeworkText(R, "2026-07-21");

console.log("== 리포트는 결과만 ==");
eq(/단어 테스트: /.test(rep), true, "단어 점수");
eq(/진도: /.test(rep), true, "진도");
eq(/숙제: 영문법 문장훈련 미완료/.test(rep), true, "못 한 것만 적는다");
// **다 해왔으면 한 줄.** 항목마다 「완료」 를 늘어놓으면 「보충 필요」 가 묻힌다
const allDone = buildReportText({ ...R, checks: [{ name: "가", status: "done" }, { name: "나", status: "done" }] }, "2026-07-21");
eq(/숙제: 다 해왔습니다/.test(allDone), true, "다 했으면 한 줄");
eq(/가 완료/.test(allDone), false, "항목마다 「완료」 를 늘어놓지 않는다");

console.log("\n== 같은 말을 두 번 하지 않는다 ==");
// **숙제 목록은 아이 글에만.** 아이 앱에 그대로 있고 어머니 화면에도
// 「지금 나간 숙제」 칸이 따로 있다
eq(/p\.44~48/.test(rep), false, "리포트에 숙제 범위를 늘어놓지 않는다");
eq(/▶ 다음 수업 숙제/.test(rep), false, "리포트에 숙제 목록이 없다");
// 「숙제는 앱에 올려두었습니다」 도 뺐다 — 앱에서 읽고 계시는데 앱을 가리키는 말이다
eq(/앱에 올려두었습니다/.test(rep), false, "앱 안에서 앱을 가리키지 않는다");
// 문자 시절에는 누가 보냈는지 밝혀야 했다. 지금은 우리 앱 안이다
eq(/^\[클로이영어\]/.test(rep), false, "제목에 학원 이름을 안 붙인다");
eq(rep.startsWith("이서연 · 7월 21일 수업"), true, "이름과 날짜만");
eq(/p\.44~48/.test(hw), true, "숙제 범위는 아이 글에");

// 리포트가 하던 잔소리 — 숙제 줄에 이미 「미완료」 라고 적혀 있다
eq(/다음 수업에서 함께 채우겠습니다/.test(rep), false, "같은 말을 한 번 더 하지 않는다");

console.log("\n== 집중도 · 이해도 ==");
/**
 * 원장님 (2026-08-11) — 「태도를 집중도로 고치고 이해도 추가해줘.
 * 둘 다 선택하지 않으면 출력되지 않게 해줘」.
 * 집중도는 옛 attitude 칸 그대로다 — 이름만 바뀌었다.
 */
eq(/집중도: ⭐⭐⭐⭐/.test(rep), true, "attitude 칸이 집중도로 나간다");
eq(/태도: /.test(rep), false, "「태도」 라는 말은 더 안 쓴다");
{
  const both = buildReportText(
    { ...R, report: { ...R.report, understanding: "Excellent" } }, "2026-07-21");
  eq(/이해도: ⭐⭐⭐⭐⭐/.test(both), true, "이해도도 나간다");
  // **안 고른 것은 그 줄 자체가 없다** — 빈 별을 보내면 「오늘은 왜 평가가
  // 없지」 를 읽게 된다
  const none = buildReportText(
    { ...R, report: { ...R.report, attitude: "", understanding: "" } }, "2026-07-21");
  eq(/집중도|이해도/.test(none), false, "둘 다 안 고르면 아무 줄도 없다");
  const one = buildReportText(
    { ...R, report: { ...R.report, attitude: "", understanding: "Good" } }, "2026-07-21");
  eq(/집중도/.test(one), false, "안 고른 쪽만 빠진다");
  eq(/이해도: ⭐⭐⭐⭐/.test(one), true, "고른 쪽은 나간다");
}

console.log("\n== 숙제 안내는 할 것만 ==");
eq(/출결|태도|단어 테스트/.test(hw), false, "오늘 있었던 일은 리포트의 몫");
// 지난 숙제에서 남은 것과 남아서 하다 만 것은 아이에게는 같은 일이다
// **만든 사람이 설명해야 알 수 있는 이름은 틀린 이름이다** — 원장님이
// 「채워야할것은 뭐지?」 라고 물으셨다. 원장님이 못 알아보면 아이는 더 못 알아본다
eq(/▶ 밀린 것/.test(hw), true, "못 한 것은 한 자리에");
eq(/채워야 할 것/.test(hw), false, "설명이 필요한 이름은 안 쓴다");
eq(hw.startsWith("7월 21일 숙제"), true, "아이 글에는 자기 이름을 안 적는다");
eq(/영문법 문장훈련 미제출/.test(hw), true, "지난 숙제에서 남은 것");
eq(/오답 정리/.test(hw), true, "남아서 하다 만 것도 같은 자리에");
eq((hw.match(/▶/g) || []).length <= 2, true, "칸을 여럿으로 쪼개지 않는다");

console.log("\n== 결석한 날 ==");
const absent = buildReportText({ ...R, report: { attendance_kind: "absent" } }, "2026-07-21");
eq(/보강 일정은 따로 안내/.test(absent), true, "보강 이야기");
eq(/단어 테스트|태도/.test(absent), false, "수업이 없었으니 점수도 없다");
eq(/p\.44~48/.test(absent), false, "결석해도 숙제를 늘어놓지 않는다");

console.log("\n== 남아서 한 것은 무엇을 했는지 ==");
// 「1건 마치고 하원」 은 아무 말도 안 한 것과 같다. 어머니가 아시고 싶은 것은
// **왜 늦게 왔나** 이고, 그 답은 「단어 재시험」 같은 이름에 있다
const stayed = buildReportText({
  ...R,
  stay: [
    { body: "단어 재시험", status: "done" },
    { body: "오답 정리", status: "moved" },
  ],
}, "2026-07-21");
eq(/단어 재시험 \(마치고 하원\)/.test(stayed), true, "무엇을 마쳤는지");
eq(/오답 정리 \(숙제로\)/.test(stayed), true, "무엇이 넘어갔는지");
// 「오답 정리은」 처럼 은/는이 어긋나면 그 한 글자가 눈에 걸린다
eq(/정리은|시험은 숙제/.test(stayed), false, "조사가 어긋나지 않는다");
eq(/1건/.test(stayed), false, "숫자로 뭉개지 않는다");
// 넉 줄이 늘어서면 위쪽 점수가 밀린다 — 둘까지만 적고 나머지는 센다
const many = buildReportText({
  ...R,
  stay: ["가", "나", "다", "라"].map((b) => ({ body: b, status: "done" })),
}, "2026-07-21");
eq(/가, 나 외 2 \(마치고 하원\)/.test(many), true, "많으면 둘까지만");

if (fail) { console.log("\n❌ 리포트 양식에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 리포트 양식 통과");
