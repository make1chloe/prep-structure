/**
 * **학교·학년은 한 곳에서만 견준다** (원장님, 2026-08-09 — 「시험기간이
 * 이상해. 결석예정자도 학사일정과 다르고. 초반에 잘못 잡은 계획이 지금까지
 * 영향을 미쳐서 누더기처럼 수정하는 중이 아닌가」).
 *
 * 다시 짜지 않고 **판단만 모았다.** 표(exam_periods · tasks · attendance)는
 * 멀쩡했고, 문제는 「이 아이가 이 시험을 보는가」 를 여덟 군데에서 각자
 * 답하던 것이었다. 다시 짜도 화면이 각자 견주면 똑같아진다.
 *
 * 그래서 이 검사가 하는 일은 하나다 — **다시 흩어지지 못하게 막는 것.**
 *
 * 쓰는 법:  node scripts/check-who.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { sameSchool, sameGrade, takesExam, inTarget, studentsOfExam } from "../lib/who.js";
import { kindOf } from "../lib/neis.js";

let bad = 0;
const read = (f) => readFileSync(f, "utf8");
const say = (m) => { console.log(`  ✗ ${m}`); bad = 1; };
const ok = (m) => console.log(`  ${m}`);
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    say(`${what}\n     나온 것: ${JSON.stringify(got)}  바란 것: ${JSON.stringify(want)}`);
  } else ok(what);
};

console.log("== 같은 학교를 같다고 보나 ==");
/**
 * 이 한 줄이 이번 버그의 전부였다. 아이는 손으로 적은 「인천신정중학교」,
 * 시험 회차는 나이스가 준 「신정중」. `===` 로 견주니 거짓이 되어 **그 아이가
 * 시험기간에서도 결석예정에서도 성적 미입력에서도 통째로 빠졌다.**
 */
for (const [a, b] of [
  ["인천신정중학교", "신정중"],
  ["신정중학교", "신정중"],
  ["연수여자고등학교", "연수여고"],
  ["인천 해송 고등학교", "해송고"],
]) {
  if (!sameSchool(a, b)) say(`「${a}」 와 「${b}」 를 다른 학교로 봅니다`);
}
if (!bad) ok("줄임말·지역·띄어쓰기가 달라도 같은 학교로 봅니다");
eq(sameSchool("신정중", "박문중"), false, "다른 학교는 다르다고 봅니다");
eq(sameSchool("", "신정중"), false, "학교가 비어 있으면 아무 학교도 아닙니다");

console.log("\n== 같은 학년을 같다고 보나 ==");
eq([sameGrade("중2", "중 2"), sameGrade("중학교 2학년", "중2"), sameGrade("중2", "중3")],
   [true, true, false], "「중2」 · 「중 2」 · 「중학교 2학년」 이 한 학년");

console.log("\n== 누가 이 시험을 보나 ==");
const 학생 = { id: "a", name: "김서은", school: "인천신정중학교", grade: "중2" };
const 남 = { id: "b", name: "박지호", school: "박문중", grade: "중2" };
const 형 = { id: "c", name: "이하람", school: "신정중학교", grade: "중3" };

eq(takesExam(학생, { school: "신정중", name: "1학기 기말고사" }), true,
   "학교만 적힌 회차 — 그 학교면 학년을 안 가린다 (나이스는 학년 구분 없이 한 줄)");
eq(takesExam(남, { school: "신정중" }), false, "다른 학교 아이는 안 본다");
eq(takesExam(형, { school: "신정중", grade: "중2" }), false, "학년이 적혀 있으면 학년도 맞아야 한다");
eq(takesExam(학생, { school: "전국", grade: "중2" }), true, "전국(모의고사)은 학교를 안 가린다");
/**
 * **모르는 것을 「본다」 로 치면 안 된다.** 학교를 안 적어둔 아이에게
 * 결석 예정이 찍히면 그건 지우러 다녀야 하는 일이 된다.
 */
eq(takesExam({ id: "x" }, { school: "신정중" }), false, "학교를 모르는 아이는 안 본다고 본다");
eq(studentsOfExam([학생, 남, 형], { school: "신정중" }).map((s) => s.name),
   ["김서은", "이하람"], "그 학교 아이만 추린다");

console.log("\n== 일정 대상도 같은 규칙인가 ==");
eq([inTarget(학생, { school: "신정중" }), inTarget(학생, {}), inTarget(남, { grade: "중2" })],
   [true, true, true], "비운 칸은 안 가린다");
eq(inTarget(학생, { school: "신정중", grade: "중3" }), false, "학년까지 적으면 둘 다 맞아야 한다");

