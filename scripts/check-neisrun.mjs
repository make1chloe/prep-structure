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
import { matchExam, staleAfterImport } from "../lib/exams.js";
import { classifyExam } from "../lib/examKind.js";
import { needsScope } from "../lib/examList.js";
import { kindOf, examName, isNationwide, explainRow } from "../lib/neis.js";
import { parseVideoAoA } from "../lib/importVideo.js";
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


console.log("\n== 내신과 모의고사가 서로 안 붙나 ==");
/**
 * 원장님 (2026-08-09) — 「모의고사가 내신으로 표시됐어 / 시험 날짜가 다
 * 이상해졌어 / 대부분의 학교들이 내신 시험 시작 날짜만 나오고 나머지 날짜가
 * 아예 표시가 안 돼」
 *
 * **한 줄 사고였다.** 합치기 전 시절에 학교마다 있던 모의고사 줄
 * (해송고 · 전국연합학력평가 · 10/14 하루) 이 그대로 남아 있는데,
 * 이번에 받아온 해송고 2학기 중간(10/13~10/16)이 날짜가 겹친다는 이유로
 * **그 모의고사 줄에 붙었다.** 그래서 —
 *   · 이름이 「전국연합학력평가」 인 채라 내신이 모의고사로 보이고
 *   · 「내 것은 안 바꾼다」 규칙에 걸려 날짜가 10/14 하루로 굳었다
 */
{
  const pool = [
    { id: "mock", school: "해송고", name: "전국연합학력평가",
      from_date: "2026-10-14", to_date: "2026-10-14", source: "neis" },
    { id: "mid", school: "해송고", name: "2학기 중간고사",
      from_date: "2026-10-13", to_date: "2026-10-16", source: "neis" },
  ];
  const mid = { school: "해송고", name: "2학기 중간고사", from_date: "2026-10-13", to_date: "2026-10-16" };
  eq(matchExam(mid, pool)?.id, "mid", "내신은 내신에 붙는다 (모의고사 줄을 건너뛴다)");
  const mock = { school: "해송고", name: "2026년 10월 고1 모의고사", from_date: "2026-10-14", to_date: "2026-10-14" };
  eq(matchExam(mock, pool)?.id, "mock", "모의고사는 모의고사에 붙는다");
  // 붙을 짝이 없으면 **안 붙인다** — 아무 데나 붙이느니 새로 만드는 것이 낫다
  eq(matchExam(mock, [pool[1]]), null, "종류가 다르면 붙지 않는다");
}

console.log("\n== 나이스가 만든 줄은 나이스 날짜를 따라가나 ==");
/**
 * **지킬 「내 것」 이 없는 줄까지 지키고 있었다.** 원장님이 손으로 적으신
 * 줄은 학교가 날짜를 바꿔도 안 건드리는 것이 맞다 — 자료 일정이 거기 매달려
 * 있어서 조용히 바뀌면 시험 사흘 전에 어긋나 있어도 모른다. 그런데 나이스가
 * 만든 줄에는 애초에 지킬 것이 없었는데도 같은 규칙을 썼고, 그래서 옛 날짜에
 * 그대로 굳었다.
 */
{
  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  eq(/const mine = \(hit\.source \|\| ""\) !== "neis";/.test(act), true,
     "누가 만든 줄인지 가른다");
  eq(/from_date: e\.from_date, to_date: e\.to_date/.test(act), true,
     "나이스가 만든 줄은 나이스 날짜로 맞춘다");
  // 이미 잘못 붙어 있던 것은 다시 받아와도 저절로 안 떨어진다 — 떼어준다
  eq(/examKind\(x\) !== examKind\(\{ name: x\.neis_name \}\)/.test(act), true,
     "종류가 다른 채 붙어 있던 것을 떼어낸다");
}

