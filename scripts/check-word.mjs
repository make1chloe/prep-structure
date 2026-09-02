/** 단어 통과 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  가짜 DB 를 끼워 lib/word.js 를 부르고 나온 값을 센다.
 *
 *  보는 것
 *   ① 통과선  아이별 → 교재별 → 학원 방식줄 → 학원 기본 90
 *   ② 개수    **틀린 개수 + 전체 개수**로 센다. 맞은 개수는 세어 나온 값을 그대로 쓴다
 *   ③ 값 없음 「안 봤다」와 「0점」을 가른다 — 리포트에 줄이 안 선다
 *   ④ 멈춤    단어 교재를 멈추면 시험도 멈춘다
 *   ⑤ 미통과  늦귀가 사유 · 재시험 대상으로 이어진다. **세지 말고 부르기만**
 *   ⑥ 한 곳   통과 판정 SQL 을 lib/word.js 밖에서 부르지 않는다
 *
 *  ⚠️ DB 쪽 판단(quiz_passed·quiz_for_report·style_for …)이 **맞게 세는지**는
 *     여기가 아니라 `scripts/check-quiz.mjs` 가 진짜 DB 로 확인한다.
 *     여기는 **lib 이 그 판단을 다시 만들지 않는가**를 본다. 둘 다 있어야 한다.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ACADEMY_CUT, styleOf, cutFor, testOn, testsToday,
  wordPass, reportLines, failedToday, lateReasonText,
} from "../lib/word.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

/** ⚠️ `v2.style_for` 는 짝이 없어도 **칸이 전부 NULL 인 줄을 하나** 뱉는다 (진짜 DB 로 확인함).
 *    가짜 DB 도 똑같이 흉내 내야 이 함정을 검사할 수 있다 — 빈 배열로 두면 검사가 헛돈다. */
const NULL_STYLE = { id: null, student_id: null, book_id: null, round: null, kind: null,
  mc_meaning: null, sa_meaning: null, mc_word: null, sa_word: null, first_hint: null,
  units_per: null, s_way: null, cut_pct: null, style_text: null };

const STYLE = (o) => ({ ...NULL_STYLE, id: "st1", kind: "word", round: 1,
  mc_meaning: 50, sa_meaning: 50, mc_word: 0, sa_word: 0, first_hint: false,
  cut_pct: 90, style_text: "객관식 뜻 50% · 주관식 뜻 50%", ...o });

/** 가짜 DB — 무엇을 물어봤는지 남기고, 미리 정한 줄을 돌려준다 */
function fakeDb(fx = {}) {
  const seen = [];
  return { seen, async query(sql, p) {
    seen.push({ sql, p });
    if (sql.includes("v2.style_for"))         return { rows: [fx.style ?? NULL_STYLE] };
    if (sql.includes("v2.word_test_on"))      return { rows: [{ ok: fx.testOn ?? false }] };
    if (sql.includes("v2.word_tests_today"))  return { rows: fx.tests ?? [] };
    if (sql.includes("from v2.quiz q where")) return { rows: fx.quiz ? [fx.quiz] : [] };
    if (sql.includes("v2.quiz_for_report"))   return { rows: fx.report ?? [] };
    if (sql.includes("v2.quiz_failed_today")) return { rows: fx.failed ?? [] };
    // ⚠️ 모르는 SQL 이 오면 **조용히 빈 줄을 주지 않는다.** 빈 줄을 주면
    //    lib 이 엉뚱한 곳을 물어봐도 검사가 초록으로 지나간다
    throw new Error("검사가 모르는 SQL: " + sql.replace(/\s+/g, " ").slice(0, 70));
  } };
}
const asked = (db, s) => db.seen.some((q) => q.sql.includes(s));

console.log("■ 단어 통과 — 실제로 돌려 본다");