console.log("\n== 견주는 자리가 다시 흩어지지 않았나 ==");
/**
 * 새 화면을 만들며 `s.school === e.school` 을 다시 쓰기 쉽다. 그러면 그
 * 화면에서만 아이가 조용히 빠진다. 여기서 막는다.
 *
 * 「전국」 은 학교 이름이 아니라 **표시**라 그냥 견주는 것이 맞다 — 그것만 봐준다.
 */
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const full = `${dir}/${f}`;
    if (statSync(full).isDirectory()) { if (f !== "node_modules") walk(full); }
    else if (/\.jsx?$/.test(f)) files.push(full);
  }
})("app");
["lib"].forEach((d) => {
  for (const f of readdirSync(d)) if (/\.jsx?$/.test(f)) files.push(`${d}/${f}`);
});

const raw = [];
for (const f of files) {
  if (f === "lib/who.js" || f === "lib/schoolName.js") continue;   // 규칙이 사는 곳
  const src = read(f);
  for (const m of src.matchAll(/\.(school|grade)\s*(?:\|\|\s*""\s*\)?\s*)?===\s*([^;\n]{0,40})/g)) {
    if (/"전국"|'전국'/.test(m[2])) continue;                       // 표시와 견주는 것
    raw.push(`${f}:${src.slice(0, m.index).split("\n").length}  ${m[0].trim().slice(0, 50)}`);
  }
}
eq(raw, [], "학교·학년을 글자로 견주는 자리 (lib/who 를 쓰세요)");

// 규칙이 두 벌이 되지 않았나 — 예전에 taskAudience 가 자기 것을 갖고 있었다
const dup = files.filter((f) => f !== "lib/schoolName.js" && /function schoolKey\(/.test(read(f)));
eq(dup, [], "학교 열쇠를 만드는 함수는 lib/schoolName 하나뿐");

console.log("\n== 모의고사가 결석 예정에 새어 들어오지 않나 ==");
/**
 * 원장님 (2026-08-08) — 「모의고사는 전날등원 안 해 학교시험만 그래」
 *
 * 전에는 뺀 적이 없는데도 안 걸렸다 — 모의고사 회차의 학교가 「전국」 이라
 * 위의 `===` 가 늘 거짓이었기 때문이다. **우연히** 맞고 있었던 것이라,
 * 견주는 규칙을 고치는 순간 통째로 새어 들어온다.
 */
const sched = read("lib/schedule.js");
eq(/\.filter\(\(e\) => needsScope\(e\)\)/.test(sched), true,
   "반 회차 계산이 모의고사를 뺀다");
eq(/takesExam/.test(sched), true, "반 회차 계산도 같은 규칙을 쓴다");

console.log("\n== 시험이 아닌 것을 시험 회차로 만들지 않나 ==");
/**
 * 원장님 (2026-08-09) — 「해송고 시험이 2학기에 3번이야. 2번이어야 해」
 *
 * 「평가」 만 들어가면 시험으로 봤다. 그래서 수행평가·학업성취도평가가
 * 시험 회차가 되었고, 회차 하나가 생기면 **네 군데로 번진다** —
 * 결석 예정 · 전날 등원 · 시험범위 배지 · 성적 미입력 배지.
 */
for (const [name, want] of [
  ["2학기 중간고사", "exam"],
  ["2학기 기말고사", "exam"],
  ["제1차 지필평가", "exam"],
  ["2차시험", "exam"],
  ["수행평가", "event"],
  ["학업성취도평가", "event"],
  ["기초학력진단평가", "event"],
  ["졸업고사", "event"],
]) {
  const got = kindOf(name);
  if (got !== want) say(`「${name}」 를 ${got} 로 봅니다 (${want} 여야 합니다)`);
}
if (!bad) ok("중간·기말·지필만 시험 회차가 됩니다 (수행·성취도·진단은 일정으로 남습니다)");

console.log("\n== 등록해야 학사일정에 붙나 ==");
/**
 * 원장님 (2026-08-09) — 「설문지 제출 후 등록까지 해야 학사일정에 반영되게」
 *
 * 설문지는 아직 우리 아이가 아니다. 들어올 때마다 학교를 받아오면 안 다니는
 * 학교로 불어나고 나이스 한도도 쓴다. 반대로 등록했는데 학교가 없으면 그
 * 아이만 시험 일정도 시험범위도 전날 등원도 없이 조용히 빠진다.
 */
const consult = read("app/consult/actions.js");
eq(/attachSchool/.test(consult), true, "등록할 때 학교를 붙인다");
eq(/attachSchool/.test(read("app/apply/actions.js")), false, "설문지 제출만으로는 안 붙인다");
// 같은 이름이 여럿이면 앱이 고르면 안 된다 — 틀린 학교는 없는 것보다 나쁘다
eq(/rows\.length !== 1/.test(consult), true, "나이스에 여럿이면 원장님께 고르시라고 한다");

if (bad) { console.log("\n❌ 위 항목을 고쳐주세요"); process.exit(1); }
console.log("\n✅ 학교·학년 견주기 통과");