console.log("\n== 두 파일이 같은 이름에 같은 답을 내나 (전수 대조) ==");
/**
 * 원장님 (2026-08-09) — 「단편적으로 반영하다 보니 예외 규칙이 너무 많아져서
 * 제대로 작동이 안 되는 것 같아. 일정 관련 코드를 전면 재검토해서 바로잡아」
 *
 * 재검토에서 나온 뿌리 — lib/neis.js 와 lib/examList.js 가 **저마다의
 * 정규식**으로 같은 이름을 갈랐다. 「6월 모의평가」 를 한쪽은 전국, 한쪽은
 * 내신이라고 했다. 이제 갈래는 lib/examKind 한 곳이고, 여기서는 실제로
 * 나이스에 올라오는 이름들로 **두 파일이 늘 같은 답**을 내는지 못 박는다.
 */
{
  const CASES = [
    // [이름, 갈래, kindOf(내신 기간인가), isNationwide(전국 한 줄인가)]
    ["1학기 중간고사", "school", "exam", false],
    ["2학기 기말고사", "school", "exam", false],
    ["1회고사", "school", "exam", false],
    ["제2차 지필평가", "school", "exam", false],
    ["2차시험", "school", "exam", false],
    ["전국연합학력평가", "mock", "event", true],
    ["3월 전국연합학력평가", "mock", "event", true],
    // **모의평가에는 「모평」 이 안 들어 있다** — 옛 정규식이 이걸 내신으로 봤다
    ["6월 모의평가", "mock", "event", true],
    ["9월 모의평가", "mock", "event", true],
    ["6월 모평", "mock", "event", true],
    ["학력평가", "mock", "event", true],
    ["대학수학능력시험", "suneung", "event", true],
    ["수능", "suneung", "event", true],
    ["수능 예비소집", "suneung", "event", true],
    // 이름에 「시험」 이 있어도 쉬는 날이다
    ["대수능시험 휴업일", "suneung", "off", true],
    ["수행평가", "assess", "event", false],
    ["학업성취도평가", "assess", "event", false],
    ["진단평가", "assess", "event", false],
    ["기초학력진단평가", "assess", "event", false],
    ["재량휴업일", "", "off", false],
    ["여름방학", "", "off", false],
    ["체육대회", "", "event", false],
  ];
  for (const [n, want, wantKind, wantNat] of CASES) {
    eq(classifyExam(n), want, `갈래 「${n}」`);
    eq(kindOf(examName(n, "2026-10-14"), ""), wantKind, `kindOf 「${n}」`);
    eq(isNationwide(n), wantNat, `전국 한 줄 「${n}」`);
  }
  // 회차 화면 쪽도 같은 답
  eq(needsScope({ name: "6월 모의평가" }), false, "모의평가에 범위 재촉을 안 한다");
  eq(needsScope({ name: "수행평가" }), false, "수행평가에도 안 한다");
  eq(needsScope({ name: "제2차 지필평가" }), true, "내신 지필에는 한다");
}