console.log("\n  ① 통과선 — 아이별 → 교재별 → 학원 기본 90");
ok("학원 기본 통과선은 90 이다", ACADEMY_CUT === 90, String(ACADEMY_CUT));
{ const db = fakeDb({ style: STYLE({ student_id: "s1", cut_pct: 80 }) });
  const c = await cutFor(db, { studentId: "s1", bookId: "b1", round: 1, kind: "word" });
  ok("아이별 통과선이 학원 기본값을 이긴다", c.pct === 80 && c.from === "student", JSON.stringify(c)); }
{ const db = fakeDb({ style: STYLE({ book_id: "b1", cut_pct: 85 }) });
  const c = await cutFor(db, { studentId: "s1", bookId: "b1" });
  ok("아이 것이 없으면 교재 것", c.pct === 85 && c.from === "book", JSON.stringify(c)); }
{ const db = fakeDb({ style: STYLE({}) });
  const c = await cutFor(db, { studentId: "s1" });
  ok("교재 것도 없으면 학원 방식줄", c.pct === 90 && c.from === "academy", JSON.stringify(c)); }
{ const db = fakeDb({ style: NULL_STYLE });
  const c = await cutFor(db, { studentId: "s1", round: 9 });
  ok("방식줄이 하나도 없으면 학원 기본 90", c.pct === ACADEMY_CUT && c.from === "default", JSON.stringify(c)); }
{ const db = fakeDb({ style: NULL_STYLE });
  ok("⚠️ 짝 없는 NULL 한 줄을 「있다」로 읽지 않는다 (줄 수는 1이다)",
     (await styleOf(db, { studentId: "s1", round: 9 })) === null); }
{ const db = fakeDb({ style: STYLE({ round: 2, mc_meaning: 0, sa_meaning: 100,
    style_text: "주관식 뜻 100%" }) });
  const s = await styleOf(db, { studentId: "s1", round: 2 });
  ok("방식 말은 SQL(style_text)이 준 것을 그대로 쓴다", s.text === "주관식 뜻 100%", s.text);
  ok("회독이 오르면 주관식 비율이 오른다 (2회독 주뜻 100)",
     s.mix.saMeaning === 100 && s.mix.mcMeaning === 0, JSON.stringify(s.mix)); }

console.log("\n  ② 개수 — 틀린 개수 + 전체 개수 (맞은 개수가 아니다)");
{ const db = fakeDb({ quiz: { id: "q1", kind: "word", state: "taken", total: 20, wrong: 2,
    cut_pct: 90, harder: false, correct: 18, passed: true, pct: "90" } });
  const r = await wordPass(db, "q1");
  ok("틀린 2 · 전체 20 → 맞은 18 (세어 나온 값을 그대로 쓴다)",
     r.total === 20 && r.wrong === 2 && r.correct === 18, JSON.stringify(r));
  ok("통과 · 90% · 리포트에 나간다", r.passed === true && r.pct === 90 && r.shown === true,
     JSON.stringify([r.passed, r.pct, r.shown])); }
{ // ⚠️ 일부러 어긋나게 뒀다 — 20/2 · 통과선 90 이면 **다시 세면 통과**인데 SQL 은 미통과라 한다.
  //    lib 이 판정을 JS 로 두 벌 만들면 여기서 곧바로 깨진다 (원칙 1 지킴막이).
  const db = fakeDb({ quiz: { id: "q2", kind: "word", state: "taken", total: 20, wrong: 2,
    cut_pct: 90, harder: false, correct: 18, passed: false, pct: "90" } });
  const r = await wordPass(db, "q2");
  ok("판정을 JS 가 다시 하지 않는다 — SQL 이 미통과라 하면 미통과다 (20/2·통과선 90 인데도)",
     r.passed === false, JSON.stringify([r.pct, r.cutPct, r.passed])); }

console.log("\n  ③ 값이 없으면 — 「안 봤다」와 「0점」은 다르다");
{ const db = fakeDb({ quiz: { id: "q3", kind: "word", state: "planned", total: null, wrong: null,
    cut_pct: 90, harder: false, correct: null, passed: null, pct: null } });
  const r = await wordPass(db, "q3");
  ok("아직 안 봤으면 통과도 미통과도 아니다 (null)", r.passed === null, JSON.stringify(r.passed));
  ok("⚠️ 0% 로 치지 않는다 — pct 는 null 이다", r.pct === null, JSON.stringify(r.pct));
  ok("리포트에 줄이 안 선다", r.shown === false && r.why === "아직 안 봤다", JSON.stringify([r.shown, r.why])); }
{ const db = fakeDb({ quiz: { id: "q4", kind: "word", state: "taken", total: 20, wrong: null,
    cut_pct: 90, harder: false, correct: null, passed: null, pct: null } });
  const r = await wordPass(db, "q4");
  ok("틀린 개수를 안 적었으면 안 나간다", r.shown === false && r.why === "틀린 개수를 안 적었다",
     JSON.stringify([r.shown, r.why])); }
{ const db = fakeDb({ quiz: { id: "q5", kind: "word", state: "taken", total: null, wrong: 3,
    cut_pct: 90, harder: false, correct: null, passed: null, pct: null } });
  const r = await wordPass(db, "q5");
  ok("전체 개수를 안 적었으면 안 나간다 (내신은 볼 때 정해진다)",
     r.shown === false && r.why === "전체 개수를 안 적었다", JSON.stringify([r.shown, r.why])); }
{ const db = fakeDb({ quiz: { id: "q6", kind: "word", state: "taken", total: 0, wrong: 0,
    cut_pct: 90, harder: false, correct: 0, passed: null, pct: null } });
  const r = await wordPass(db, "q6");
  ok("전체 0 문항이면 나눌 수가 없다 — 안 나간다", r.shown === false, JSON.stringify([r.shown, r.why])); }
{ const db = fakeDb({ quiz: null });
  ok("없는 판은 null 이다 (quiz_passed 만으로는 「없다」와 「값 없다」를 못 가른다)",
     (await wordPass(db, "없음")) === null); }

