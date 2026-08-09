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
import { matchExam, absorbable } from "../lib/exams.js";
import { kindOf } from "../lib/neis.js";
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
  // 쪼개져 남은 옛 줄을 흡수한다 — 안 그러면 같은 시험이 네 줄로 남는다
  eq(/const inside = absorbable\(e, pool, keepId, inUse\);/.test(act), true,
     "기간 안에 들어앉은 옛 줄을 모은다 (규칙은 lib/exams 한 곳)");
  // 이미 잘못 붙어 있던 것은 다시 받아와도 저절로 안 떨어진다 — 떼어준다
  eq(/examKind\(x\) !== examKind\(\{ name: x\.neis_name \}\)/.test(act), true,
     "종류가 다른 채 붙어 있던 것을 떼어낸다");
}

console.log("\n== 쪼개져 남은 옛 줄만 골라 모으나 ==");
{
  // 해송고 2학기 중간이 날마다 세 줄로 쪼개져 있던 그대로
  const pool = [
    { id: "d1", school: "해송고", name: "2학기 중간고사", grade: "고2", source: "neis",
      from_date: "2026-10-13", to_date: "2026-10-13" },
    { id: "d2", school: "해송고", name: "2학기 중간고사", grade: "고2", source: "neis",
      from_date: "2026-10-14", to_date: "2026-10-14" },
    { id: "d3", school: "해송고", name: "2학기 중간고사", grade: "고2", source: "neis",
      from_date: "2026-10-15", to_date: "2026-10-15" },
    // 같은 기간 안에 있지만 **다른 것들**
    { id: "mock", school: "해송고", name: "전국연합학력평가", source: "neis",
      from_date: "2026-10-14", to_date: "2026-10-14" },
    { id: "hand", school: "해송고", name: "2학기 중간고사", grade: "고2", source: null,
      from_date: "2026-10-14", to_date: "2026-10-14" },
    { id: "g3", school: "해송고", name: "2학기 중간고사", grade: "고3", source: "neis",
      from_date: "2026-10-15", to_date: "2026-10-15" },
    { id: "other", school: "신정중", name: "2학기 중간고사", grade: "중2", source: "neis",
      from_date: "2026-10-14", to_date: "2026-10-14" },
  ];
  const cand = { school: "해송고", name: "2학기 중간고사", grade: "고2",
                 from_date: "2026-10-13", to_date: "2026-10-16" };
  eq(absorbable(cand, pool, "d1").map((x) => x.id), ["d2", "d3"], "쪼개진 나머지 날만 모은다");
  // **원장님이 손으로 적으신 줄** · **모의고사** · **다른 학년** · **다른 학교** 는 그대로
  eq(absorbable(cand, pool, "d1", new Set(["d2"])).map((x) => x.id), ["d3"],
     "성적·범위가 붙은 줄은 안 지운다");
  // 기간 밖으로 한 칸이라도 나가면 다른 시험이다
  const short = { ...cand, to_date: "2026-10-14" };
  eq(absorbable(short, pool, "d1").map((x) => x.id), ["d2"], "기간 안에 온전히 들어앉은 것만");
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

if (fail) { console.log("\n❌ 일정 합치기에 어긋난 것이 있습니다."); process.exit(1); }
console.log("\n✅ 일정 합치기 통과");