console.log("\n== 이번에 안 나온 나이스 줄을 치우나 (선언적 동기화) ==");
/**
 * 원장님 (2026-08-09) — 「학사일정이 여전히 제대로 로딩되지 않고 있어」
 *
 * 잘못 하나마다 고치는 규칙(흡수 · 옛 줄 치우기)을 붙이니 규칙이 못 보는
 * 모양이 영영 남았다. 이제 규칙은 하나다 — **이번에 받아온 목록이 전부고,
 * 그 학교·그 기간의 나이스 줄 중 거기 없는 것은 치운다.** 손대신 것만 지킨다.
 */
{
  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  eq(/addExamPeriods\(found, \{ school: school\.name, from, to \}\)/.test(act), true,
     "받아오기가 학교·기간을 넘겨 치우게 한다");
  eq(/const touched = new Set\(\);/.test(act), true, "이번에 나온 줄을 기억한다");
  eq(/staleAfterImport\(pool, \{/.test(act), true, "치울 것 판단은 lib/exams 한 곳이다");
  // 전국 줄(모의고사·대수능)도 같은 규칙 — 단, 전체 받아오기일 때만
  eq(/if \(!schoolId\) \{/.test(act), true, "학교 하나만 받을 때는 전국 줄을 안 치운다");
  eq(/!wanted\.has\(x\.name\)/.test(act), true, "이번 목록에 없는 전국 줄을 치운다");
  // 옛 땜질(흡수)은 걷어냈다 — 동기화 하나면 된다
  eq(/absorbable/.test(act), false, "흡수 규칙이 더는 없다");
}
{
  // 원장님 화면(2026-08-09) 그대로 — 옥련여고 기말이 쪼개져 세 줄, 다른 날에도 한 줄
  const pool = [
    { id: "a", school: "옥련여고", from_date: "2026-12-10", to_date: "2026-12-10", source: "neis" },
    { id: "b", school: "옥련여고", from_date: "2026-12-11", to_date: "2026-12-11", source: "neis" },
    { id: "c", school: "옥련여고", from_date: "2026-12-14", to_date: "2026-12-14", source: "neis" },
    { id: "new", school: "옥련여고", from_date: "2026-12-10", to_date: "2026-12-15", source: "neis" },
    // 이름 표기만 다른 같은 학교 — 그래도 치워져야 한다
    { id: "full", school: "인천옥련여자고등학교", from_date: "2026-09-02", to_date: "2026-09-02", source: "neis" },
    // 지키는 것들
    { id: "hand", school: "옥련여고", from_date: "2026-12-11", to_date: "2026-12-11", source: null },
    { id: "eng", school: "옥련여고", from_date: "2026-12-12", to_date: "2026-12-12", source: "neis", english_on: "2026-12-12" },
    { id: "score", school: "옥련여고", from_date: "2026-12-13", to_date: "2026-12-13", source: "neis" },
    // 남의 학교 · 기간 밖
    { id: "other", school: "연수여고", from_date: "2026-12-11", to_date: "2026-12-11", source: "neis" },
    { id: "past", school: "옥련여고", from_date: "2025-12-11", to_date: "2025-12-11", source: "neis" },
  ];
  const got = staleAfterImport(pool, {
    school: "옥련여고", from: "2026-03-01", to: "2027-02-28",
    touched: new Set(["new"]), inUse: new Set(["score"]),
    sameSchool: (x, y) => x.replace(/인천|자|등학교|학교/g, "") === y.replace(/인천|자|등학교|학교/g, ""),
  });
  eq(got.map((x) => x.id), ["a", "b", "c", "full"],
     "쪼개진 세 줄과 다른 날 옛 줄만 — 손댄 것·손으로 만든 것·성적 붙은 것·남의 학교·기간 밖은 남는다");
}

console.log("\n== 이 시험을 누가 보는지 적어주나 ==");
/**
 * 원장님 (2026-08-09) — 「학사 일정 옆에 해당하는 학생 이름과 몇 명인지를 써 줘」
 *
 * 아무도 안 보는 회차면 자료를 만들 까닭이 없고, 여덟이 보는 회차면 그 주
 * 수업을 통째로 비워야 한다. 판단은 인원에서 시작한다.
 */
{
  const sb = readFileSync("app/schedule/ScheduleBoard.jsx", "utf8");
  eq(/function WhoTakes\(\{ e \}\)/.test(sb), true, "누가 보는지 적는 자리가 있다");
  eq(/roster\.filter\(\(s\) => takesExam\(s, e\)\)/.test(sb), true,
     "누가 보는지는 lib/who 의 takesExam 한 곳에서만 정한다");
  eq(/<WhoTakes e=\{e\} \/>/.test(sb), true, "줄에 붙어 있다");
  eq(/보는 학생 없음/.test(sb), true, "아무도 없으면 없다고 적는다 (빈칸으로 두지 않는다)");
  // **이름을 자르지 않는다** (원장님 — 「외 1명 안 돼, 이름 다 보여야 해」)
  eq(/외 \$\{/.test(sb), false, "「외 N명」 으로 자르지 않는다");
  eq(/이름 보기 \(\$\{who\.length\}명\)/.test(sb), true, "많으면 눌러서 편다");
  eq(/normalizeGrade\(s\.grade\)/.test(sb), true, "학년으로 묶어서 적는다");
  // 내신이 하루짜리면 쪼개진 옛 줄이 남아 있다는 뜻이다
  eq(/하루짜리\?/.test(sb), true, "하루짜리 내신은 눈에 띄게 적어둔다");
  for (const page of ["app/schools/page.jsx", "app/schedule/page.jsx"]) {
    eq(/roster=\{students \|\| \[\]\}/.test(readFileSync(page, "utf8")), true, `${page} 가 명단을 넘긴다`);
  }
}


console.log("\n== 재량휴업일을 받아오나 ==");
/**
 * 원장님 (2026-08-09) — 「학사일정에 재량휴업일 넣어줘. 시험은 아니지만
 * 중요한 일정이라서」 · 「여러 학교가 쉬면 한 줄씩 아니고 일정 하나에
 * 여러 학교 이름 나열해줘」
 *
 * 나이스는 재량휴업일을 **행사 이름 없이** 「수업공제일명 = 휴업일」 로만
 * 주는 학교가 있다. 이름이 없다고 버리고 있었는데, 그날은 아이가 하루 종일
 * 비는 날이라 학원 쪽에서는 제일 중요한 날 중 하나다.
 */
{
  const hs = { name: "해송고", schul_code: "H1" };
  // 2026-09-21 은 월요일 — 평일에 이름 없이 휴업일이면 재량휴업일이다
  const t = toTask({ AA_YMD: "20260921", EVENT_NM: "", SBTR_DD_SC_NM: "휴업일" }, hs);
  eq(t?.title, "재량휴업일", "이름이 비어 있어도 받아온다");
  eq(t?.neisKind, "off", "쉬는 날로 본다");
  // **토·일은 그대로 버린다** — 원래 안 가는 날이라 한 해에 백 줄이 는다
  eq(toTask({ AA_YMD: "20260919", EVENT_NM: "", SBTR_DD_SC_NM: "휴업일" }, hs), null, "토요일은 안 받는다");
  eq(toTask({ AA_YMD: "20260920", EVENT_NM: "", SBTR_DD_SC_NM: "휴업일" }, hs), null, "일요일은 안 받는다");
  // 이름도 없고 휴업일도 아니면 알려주는 것이 없다
  eq(toTask({ AA_YMD: "20260921", EVENT_NM: "", SBTR_DD_SC_NM: "" }, hs), null, "빈 줄은 그대로 버린다");

  // **여러 학교가 같은 날 쉬면 한 줄로** — 학교코드를 열쇠에 안 넣는다
  const a = toTask({ AA_YMD: "20260921", EVENT_NM: "재량휴업일" }, hs);
  const b = toTask({ AA_YMD: "20260921", EVENT_NM: "재량휴업일" }, { name: "연수여고", schul_code: "Y1" });
  eq(a.source_id, b.source_id, "두 학교가 같은 줄로 모인다");
  eq(a.shared, true, "한 줄로 모으는 것이라는 표가 있다");
  eq(a.title, "재량휴업일", "제목에 학교 이름을 안 붙인다 (학교는 설명에 늘어놓는다)");
  eq(mergeSame([a, b]).length, 1, "실제로 한 줄이 된다");

  // **방학은 안 모은다** — 학교마다 시작·끝이 달라서 묶으면 누가 언제 쉬는지 사라진다
  const v = toTask({ AA_YMD: "20260720", EVENT_NM: "여름방학" }, hs);
  eq(v.shared, undefined, "방학은 학교마다 따로 둔다");
  eq(v.title, "해송고 여름방학", "방학에는 학교 이름이 붙는다");
}
{
  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  eq(/if \(!t\.nationwide && !t\.shared\)/.test(act), true, "한 줄로 모을 것을 같은 자리로 보낸다");
  eq(/if \(shared\) \{/.test(act), true, "어느 학교가 쉬는지 적는다");
}


console.log("\n== 쉬는 날이 시험으로 잡히지 않나 ==");
/**
 * 원장님 (2026-08-09) — 화면에 「대수능시험 휴업일」 이 **시험 회차**로 네 줄
 * 앉아 있었다. 이름에 「시험」 이 들어 있어서 EXAM 에 걸린 것이다.
 * 그날은 아이들이 **쉬는 날**이지 시험 보는 날이 아니다.
 */
[
  ["대수능시험 휴업일", "off"],
  ["수능시험일 휴업", "off"],
  ["재량휴업일", "off"],
  ["여름방학", "off"],
  ["2학기 기말고사", "exam"],
  ["1학기 중간고사", "exam"],
  ["제2차 지필평가", "exam"],
].forEach(([n, want]) => eq(kindOf(n), want, `「${n}」`));

console.log("\n== 옛 줄을 한 번에 비울 길이 있나 ==");
/**
 * 원장님 (2026-08-09) — 「여전히 한 줄씩 나오거나 모의고사가 내신으로
 * 잡히는데, 진짜 코드 문제 아닌 거 맞아?」
 *
 * **고친 코드는 새로 만드는 것만 바로잡는다.** 옛 코드가 만들어 둔 줄은
 * 다시 받아와도 안 없어진다 — 새 줄보다 넓거나(12/11~12/16 안에
 * 12/14~12/16), 이름이 다르거나(「대수능시험 휴업일」), 아예 다른 날에
 * 있으면 흡수(absorbable)가 못 잡는다. 그래서 한 번 비우는 길을 낸다.
 */
{
  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  eq(/export async function resetNeisExams/.test(act), true, "비우는 자리가 있다");
  eq(/if \(\(r\.source \|\| ""\) !== "neis"\) continue;/.test(act), true, "손으로 만드신 줄은 안 지운다");
  eq(/if \(inUse\.has\(r\.id\)\)/.test(act), true, "성적·범위가 붙은 줄은 안 지운다");
  eq(/const touched = \(r\) =>/.test(act), true, "적어두신 것이 있으면 안 지운다");
  eq(/r\.english_on \|\| r\.teacher \|\| r\.note/.test(act), true,
     "영어 시험일 · 선생님 · 특이사항을 살핀다");
  const box = readFileSync("app/schedule/NeisBox.jsx", "utf8");
  eq(/resetNeisExams\(\)/.test(box), true, "화면에 단추가 있다");
  eq(/시험 회차 다시 만들기/.test(box), true, "단추 이름");
}


console.log("\n== 모의고사에 있을 수 없는 칸을 안 내나 ==");
/**
 * 원장님 (2026-08-09) — 「모의고사는 등급컷·선생님 정보가 있을 수가 없어.
 * 특이사항은 남겨 둬」
 *
 * 등급컷도 출제 선생님도 학교가 정하는 것이라 학교 시험에만 있다. 있을 수
 * 없는 칸이 줄마다 두 개씩 붙어 있으면, 정말 채워야 하는 「영어 시험일」 이
 * 그 사이에 묻힌다.
 */
{
  const sb = readFileSync("app/schedule/ScheduleBoard.jsx", "utf8");
  eq(/examKind\(e\) === "school" && \(cutOpen === e\.id \?/.test(sb), true,
     "등급컷은 학교 시험에만 낸다");
  eq(/\{examKind\(e\) === "school" && \(\s*<input[\s\S]{0,120}김선생, 박선생/.test(sb), true,
     "출제 선생님 칸도 학교 시험에만");
  eq(/e\.note \? "특이사항 고치기" : "특이사항 적기"/.test(sb), true, "특이사항은 남겨 둔다");
}

console.log("\n== 회차가 하나도 없는 학교를 알려주나 ==");
/**
 * 원장님 (2026-08-09) — 「시험 있어야 하는 학교가 없어」
 *
 * **목록에 있는 것은 눈에 보이는데, 없는 것은 안 보인다.** 아홉 학교 중
 * 세 곳이 통째로 안 들어왔어도 남은 여섯 곳이 그럴듯하게 차 있어서 모른다.
 */
{
  const sb = readFileSync("app/schedule/ScheduleBoard.jsx", "utf8");
  eq(/const missingSchools = useMemo/.test(sb), true, "세는 자리가 있다");
  eq(/sameSchool\(e\.school, s\)/.test(sb), true,
     "학교 견주기는 lib/who 한 곳에서만 (해송고 ↔ 인천해송고등학교)");
  eq(/examKind\(e\) === "school"\)/.test(sb), true, "모의고사는 학교 회차로 안 센다");
  eq(/시험 회차가 하나도 없는 학교가/.test(sb), true, "화면에 적어준다");
}

console.log("\n== 영상 엑셀 ==");
/**
 * 원장님 (2026-08-09) — 「영상 엑셀로 한 번에 넣을 수 있게 해 줘」
 *
 * **주소만 있으면 된다.** 제목을 꼭 적어야 하면 스무 개를 넣으려고 스무 번
 * 유튜브에 들어가 제목을 복사해 오셔야 한다.
 */
{
  const one = parseVideoAoA([
    ["제목", "주소", "폴더", "메모"],
    ["관계대명사 1강", "https://youtu.be/abc12345678", "문법", "3분"],
    ["", "https://www.youtube.com/watch?v=zzz99999999", "문법", ""],
    ["제목만 있고 주소가 없음", "", "문법", ""],
  ]);
  eq(one.rows.length, 2, "주소가 있는 줄만 (제목이 없어도 받는다)");
  eq(one.rows[1].title, "", "제목은 비어 있어도 된다 — 유튜브가 알고 있다");
  eq(one.rows[0].folder, "문법", "폴더 이름을 그대로 읽는다");
  // 열 이름을 학교마다·사람마다 다르게 적는다
  const alt = parseVideoAoA([["영상제목", "링크", "묶음", "비고"], ["a", "https://youtu.be/x1234567890", "b", "c"]]);
  eq(alt.rows[0], { title: "a", url: "https://youtu.be/x1234567890", folder: "b", note: "c" },
     "제목·주소·폴더·메모를 다르게 적어도 알아본다");
  eq(parseVideoAoA([["제목", "주소"]]).rows.length, 0, "머리만 있으면 0줄");

  const act = readFileSync("app/videos/actions.js", "utf8");
  eq(/export async function bulkAddVideos/.test(act), true, "한 번에 넣는 자리가 있다");
  eq(/export async function exportVideos/.test(act), true, "지금 것을 내려받을 수 있다");
  // **한 줄이 틀렸다고 전부를 안 넣지 않는다** — 몇 번째 줄인지 알려준다
  eq(/bad\.push\(`\$\{i \+ 2\}번째 줄/.test(act), true, "주소가 아닌 줄은 몇 번째인지 알려준다");
  eq(/if \(vid \? haveVid\.has\(vid\) : haveUrl\.has\(url\)\) continue;/.test(act), true,
     "이미 있는 영상은 건너뛴다 (주소 모양이 달라도 같은 영상)");
  eq(/madeFolders \+= 1;/.test(act), true, "없는 폴더 이름이면 만든다");
  const board = readFileSync("app/videos/VideoBoard.jsx", "utf8");
  eq(/<VideoUpload \/>/.test(board), true, "넣는 자리 바로 아래에 둔다");
}


console.log("\n== 「2학기 중간」 처럼 뒷말을 뗀 이름도 시험으로 보나 ==");
/**
 * 원장님 (2026-08-09) — 「지금 중학교에서는 은송중하고 신정중만 2학기 중간
 * 시험 일정이 나오는데 이게 맞아? 네가 의도한 거야?」
 *
 * 아니었다. 「고사·시험·평가·지필」 이 하나도 없는 「2학기 중간」 은 시험이
 * 아닌 것으로 흘러가서, 그 학교는 **회차가 통째로 안 생겼다.** 목록에서
 * 그냥 없는 것처럼 보이고 왜 없는지도 알 수 없었다.
 *
 * 다만 「중간」 두 글자는 다른 데도 쓰인다 — 그 말로 **끝날 때만** 받는다.
 */
[
  ["2학기 중간", "school"],
  ["1학기 기말", "school"],
  ["중간", "school"],
  ["중간놀이시간", ""],
  ["기말 방학", ""],
  ["체육대회", ""],
].forEach(([n, want]) => eq(classifyExam(n), want, `「${n}」`));

console.log("\n== 없는 것이 왜 없는지 알려주나 ==");
/**
 * 「박문중 2학기 중간」 이 없을 때 까닭은 셋인데 화면은 똑같이 「없음」 이다 —
 *   1. 그 학교가 정말 안 본다 (학기당 지필 한 번인 중학교가 많다)
 *   2. 학교가 아직 안 올렸다
 *   3. 받아왔는데 우리가 회차로 못 만들었다   ← 이것만 앱 잘못이다
 * 그래서 원장님이 「이게 맞아?」 를 물으실 수밖에 없었다. 셋을 갈라 준다.
 */
{
  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  eq(/export async function examCoverage/.test(act), true, "학교별로 세는 자리가 있다");
  eq(/const inSome = \(d\) =>/.test(act), true, "그날을 덮는 회차가 있는지 본다");
  eq(/!inSome\(t\.due_on\)/.test(act), true, "회차가 없는 날만 짚어준다");
  const box = readFileSync("app/schedule/CoverageBox.jsx", "utf8");
  eq(/학교 일정엔 있는데 회차가 없는 날/.test(box), true, "그 날짜와 이름을 그대로 적어준다");
  eq(/학기당 지필을 한 번만\(기말만\) 보는 곳이 많습니다/.test(box), true,
     "없는 것이 정상일 수 있다고 먼저 말해준다");
  const nb = readFileSync("app/schedule/NeisBox.jsx", "utf8");
  eq(/<CoverageBox from=\{range\.from\} to=\{range\.to\} \/>/.test(nb), true, "받아오기 옆에 있다");
}


console.log("\n== 나이스 원본을 그대로 볼 수 있나 ==");
/**
 * 원장님 (2026-08-09) — 「나이스 일정 페이지를 만들어서 순수하게 나이스에
 * 입력된 일정을 전수 볼 수 있게 해줘. 지금 오류가 난 건지 입력이 안 된 건지
 * 알 수가 없네. 장기적으로도 이 페이지는 필요해 보여」
 *
 * 다른 화면은 전부 **우리가 바꾼 뒤**의 모습이라, 뭔가 없을 때 학교가 안
 * 올린 것인지 우리가 못 알아본 것인지 가릴 수가 없었다. 이 판정을 화면이
 * 제 나름대로 다시 재면 실제 받아오기와 다른 말을 하게 되고, 그러면 진단
 * 도구로서 쓸모가 없어진다 — 그래서 explainRow 한 곳에서만 정한다.
 */
{
  const hs = { name: "해송고", schul_code: "H1" };
  const R = (nm, ymd = "20261014", extra = {}) =>
    explainRow({ AA_YMD: ymd, EVENT_NM: nm, ...extra }, hs);

  eq(R("1회고사").how, "시험", "내신 지필은 「시험」");
  eq(R("1회고사").event, "2학기 중간고사", "편 이름도 같이 준다");
  eq(R("2학기 중간고사").event, null, "펼 것이 없으면 같은 말을 두 번 안 적는다");
  eq(R("전국연합학력평가").how, "전국", "모의고사는 「전국」");
  eq(R("대학수학능력시험").how, "전국", "대수능도 「전국」");
  eq(R("여름방학", "20260720").how, "쉼", "방학은 「쉼」");
  // 「대수능시험 휴업일」 은 **전국**이다 — 수능날은 전국이 같은 날이고,
  // 그 학교가 쉰다는 것은 그 학교의 사정일 뿐이다 (commonName 이 한 줄로 편다)
  eq(R("대수능시험 휴업일", "20261119").how, "전국", "수능날 휴업은 전국 한 줄로 간다");
  eq(R("재량휴업일", "20260921").how, "쉼", "재량휴업일은 그 학교가 쉬는 날");
  eq(R("체육대회").how, "행사", "나머지는 「행사」");
  eq(R("수행평가").how, "행사", "수행평가는 회차가 아니다");
  eq(R("토요휴업일", "20261017").how, "버림", "알려주는 것이 없는 줄은 「버림」");

  // **열쇠가 맞아야** 「나이스엔 있는데 앱엔 없다」 를 따질 수 있다
  eq(R("1회고사").sourceId, "H1:20261014:2학기 중간고사", "학교 줄은 학교코드가 열쇠에 든다");
  eq(R("전국연합학력평가").sourceId, null, "전국 줄은 학교 열쇠가 아니다");
  eq(R("토요휴업일", "20261017").sourceId, null, "버리는 줄은 열쇠가 없다");
  // 학년 칸도 그대로 보여준다 — 「고3만 보는 시험」 을 눈으로 확인하시라고
  eq(R("1회고사", "20261014", { THREE_GRADE_EVENT_YN: "Y" }).grades, [3], "학년 칸을 그대로 읽는다");

  const act = readFileSync("app/schedule/neisActions.js", "utf8");
  eq(/export async function peekNeis/.test(act), true, "나이스에 그 자리에서 물어보는 자리가 있다");
  eq(/const x = explainRow\(r, school\);/.test(act), true, "판정은 lib/neis 한 곳에서만");
  // **아무것도 저장하지 않는다** — 보기만 하는 자리다
  const peek = act.slice(act.indexOf("export async function peekNeis"));
  eq(/\.(insert|update|upsert|delete)\(/.test(peek.slice(0, peek.indexOf("\n}"))), false,
     "보기만 하고 저장하지 않는다");
  const pg = readFileSync("app/neis/page.jsx", "utf8");
  eq(/<NeisPeek/.test(pg), true, "화면이 있다");
  eq(/키 없음|인증키/.test(act), true, "키가 없으면 무엇을 하라고 말해준다");
  const menu = readFileSync("lib/menu.js", "utf8");
  eq(/href: "\/neis", key: "neis"/.test(menu), true, "메뉴에 있다");
}

if (fail) { console.log("\n❌ 일정 합치기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 일정 합치기 통과");
