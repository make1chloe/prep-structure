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
import { toTask } from "../lib/neis.js";

let bad = 0;
const say = (m) => { console.log(`  ✗ ${m}`); bad = 1; };

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

if (bad) { console.log("\n❌ 받아오기가 그 학교에서 통째로 실패합니다"); process.exit(1); }
console.log("\n✅ 나이스 → 일정 칸 통과");