console.log("\n  ④ 교재를 멈추면 시험도 멈춘다 (원장님 확정)");
{ const db = fakeDb({ testOn: false });
  const yes = await testOn(db, { studentId: "s1", bookId: "b1" });
  ok("멈춘 교재는 오늘 시험을 안 본다", yes === false);
  ok("멈춤 판단은 SQL(word_test_on)에 물어본다", asked(db, "v2.word_test_on")); }
{ const db = fakeDb({ testOn: true });
  ok("안 멈춘 교재는 본다", (await testOn(db, { studentId: "s1", bookId: "b1" })) === true); }
{ const db = fakeDb({ tests: [{ book_id: "b1", book_name: "능률VOCA 어원편" }] });
  const t = await testsToday(db, "s1");
  ok("오늘 목록은 SQL 이 준 줄만 돌려준다 (멈춘 교재는 SQL 이 뺀다)",
     t.length === 1 && t[0].bookName === "능률VOCA 어원편", JSON.stringify(t)); }
{ const db = fakeDb({ tests: [] });
  ok("멈추면 목록이 빈다 — lib 이 줄을 지어내지 않는다",
     (await testsToday(db, "s1")).length === 0); }

console.log("\n  ⑤ 리포트 · 미통과 → 늦귀가 · 재시험");
{ const db = fakeDb({ report: [
    { part: "오늘 본 것", kind: "word", scope: "능률VOCA · DAY 12", total: 20, wrong: 2, pct: "90", passed: true },
    { part: "다음 시간", kind: "sentence", scope: "공영2 2과 본문", total: 14, wrong: null, pct: null, passed: null }] });
  const r = await reportLines(db, "sheet1");
  ok("리포트 줄은 SQL(quiz_for_report)이 걸러 준 것뿐이다", r.length === 2 && asked(db, "v2.quiz_for_report"));
  ok("「다음 시간」 줄은 결과가 비어 있다", r[1].wrong === null && r[1].passed === null, JSON.stringify(r[1])); }
{ const db = fakeDb({ report: [] });
  ok("개수를 안 적은 시험은 줄이 아예 안 온다 — lib 이 빈 줄을 만들지 않는다",
     (await reportLines(db, "sheet1")).length === 0); }
{ const db = fakeDb({ failed: [{ quiz_id: "q9", kind: "word", scope: "능률VOCA", pct: "83" }] });
  const f = await failedToday(db, "sheet1");
  ok("미통과를 앱이 세어 준다 — 원장님이 찾지 않는다", f.length === 1 && asked(db, "v2.quiz_failed_today"));
  ok("재시험 대상에 판 id 가 실려 온다", f[0].quizId === "q9", JSON.stringify(f[0]));
  ok("늦귀가 사유 한 줄", lateReasonText(f) === "단어 능률VOCA 83% 재시험", lateReasonText(f)); }
{ const f = [{ label: "단어 능률VOCA", pct: 83 }, { label: "문장 공영2 2과", pct: 71 }];
  ok("미통과가 둘이면 한 줄에 잇는다",
     lateReasonText(f) === "단어 능률VOCA 83% · 문장 공영2 2과 71% 재시험", lateReasonText(f)); }
ok("미통과가 없으면 사유가 **없다** (빈 글자를 주면 사유 없는 늦귀가가 선다)",
   lateReasonText([]) === null && lateReasonText(undefined) === null);

console.log("\n■ 판정하는 곳이 하나뿐인가 — 파일을 훑는다");
const walk = (d, out = []) => { for (const f of readdirSync(d)) {
  if (["node_modules", ".next", ".git", "backup", "scripts", "supabase", "public"].includes(f)) continue;
  const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
    : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
const files = walk(".").filter((f) => !f.endsWith("lib/word.js"));
const callers = files.filter((f) => /v2\.(quiz_passed|quiz_correct|quiz_for_report|quiz_failed_today|word_test_on|word_tests_today|style_for|style_text)/
  .test(readFileSync(f, "utf8")));
ok("통과·멈춤·방식 SQL 을 lib/word.js 밖에서 부르지 않는다", callers.length === 0, callers.join(" "));
const graders = files.filter((f) => /(cut_?pct|통과선)\s*(<=|<|>=|>)|(<=|<|>=|>)\s*(cut_?pct|통과선)/i
  .test(readFileSync(f, "utf8")));
ok("통과선을 JS 로 다시 비교하는 자리가 없다", graders.length === 0, graders.join(" "));

console.log(`\n■ 단어 통과 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
