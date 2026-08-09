/**
 * **우리끼리 쓰는 표시가 표로 들어가면 그 학교가 통째로 실패한다** (2026-08-08)
 *
 * `toTask` 는 표에 없는 칸을 몇 개 달아 보낸다 — 무슨 일정인지(neisKind),
 * 전국 공통인지(nationwide), 몇 학년인지(grades) 같은 것들이다. 넣기 전에
 * 떼어내야 하는데, 학년을 붙이면서 **떼는 것을 빠뜨렸다.**
 *
 *   인천해송고등학교 — Could not find the 'grades' column of 'tasks'
 *
 * 열한 학교가 전부 이 한 줄로 실패했다. 빌드도 통과하고, 검사도 통과하고,
 * **원장님이 받아오기를 누르셔야** 나온다. 그래서 여기서 못 박는다 —
 * toTask 가 다는 칸 중 표에 없는 것은 **반드시 떼는 목록에 있어야 한다.**
 *
 * 쓰는 법:  node scripts/check-neiscols.mjs
 */
import { readFileSync } from "node:fs";
import { toTask, isNationwide, mergeSame, mergeRuns, labelGrades, examPeriods } from "../lib/neis.js";

let bad = 0;
const say = (m) => { console.log(`  ✗ ${m}`); bad = 1; };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    say(`${what}\n     나온 것: ${JSON.stringify(got)}  바란 것: ${JSON.stringify(want)}`);
  }
};

/** tasks 표에 진짜로 있는 칸 (0001 + 뒤에 붙은 것들) */
const TASK_COLS = new Set([
  "id", "title", "kind", "category", "due_on", "end_on", "start_time",
  "status", "done_at", "class_id", "assignee_id", "note",
  "deliver_body", "deliver_scope", "deliver_class_id", "deliver_school", "deliver_grade",
  "created_by", "created_at",
  // 뒤에 붙은 것들
  "absence_reason", "absence_student_ids", "applied_at", "due_time", "no_due",
  "notice_body", "parent_id", "priority", "source", "source_id", "todo_category_id",
  // 화면 코드가 넣어주는 것
  "private", "deliver_school_id",
]);

/**
 * neisActions 가 **무엇을 떼고 있는지**를 소스에서 읽는다.
 * 목록을 여기 또 적으면 두 벌이 되고, 두 벌은 반드시 어긋난다.
 */
const src = readFileSync("app/schedule/neisActions.js", "utf8");
const stripped = new Set();
for (const m of src.matchAll(/const \{([^}]*)\}\s*=\s*row;|\(\{\s*([^}]*?)\.\.\.(?:row|rest)\s*\}\)/g)) {
  const body = m[1] || m[2] || "";
  body.split(",").forEach((piece) => {
    const name = piece.split(":")[0].replace(/\.\.\..*/, "").trim();
    if (name && !name.startsWith("...")) stripped.add(name);
  });
}

console.log("== toTask 가 다는 칸이 전부 표에 있나 ==");
const SCHOOL = { name: "해송고", schul_code: "S1", id: "x" };
const G = (o) => ({
  ONE_GRADE_EVENT_YN: "N", TW_GRADE_EVENT_YN: "N", THREE_GRADE_EVENT_YN: "N", ...o,
});

const samples = [
  // 학교 행사 (학년 표시 있음)
  toTask({ AA_YMD: "20260515", EVENT_NM: "체육대회", ...G({ ONE_GRADE_EVENT_YN: "Y" }) }, SCHOOL),
  // 학교 시험
  toTask({ AA_YMD: "20260430", EVENT_NM: "1학기 중간고사", ...G({}) }, SCHOOL),
  // 전국 공통 (수능)
  toTask({ AA_YMD: "20261119", EVENT_NM: "대학수학능력시험", ...G({}) }, SCHOOL),
  // 모의고사 — 학년마다 한 줄이라 배열로 온다
  toTask({ AA_YMD: "20260326", EVENT_NM: "전국연합학력평가", ...G({ ONE_GRADE_EVENT_YN: "Y" }) }, SCHOOL),
].flat().filter(Boolean);

if (samples.length < 4) say(`본보기가 모자랍니다 (${samples.length}개)`);

for (const t of samples) {
  for (const key of Object.keys(t)) {
    if (TASK_COLS.has(key)) continue;
    if (stripped.has(key)) continue;
    say(`「${key}」 — tasks 표에 없는데 떼지도 않습니다 (${t.title})`);
  }
}
if (!bad) console.log(`  본보기 ${samples.length}줄 · 떼는 칸 ${stripped.size}개 — 남는 것 없음`);

console.log("\n== 떼는 자리가 두 군데 다 있나 ==");
// 학교별 줄과 전국 공통 줄이 **따로** 들어간다 — 한쪽만 떼면 다른 쪽이 실패한다
for (const k of ["grades", "level", "mock", "neisKind", "nationwide", "schoolName"]) {
  const n = (src.match(new RegExp(`\\b${k}\\b(?=[,\\s].*\\.\\.\\.)`, "g")) || []).length;
  if (!stripped.has(k)) say(`「${k}」 를 아무 데서도 안 뗍니다`);
  else if (n < 2) say(`「${k}」 를 한 군데에서만 뗍니다 (학교별 · 전국 공통 둘 다 필요)`);
}

