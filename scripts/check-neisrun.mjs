/**
 * **여러 날 이어지는 일정을 한 줄로** (lib/neis.js 의 mergeRuns)
 *
 * 원장님 (2026-08-07) — 「신정초랑 해송고 둘 다 방학 하루하루가 다 일정으로
 * 되어 있었는데, 받아오기 하고 나니까 해송고만 남았어」
 *
 * 학교마다 등록하는 방식이 다르다 —
 *   토·일도 넣는 학교 → 하루도 안 끊겨서 합쳐졌다
 *   평일만 넣는 학교 → **주말마다 끊겨서** 주 단위로 쪼개졌다
 *
 * 방학이 주말에 끝났다가 월요일에 다시 시작할 리가 없다.
 *
 * 쓰는 법:  node scripts/check-neisrun.mjs
 */
import {
  mergeRuns, mergeSame, labelGrades, toTask, mockPeriods,
  gradesOf, gradeLabel, levelOf,
} from "../lib/neis.js";
import { readFileSync } from "node:fs";

let fail = 0;
const eq = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log(`  ✗ ${what}\n     나온 것: ${a}\n     바란 것: ${b}`); fail = 1; }
};
const t = (title, due) => ({ title, due_on: due, source_id: `x:${due}:${title}` });
const line = (r) => `${r.due_on}~${r.end_on || r.due_on} ${r.title}`;

console.log("== 하루도 안 끊기면 한 줄 ==");
eq(
  mergeRuns(["2026-08-01", "2026-08-02", "2026-08-03"].map((d) => t("여름방학", d))).map(line),
  ["2026-08-01~2026-08-03 여름방학"],
  "사흘 연속"
);

console.log("\n== 주말을 건너뛰어도 한 줄 ==");
// 2026-08-07(금) → 8/8(토) 8/9(일) 건너뛰고 8/10(월)
eq(
  mergeRuns(["2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"].map((d) => t("여름방학", d))).map(line),
  ["2026-08-06~2026-08-11 여름방학"],
  "평일만 등록한 학교 (해송고)"
);
// 토요일 하루만 빠진 것도 (일요일에 등록한 학교)
eq(
  mergeRuns(["2026-08-07", "2026-08-09"].map((d) => t("여름방학", d))).map(line),
  ["2026-08-07~2026-08-09 여름방학"],
  "토요일만 빠진 것"
);

console.log("\n== 평일이 비면 끊긴 것이다 ==");
// **여기가 무너지면 정말 다른 일정끼리 붙는다** — 1학기 기말과 2학기 기말이
// 한 줄이 되면 시험 준비가 통째로 어긋난다
eq(
  mergeRuns(["2026-08-03", "2026-08-05"].map((d) => t("시험", d))).map(line),
  ["2026-08-03~2026-08-03 시험", "2026-08-05~2026-08-05 시험"],
  "가운데 평일(화)이 비어 있으면 딴 것"
);
eq(
  mergeRuns(["2026-08-03", "2026-08-24"].map((d) => t("시험", d))).map(line),
  ["2026-08-03~2026-08-03 시험", "2026-08-24~2026-08-24 시험"],
  "3주 떨어진 것"
);

console.log("\n== 이름이 다르면 딴 것 ==");
eq(
  mergeRuns([t("여름방학", "2026-08-03"), t("개학식", "2026-08-04")]).map(line),
  ["2026-08-03~2026-08-03 여름방학", "2026-08-04~2026-08-04 개학식"],
  "이름이 다르면 안 붙인다"
);

console.log("\n== 하루짜리는 기간을 안 적는다 ==");
// end_on 이 있으면 화면이 「8/1 ~ 8/1」 로 적는다
eq(mergeRuns([t("개학식", "2026-08-04")])[0].end_on, null, "하루짜리");

// ── 학년 · 모의고사 (원장님, 2026-08-08) ──────────────────────
/**
 * 「26년 3월 고1 모의고사 … 그냥 *년 *월 고* 모의고사 이걸로 구별되지 않아?」
 * 「체육대회 학년별로 하는 경우도 있어서 그냥 1-3학년 일정이면 전체라고 표시」
 *
 * 나이스는 학년을 **줄마다 Y/N** 로 준다. 그동안 그걸 안 읽어서
 *   · 「고1 체육대회」 와 「고2 체육대회」 가 한 줄이 되며 학년이 사라졌고
 *   · 모의고사가 「전국연합학력평가」 하나로 합쳐져 고1·고2를 못 갈랐다
 * 그러면 성적을 어느 회차에 붙일지도, 내신 범위에 무엇을 담을지도 정할 수 없다.
 */
console.log("\n== 학년 표시 ==");
const G = (o) => ({ ONE_GRADE_EVENT_YN: "N", TW_GRADE_EVENT_YN: "N", THREE_GRADE_EVENT_YN: "N", ...o });
eq(gradesOf(G({ ONE_GRADE_EVENT_YN: "Y", TW_GRADE_EVENT_YN: "Y" })), [1, 2], "Y 인 학년만");
eq(gradesOf(G({})), [], "아무 표시가 없으면 빈 것");
eq(levelOf("해송고"), "고", "고등학교");
eq(levelOf("신정중"), "중", "중학교");
// **다 있으면 아무 말도 안 붙인다** — 그게 「전체」 다
eq(gradeLabel([1, 2, 3], "고"), "", "1·2·3학년이면 전체 (표시 없음)");
eq(gradeLabel([1, 2], "고"), "고1·2", "일부면 학년을 적는다");
eq(gradeLabel([], "고"), "", "학교가 표시를 안 했으면 전체로");

console.log("\n== 학년별 행사는 합치되 학년은 모은다 ==");
const sch = { name: "해송고", schul_code: "S1" };
const row = (nm, g) => ({ AA_YMD: "20260515", EVENT_NM: nm, ...G(g) });
{
  // 1·2·3학년이 따로 온 체육대회 → 한 줄, 표시 없음(전체)
  const t = labelGrades(mergeSame([
    toTask(row("체육대회", { ONE_GRADE_EVENT_YN: "Y" }), sch),
    toTask(row("체육대회", { TW_GRADE_EVENT_YN: "Y" }), sch),
    toTask(row("체육대회", { THREE_GRADE_EVENT_YN: "Y" }), sch),
  ].flat()));
  eq(t.length, 1, "한 줄로 합쳐진다");
  eq(t[0].title, "해송고 체육대회", "1~3학년 다면 학년을 안 적는다 (전체)");
}
{
  // 1·2학년만 → 학년을 적는다
  const t = labelGrades(mergeSame([
    toTask(row("체육대회", { ONE_GRADE_EVENT_YN: "Y" }), sch),
    toTask(row("체육대회", { TW_GRADE_EVENT_YN: "Y" }), sch),
  ].flat()));
  eq(t[0].title, "해송고 체육대회 (고1·2)", "일부 학년이면 붙인다");
}

console.log("\n== 모의고사는 학년마다 한 줄 ==");
{
  const made = toTask(
    { AA_YMD: "20260326", EVENT_NM: "전국연합학력평가(1,2학년)",
      ...G({ ONE_GRADE_EVENT_YN: "Y", TW_GRADE_EVENT_YN: "Y" }) },
    sch
  );
  eq(Array.isArray(made), true, "학년 수만큼 나온다");
  eq(made.map((x) => x.title), ["2026년 3월 고1 모의고사", "2026년 3월 고2 모의고사"],
     "연도 · 월 · 학년 (원장님이 고르신 이름)");
  // **열쇠에 학년이 들어가야** 고1·고2가 서로를 덮지 않는다
  eq(new Set(made.map((x) => x.source_id)).size, 2, "고1과 고2가 다른 줄로 남는다");
  // 학교가 아홉 곳이어도 회차는 하나 (전국이 같은 시험지를 본다)
  eq(mergeSame([...made, ...made]).length, 2, "여러 학교가 적어내도 안 늘어난다");
}
{
  // **회차가 만들어져야** 성적과 시험범위가 붙을 자리가 생긴다.
  // 예전에는 examPeriods 가 nationwide 를 통째로 걸러내서 아예 안 만들어졌다
  const made = toTask(
    { AA_YMD: "20260604", EVENT_NM: "6월 모의평가", ...G({ THREE_GRADE_EVENT_YN: "Y" }) }, sch
  );
  const per = mockPeriods(made);
  eq(per.length, 1, "회차 하나");
  eq(per[0].school, "전국", "학교는 전국");
  eq(per[0].grade, "고3", "학년이 붙는다");
  eq(per[0].name, "2026년 6월 고3 모의고사", "이름");
  // 하루짜리라 「시험 기간에 수업이 흔들린다」 셈에는 안 걸린다
  eq(per[0].from_date === per[0].to_date, true, "기간은 하루");
  eq(per[0].english_on, "2026-06-04", "그날이 영어 시험일");
}

console.log("\n== 문항으로 담을 수 있게 ==");
/**
 * 학교는 내신 범위를 「3월 모의고사 18~24번」 처럼 알려준다. 범위는 교재
 * 단원에서 골라 담게 되어 있으므로, 모의고사도 문항이 단원으로 있어야 한다.
 * 듣기(1~17번)는 내신 범위에 안 들어간다.
 */
const prep = readFileSync("app/prep/actions.js", "utf8");
eq(/export async function makeMockBook/.test(prep), true, "문항 교재를 만드는 자리가 있다");
eq(/first = 18, last = 45/.test(prep), true, "듣기(1~17번)를 뺀 18~45번");
eq(/name: `\$\{i\}번`/.test(prep), true, "단원 이름이 문항 번호다");
// 두 번 눌러도 안 늘어나야 한다 (받아오기는 여러 번 돈다)
eq(/already: true/.test(prep), true, "이미 있으면 그것을 쓴다");
const neisAct = readFileSync("app/schedule/neisActions.js", "utf8");
eq(neisAct.includes("makeMockBook"), true, "받아올 때 같이 만들어 둔다");

if (fail) { console.log("\n❌ 일정 합치기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 일정 합치기 통과");