console.log("\n== 학교 이름이 공휴일로 읽히지 않나 ==");
/**
 * **신정초·신정중이 받아올 때마다 통째로 지워지고 있었다** (2026-08-08).
 *
 * 받아온 뒤, 「전국 공통인데 학교별로 남은 줄」 을 걷어내는 정리가 돈다.
 * 그 판단을 **제목**으로 했다. 그런데 제목은 「인천신정중학교 개교기념일」
 * 처럼 학교 이름이 앞에 붙고, 공휴일 목록에는 「신정(1월 1일)」 이 있다.
 * 그래서 **학교 이름에 「신정」 이 들어간다는 이유만으로** 그 학교 일정이
 * 전부 지워졌다 — 받아오면 33건, 새로고침하면 0건.
 *
 * 오류가 안 난다. 「받았어요」 까지 뜨고 나서 조용히 사라진다.
 */
eq(isNationwide("인천신정중학교 개교기념일"), true,
   "제목으로 보면 학교 이름이 걸린다 (그래서 제목으로 보면 안 된다)");
eq(isNationwide("개교기념일"), false, "행사 이름만 보면 안 걸린다");
eq(isNationwide("신정"), true, "진짜 공휴일은 그대로 걸린다");
// 정리하는 자리가 **행사 이름만** 보는지
const clean = src.slice(src.indexOf("학교별로 남아 있던 전국 공통"));
eq(/isNationwide\(eventOf\(r\.source_id\)\)/.test(clean), true,
   "제목이 아니라 source_id 의 행사 이름으로 가른다");
eq(/isNationwide\(r\.title/.test(clean), false, "제목으로 보던 것이 남아 있다");

console.log("\n== 마지막 날만 고3이 보는 시험이 한 줄로 이어지나 ==");
/**
 * 원장님 (2026-08-09) — 「연수여고 중간고사는 10/13-10/16 한 번에 제대로
 * 표시되는데 기말은 날짜별로 한 줄씩 차지하고 있어. 다른 학교도 마찬가지야」
 *
 * 학년을 **이어붙이기 전에** 제목에 붙이고 있었다. 그러면 마지막 날만 고3이
 * 보는 시험은 그날 제목이 「기말고사 (고3)」 이 되어 앞날과 달라지고, 제목으로
 * 잇는 mergeRuns 가 못 잇는다 — **날마다 한 줄.** 중간고사는 사흘 내내 학년이
 * 같아 잘 나왔고, 그래서 「중간은 되는데 기말만 안 된다」 로 보였다.
 */
const YEON = { name: "연수여고", schul_code: "S9", id: "y" };
const day = (d, g) => ({
  AA_YMD: d, EVENT_NM: "2학기 기말고사",
  ONE_GRADE_EVENT_YN: g.includes(1) ? "Y" : "N",
  TW_GRADE_EVENT_YN: g.includes(2) ? "Y" : "N",
  THREE_GRADE_EVENT_YN: g.includes(3) ? "Y" : "N",
});
const raw = [day("20261210", [1, 2, 3]), day("20261211", [1, 2, 3]), day("20261212", [3])]
  .flatMap((r) => toTask(r, YEON) || []).filter(Boolean);
const merged = mergeRuns(mergeSame(raw));
eq(merged.length, 1, "사흘이 한 줄로 이어진다");
eq([merged[0]?.due_on, merged[0]?.end_on], ["2026-12-10", "2026-12-12"], "12/10 ~ 12/12");
// 학년을 모았으니 셋 다 → 「전체」 라 꼬리표가 안 붙는다
eq(labelGrades(merged)[0]?.title, "연수여고 2학기 기말고사", "학년을 모아 「전체」 가 된다");
eq(examPeriods(merged, YEON).length, 1, "시험 회차도 하나다");

console.log("\n== 고3만 따로 보는 시험은 학년이 적힌다 ==");
/**
 * 원장님 (2026-08-09) — 「해송고가 여전히 3개인데 혹시 학년이 다른 거 아니야?」
 *
 * 고3 기말이 1·2학년과 다른 주에 있는 학교가 있다. 회차가 둘인 것은 맞는데,
 * 학년을 안 적으면 둘 다 「2학기 기말」 이라 시험이 하나 더 있는 것처럼 읽힌다.
 */
const solo = mergeRuns(mergeSame(
  [day("20261203", [3]), day("20261204", [3])].flatMap((r) => toTask(r, YEON) || []).filter(Boolean)
));
eq(examPeriods(solo, YEON).map((e) => e.grade), ["고3"], "한 학년만 보면 그 학년이 적힌다");
eq(examPeriods(merged, YEON).map((e) => e.grade), [null],
   "여러 학년이면 비워둔다 (칸이 하나라 「고1·2」 는 아무와도 안 맞는다)");

console.log("\n== 차례가 지켜지나 ==");
// 학년을 먼저 붙이면 이 버그가 그대로 돌아온다
const na = readFileSync("app/schedule/neisActions.js", "utf8");
eq(/mergeRuns\(labelGrades\(/.test(na), false, "학년을 이어붙이기 전에 붙이지 않는다");
eq(/const merged = mergeRuns\(mergeSame\(/.test(na), true, "합치기 → 이어붙이기 차례");
eq(/const tasks = labelGrades\(merged\)/.test(na), true, "학년은 맨 마지막에 붙인다");
// 회차 이름에 꼬리표가 섞이면 시험 이름이 또 제각각이 된다
eq(/examPeriods\(merged, school\)/.test(na), true, "회차는 꼬리표 붙기 전 제목으로 뽑는다");

if (bad) { console.log("\n❌ 받아오기가 그 학교에서 통째로 실패합니다"); process.exit(1); }
console.log("\n✅ 나이스 → 일정 칸 통과");
