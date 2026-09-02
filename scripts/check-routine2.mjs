/** 숙제 차리기 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  가짜 DB 를 끼워 `lib/routine.js` 를 부르고, 마지막에 **진짜 DB 로도 한 번** 돌린다.
 *
 *  ⚠️ 이름이 겹친다 — `scripts/check-routine.mjs` 는 루틴 **표**를 본다. 여기는 **차리기**를 본다.
 *
 *  보는 것
 *   ① 커서    `v2.cursor_of` 에 **물어본다.** JS 로 다시 세지 않는다 (원칙 1)
 *   ② 워크북  **대단원 통째**(0062). 소단원마다 쪼개면 쓰작2 가 열 배로 잘게 나간다
 *   ③ 차례    대단원 기준이면 **본책 전부 → 워크북 전부**(㊻ 검사 Q)
 *   ④ 분량    `lib/chunk.js` 를 부른다. 갯수가 늘리는 것은 **항목 수가 아니라 분량**(㊹)
 *   ⑤ 안 민다 많으면 **말만** 한다. 교재를 밀지 않고 상한도 없다 (㊺-a)
 *   ⑥ 멈춤    교재멈춤·숙제멈춤 — **조용히 0줄로 비우지 않는다** (⑬)
 *   ⑦ 빈 회차 세 묶음이 다 비면 건너뛰고, 그래도 비면 **밝힌다** (확정 ④ 붙임)
 *   ⑧ ✕      「다음 회차」 대신 **그 단원 다시** (⑨-a)
 *   ⑨ 메모    항목 대신 한 줄 메모가 그날의 ②. **그 교재만** 올라간다 (㊳)
 *   ⑩ 루틴    학생루틴이 기본루틴을 대신한다. **예습은 다음 덩어리**를 가리킨다 (㉒ · ⑨)
 *
 *  ⚠️ 아래 줄들은 **실제로 난 사고를 재현한다.** 지우면 그 사고가 다시 난다 (2026-09-02 검증):
 *   · 이름이 같아도 줄 차례가 끊기면 다른 덩어리 — 안 그러면 한 회차에 CHAPTER 넷이 나갔다
 *   · 예습이 오늘 단원을 가리키면 안 된다 — 실측 16카드가 학원 줄과 글자까지 같았다
 *   · 안 이어진 줄의 **사이에 낀 쪽**을 내지 않는다 — 62쪽이 나갔다(진짜 30쪽)
 *   · 분량을 줄이면 「많습니다」의 숫자도 따라온다 — 한 판에 숫자가 둘이면 안 된다
 *   · 분량 칸을 **비우면** 통째로 낸다 — 1쪽으로 쪼그라들었다
 *   · 지난 날짜 판에서 「다 끝냈다」고 지어내지 않는다 — 커서는 오늘 것뿐이다
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import {
  BUSY_PAGES, SLOTS, STOP,
  isPreview, slotsOf, lumpKey, lumpLabel, lumpsOf, amountOf,
  layout, isEmpty, emptyWhy, stopOf, pickRoutine, groupChecks,
  booksOf, cursorOf, chapterUnits, routineOf, checksOf, partsOf,
  routineNext, loadOf, saysOf, memoCovers,
} from "../lib/routine.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

// ── 본보기 자료 — 그래머인사이드3 Chapter 04 부정사 (실측 14줄) ──────────────
const CH = "Chapter 04 부정사";
const U = (id, sub, act, wb, sort, a, b, q = null) => ({
  id, chapter: CH, mid: (wb ? "워크북 " : "") + sub, sub, activity: act,
  is_workbook: wb, sort, page_start: a, page_end: b, q_count: q, q_range: null,
  label: `${CH} › ${sub}${wb ? " · 워크북" : ""}`, prog: null,
});
const UNITS = [
  U("b1", "Unit 01 명사적 용법의 to부정사", "Practice", false, 151, 50, 51),
  U("w1", "Unit 01 명사적 용법의 to부정사", "워크북", true, 152, 35, 37),
  U("b2", "Unit 02 형용사적 용법", "Practice", false, 153, 52, 53),
  U("w2", "Unit 02 형용사적 용법", "워크북", true, 154, 38, 40),
  U("b3", "Unit 03 의미상의 주어", "Practice", false, 155, 54, 55),
  U("w3", "Unit 03 의미상의 주어", "워크북", true, 156, 41, 43),
  U("b4", "Unit 04 목적격 보어", "Practice", false, 157, 56, 57),
  U("w4", "Unit 04 목적격 보어", "워크북", true, 158, 44, 46),
  U("b5", "Unit 05 to부정사 구문", "Practice", false, 159, 58, 59),
  U("w5", "Unit 05 to부정사 구문", "워크북", true, 160, 47, 49),
  U("bR", "Review Test", "Review", false, 162, 62, 65, 33),
  U("wR", "Review Test", "워크북", true, 163, 50, 52, 25),
];
/** 다른 교재의 단원 줄 — **id 가 겹치면 안 된다.** 겹치면 분량이 한 벌만 세어진다 */
const OTHER = (tag) => UNITS.map((u) => ({ ...u, id: tag + u.id }));
const BOOK = (o = {}) => ({
  sbId: "sb1", bookId: "bk1", name: "그래머인사이드3", area: "문법", bookState: "active",
  chunkDepth: "sub", orderBasis: "chapter", round: 1, perSession: 2,
  stopMode: STOP.RUNNING, stopWhy: null, ...o,
});

// 문법 영역 루틴 (실측 8줄)
const R = (name, place, sort) => ({ src: "area", area: "문법", item_id: "i" + sort, name, place, sort,
  method: null, tool: null, checks: null, gate_prev: false, count_n: null });
const GRAMMAR = [
  R("문답노트", "both", 1), R("구두테스트", "class", 2), R("셀프테스트(녹음)", "home", 3),
  R("문제풀기", "both", 4), R("숙제채점", "class", 5), R("오답 스스로 고치기", "class", 6),
  R("오답노트", "both", 7), R("단원평가 대비 복습", "home", 8),
];
// 독해 영역 루틴에는 **예습이 있다** (실측 「교재예습」)
const READING = [
  { ...R("교재예습", "home", 1), area: "독해", item_id: "r1" },
  { ...R("문장훈련", "class", 4), area: "독해", item_id: "r4" },
];

/** 가짜 DB — 무엇을 물어봤는지 남긴다. ⚠️ 모르는 SQL 이 오면 **조용히 빈 줄을 주지 않는다** */
function fakeDb(fx = {}) {
  const seen = [];
  return { seen, async query(sql, p) {
    seen.push({ sql, p });
    if (sql.includes("v2.today()")) return { rows: [{ d: fx.today ?? "2026-09-02" }] };
    if (sql.includes("v2.student_book")) return { rows: fx.books ?? [] };
    if (sql.includes("v2.cursor_of")) return { rows: fx.cursor ? [fx.cursor] : [] };
    if (sql.includes("i.slot = 'check'")) return { rows: fx.checks ?? [] };
    if (sql.includes("min(x.sort) over")) return { rows: fx.after ?? [] };   // afterUnits — 예습이 갈 다음 자리
    if (sql.includes("from v2.units u")) return { rows: fx.units ?? [] };
    if (sql.includes("v2.area_routine")) return { rows: fx.routine ?? [] };
    if (sql.includes("v2.progress_part")) return { rows: fx.parts ?? [] };
    throw new Error("검사가 모르는 SQL: " + sql.replace(/\s+/g, " ").slice(0, 70));
  } };
}
const asked = (db, s) => db.seen.some((q) => q.sql.includes(s));
const ROW = (o = {}) => ({
  sb_id: "sb1", book_id: "bk1", book_name: "그래머인사이드3", area: "문법", book_state: "active",
  chunk_depth: "sub", order_basis: "chapter", round: 1, per_session: 2,
  unit_test: null, unit_test_n: null,
  stop_mode: "running", stop_until: null, stop_exam_id: null, exam_name: null, exam_end: null, ...o,
});
const CUR = (o = {}) => ({ round: 1, chapter: CH, is_workbook: false, left_in_chapter: 12, ...o });

// ────────────────────────────────────────────────────────────────
console.log("■ ① 커서 — **물어본다.** JS 로 다시 세지 않는다");
{
  const db = fakeDb({ cursor: CUR() });
  const c = await cursorOf(db, "s1", "bk1");
  ok("커서는 v2.cursor_of 에 물어본다", asked(db, "v2.cursor_of"));
  ok("(회독, 대단원, 갈래)를 그대로 받는다", c.round === 1 && c.chapter === CH && c.isWorkbook === false, JSON.stringify(c));
}
{
  const db = fakeDb({ cursor: CUR({ chapter: null, is_workbook: null, left_in_chapter: 0 }) });
  const c = await cursorOf(db, "s1", "bk1");
  ok("교재를 다 끝냈으면 대단원이 없다 (지어내지 않는다)", c.chapter === null && c.leftInChapter === 0);
}

console.log("\n■ ② 워크북은 **대단원 통째** (0062) — 안 지키면 쓰작2 가 열 배로 잘게 나간다");
{
  const wb = UNITS.filter((u) => u.is_workbook);
  const l = lumpsOf(wb, { orderBasis: "chapter", chunkDepth: "sub" });
  ok("워크북 6줄이 **한 덩어리**다", l.length === 1, `덩어리 ${l.length}개`);
  ok("그 덩어리는 p.35~52 · 18쪽이다 (실측)", l[0].pages === 18, String(l[0]?.pages));
  ok("줄 여섯을 다 데리고 간다", l[0].unitIds.length === 6, String(l[0]?.unitIds.length));
}
{
  const wb = UNITS.filter((u) => u.is_workbook);
  const l = lumpsOf(wb, { orderBasis: "sub", chunkDepth: "sub" });
  ok("⚠️ 소단원 기준이면 워크북도 소단원마다 나뉜다 (㉙ 「나란히」)", l.length === 6, `덩어리 ${l.length}개`);
}
{
  const bk = UNITS.filter((u) => !u.is_workbook);
  const l = lumpsOf(bk, { orderBasis: "chapter", chunkDepth: "sub" });
  ok("본책은 소단원마다 한 덩어리다", l.length === 6, `덩어리 ${l.length}개`);
  ok("첫 덩어리는 Unit 01 · 2쪽", l[0].pages === 2 && /Unit 01/.test(l[0].label), l[0].label);
}
{
  const noSub = [{ ...U("x1", "", "시험대비", false, 12, 21, 26, 35), sub: null, mid: null, label: "CHAPTER 1 › 시험대비" },
                 { ...U("x2", "", "시험대비", false, 13, 27, 30, 20), sub: null, mid: null, label: "CHAPTER 1 › 시험대비2" }];
  const l = lumpsOf(noSub, { orderBasis: "sub", chunkDepth: "sub" });
  ok("⚠️ 소단원 이름이 비면 **줄마다 따로**다 (3800제 49개 CHAPTER 전부가 이 모양)",
     l.length === 2, `덩어리 ${l.length}개`);
}

{
  /** ⚠️⚠️ **한 대단원 안에서 같은 소단원 이름이 되풀이되는 교재** — 어법 서술형 제패 · 어법끝스타트 모양.
   *  이름으로만 묶던 때는 CHAPTER 넷이 **한 덩어리**가 되어 한 회차에 8줄(62쪽)이 나갔다.
   *  화면에는 이름 한 줄만 떠서 원장님이 8줄인 줄 모른 채 저장한다 (2026-09-02 실측). */
  const V = (id, mid, sub, sort, a, b) => ({ id, chapter: "PART 4 준동사", mid, sub, activity: null,
    is_workbook: false, sort, page_start: a, page_end: b, q_count: null, q_range: null,
    label: `PART 4 준동사 › ${sub}`, prog: null });
  const rep4 = [
    V("c15a", "CHAPTER 15", "Unit 1 어법 Point", 1, 26, 28), V("c15b", "CHAPTER 15", "Unit 2 어법 Test", 2, 29, 37),
    V("c16a", "CHAPTER 16", "Unit 1 어법 Point", 3, 50, 51), V("c16b", "CHAPTER 16", "Unit 2 어법 Test", 4, 52, 55),
    V("c17a", "CHAPTER 17", "Unit 1 어법 Point", 5, 64, 65), V("c17b", "CHAPTER 17", "Unit 2 어법 Test", 6, 66, 69),
  ];
  const l = lumpsOf(rep4, { orderBasis: "sub", chunkDepth: "sub" });
  ok("⚠️ 이름이 같아도 **줄 차례가 끊기면 다른 덩어리**다 (CHAPTER 셋이 안 뭉친다)",
     l.length === 6, `덩어리 ${l.length}개`);
  ok("덩어리 차례가 **교재 차례**다 (U1 넷 → U2 넷이 아니라 CH15 → CH16)",
     l.map((x) => x.unitIds[0]).join() === "c15a,c15b,c16a,c16b,c17a,c17b", l.map((x) => x.unitIds[0]).join());
  ok("한 회차(2덩어리)가 CHAPTER 하나 안에 머문다", amountOf(l.slice(0, 2).flatMap((x) => x.units), {}).pages === 12,
     String(amountOf(l.slice(0, 2).flatMap((x) => x.units), {}).pages));
}
{
  // ⚠️ 줄이 셋을 넘으면 **몇 줄인지 같이 띄운다** — 이름만 합치면 8줄인 줄 모르고 저장한다
  ok("덩어리에 든 줄이 셋 이상이면 이름에 줄 수가 붙는다",
     /\(6줄\)/.test(lumpsOf(UNITS.filter((u) => u.is_workbook), { orderBasis: "chapter", chunkDepth: "sub" })[0].label),
     lumpsOf(UNITS.filter((u) => u.is_workbook), { orderBasis: "chapter", chunkDepth: "sub" })[0].label);
}

console.log("\n■ ③ 대단원 기준 차례 — **본책 전부 → 워크북 전부** (㊻ 검사 Q)");
{
  const l = lumpsOf(UNITS, { orderBasis: "chapter", chunkDepth: "sub" });
  let sawWb = false, bad = null;
  for (const x of l) { if (x.isWorkbook) sawWb = true; else if (sawWb) bad = x.label; }
  ok("워크북이 나온 뒤에 같은 대단원의 본책이 또 나오지 않는다", bad === null, bad || "");
}
{
  const l = lumpsOf(UNITS, { orderBasis: "sub", chunkDepth: "sub" });
  ok("소단원 기준이면 본책+워크북이 **한 덩어리에 나란히** 든다",
     l.length === 6 && l[0].unitIds.length === 2, `덩어리 ${l.length} · 첫 덩어리 ${l[0]?.unitIds.length}줄`);
}

console.log("\n■ ④ 분량 — `lib/chunk.js` 를 부른다. 다시 만들지 않는다");
{
  const wb = UNITS.filter((u) => u.is_workbook);
  const a = amountOf(wb, { pages: 6, parts: [] });
  ok("6쪽만 떼어 준다", a.pages === 6 && /p\.35~40/.test(a.label), a.label);
  ok("남은 것을 같이 띄운다 (지난번 어디까지 냈나)", /p\.41~52/.test(a.leftLabel), a.leftLabel);
  ok("조각만 냈으니 「다 덮었다」가 아니다", a.done === false);
}
{
  const wb = UNITS.filter((u) => u.is_workbook);
  const a = amountOf(wb, { pages: null, parts: [] });
  ok("안 정하면 **통째가 기본**이다 — 18쪽", a.pages === 18 && a.done === true, String(a.pages));
}
{
  const noPage = [{ ...U("p0", "Unit 09", "Practice", false, 9, null, null), page_start: null, page_end: null }];
  const a = amountOf(noPage, { pages: 6, parts: [] });
  ok("⚠️ 쪽을 모르면 「다 냈다」라고 답하지 않는다 (chunkPlan 은 0쪽을 「다 냈다」로 읽는다)",
     a.pagesKnown === false && a.done === null, JSON.stringify({ k: a.pagesKnown, d: a.done }));
  ok("모른다고 밝힌다", /쪽수를 모르/.test(a.why), a.why);
}

{
  /** ⚠️⚠️ 가운데 한 줄이 **이미 ○** 라 빠지면 그 쪽은 우리 것이 아니다.
   *  `chunk.js` 의 `lumpOf` 는 가장 앞~가장 뒤를 통째로 잡으므로, 덩이마다 따로 물어봐야 한다. */
  const wb = UNITS.filter((u) => u.is_workbook && u.id !== "w3");   // Unit 03 워크북(p.41~43)만 이미 ○
  const a = amountOf(wb, { pages: null, parts: [] });
  ok("⚠️ 이미 ○ 인 줄의 쪽을 안 삼킨다 — 18쪽이 아니라 **15쪽**", a.pages === 15, String(a.pages));
  ok("범위도 이어 붙이지 않는다 (p.35~52 통째가 아니라 두 도막)",
     a.range === "p.35~40, p.44~52", String(a.range));
  const b = amountOf(wb, { pages: 12, parts: [] });
  ok("⚠️ 12쪽으로 줄여도 **이미 끝낸 p.41~43 이 다시 안 나간다**",
     !b.give.some(([x, y]) => x <= 43 && y >= 41), JSON.stringify(b.give));
}
{
  // ⚠️ 안 이어진 두 줄 — 사이에 낀 **남의 쪽**을 지어내지 않는다 (대전제 0)
  const gap = [U("g1", "Unit 1 어법 Point", "P", false, 1, 26, 28), U("g2", "Unit 2 어법 Test", "P", false, 2, 50, 51)];
  const a = amountOf(gap, { pages: null, parts: [] });
  ok("⚠️ 안 이어진 두 줄은 **5쪽**이다 — p.26~51 통째(26쪽)가 아니다", a.pages === 5, String(a.pages));
  ok("p.29~49 를 지어내지 않는다", a.range === "p.26~28, p.50~51", String(a.range));
  ok("둘 다 냈으니 「이걸로 끝」이다", a.done === true && a.leftLabel === "이걸로 끝", JSON.stringify(a.leftLabel));
  const b = amountOf(gap, { pages: 4, parts: [] });
  ok("4쪽만 내면 앞 도막 3쪽 + 뒤 도막 1쪽이다", b.range === "p.26~28, p.50" && b.pages === 4, String(b.range));
}

console.log("\n■ ④-a ㊹ 갯수가 늘리는 것은 **항목 수가 아니라 분량**이다");
{
  const one = await routineNext(fakeDb({ books: [ROW({ per_session: 1 })], cursor: CUR(), units: UNITS, routine: GRAMMAR }),
                                { studentId: "s1", on: "2026-09-02" });
  const three = await routineNext(fakeDb({ books: [ROW({ per_session: 3 })], cursor: CUR(), units: UNITS, routine: GRAMMAR }),
                                  { studentId: "s1", on: "2026-09-02" });
  const c1 = one.books[0], c3 = three.books[0];
  ok("갯수를 1 → 3 으로 올려도 **항목 수는 그대로**", c1.class.length === c3.class.length && c1.home.length === c3.home.length,
     `학원 ${c1.class.length}→${c3.class.length} · 숙제 ${c1.home.length}→${c3.home.length}`);
  ok("늘어나는 것은 **쪽**이다 (2쪽 → 6쪽)", one.load.pages === 2 && three.load.pages === 6,
     `${one.load.pages} → ${three.load.pages}`);
  ok("항목마다 단원이 보인다 (⑨-a 2번)", /Unit 01/.test(c1.class[0].label), c1.class[0]?.label);
  ok("갯수를 3으로 올리면 그 자리에 세 소단원이 다 뜬다",
     /Unit 01/.test(c3.class[0].label) && /Unit 03/.test(c3.class[0].label), c3.class[0]?.label);
}

console.log("\n■ ⑤ ⚠️ 앱은 **안 민다.** 말만 한다 (㊺-a)");
{
  const big = [ROW(), ROW({ sb_id: "sb2", book_id: "bk2", book_name: "자이스토리 문법 중3" })];
  let turn = 0;
  const db = { seen: [], async query(sql, p) {
    this.seen.push({ sql, p });
    if (sql.includes("v2.today()")) return { rows: [{ d: "2026-09-02" }] };
    if (sql.includes("min(x.sort) over")) return { rows: [] };
    if (sql.includes("v2.student_book")) return { rows: big };
    if (sql.includes("v2.cursor_of")) return { rows: [CUR({ is_workbook: true })] };
    if (sql.includes("i.slot = 'check'")) return { rows: [] };
    if (sql.includes("from v2.units u")) return { rows: OTHER("t" + (turn++)) };
    if (sql.includes("v2.area_routine")) return { rows: GRAMMAR };
    if (sql.includes("v2.progress_part")) return { rows: [] };
    throw new Error("모르는 SQL " + sql.slice(0, 40));
  } };
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02" });
  ok("교재 둘 다 그대로 나간다 — **한 권도 안 밀린다**", plan.books.length === 2 && plan.books.every((b) => b.class.length > 0),
     JSON.stringify(plan.books.map((b) => b.class.length)));
  ok("합쳐 36쪽 (워크북 18쪽 × 2권) — 줄이지 않는다", plan.load.pages === 36, String(plan.load.pages));
  ok("「많습니다」라고 **말만** 한다", plan.says.some((s) => /많습니다/.test(s) && /36쪽/.test(s)), JSON.stringify(plan.says));
  ok("정규 하루 가운데 24쪽을 알고 말한다 (상한이 아니다)", BUSY_PAGES === 24 && plan.says.some((s) => /24쪽/.test(s)));
  ok("⚠️ 「다음으로 미룹니다 · 뺐습니다」 같은 말을 하지 않는다",
     !plan.says.some((s) => /미룹|밀었|뺐|줄였/.test(s)), JSON.stringify(plan.says));
}
{
  // 상한이 없다는 것을 값으로 확인한다 — 999쪽이어도 줄이 안 준다
  const many = Array.from({ length: 8 }, (_, i) => ROW({ sb_id: "s" + i, book_id: "bk" + i, book_name: "책" + i }));
  let k = 0;
  const db = { async query(sql) {
    if (sql.includes("v2.today()")) return { rows: [{ d: "2026-09-02" }] };
    if (sql.includes("min(x.sort) over")) return { rows: [] };
    if (sql.includes("v2.student_book")) return { rows: many };
    if (sql.includes("v2.cursor_of")) return { rows: [CUR({ is_workbook: true })] };
    if (sql.includes("i.slot = 'check'")) return { rows: [] };
    if (sql.includes("from v2.units u")) return { rows: OTHER("m" + (k++)) };
    if (sql.includes("v2.area_routine")) return { rows: GRAMMAR };
    if (sql.includes("v2.progress_part")) return { rows: [] };
    throw new Error("모르는 SQL");
  } };
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02" });
  ok("교재 8권 144쪽이어도 **여덟 권 다 나간다** — 하루 총합 상한이 없다",
     plan.books.length === 8 && plan.books.every((b) => b.class.length > 0) && plan.load.pages === 144,
     `${plan.books.filter((b) => b.class.length).length}권 · ${plan.load.pages}쪽`);
}

{
  /** ⚠️⚠️ **한 판에 숫자가 둘이면 안 된다.** 예전에는 `loadOf` 가 덩어리에 든 줄의 쪽 **전부**를
   *  세어서, 분량을 줄여도 「합쳐 30쪽 … 많습니다」가 그대로 떴다. 원장님은 더 줄일 데를
   *  찾다가 판을 두 번 만진다(대전제 3 반대). 셈은 `amountOf` 한 곳에만 둔다(원칙 1·5). */
  const db = fakeDb({ books: [ROW()], cursor: CUR({ is_workbook: true }), units: UNITS, routine: GRAMMAR });
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02", adjust: { bk1: { pages: 6 } } });
  ok("⚠️ 분량을 6쪽으로 줄이면 **말하는 숫자도 6쪽**이다",
     plan.load.pages === 6 && plan.books[0].amount.pages === 6,
     `load ${plan.load.pages} · amount ${plan.books[0].amount?.pages}`);
  ok("줄였으니 「많습니다」를 **안** 한다", !plan.says.some((t) => /많습니다/.test(t)), JSON.stringify(plan.says));
}
{
  const drop = GRAMMAR.map((r) => r.item_id);
  const db = fakeDb({ books: [ROW()], cursor: CUR({ is_workbook: true }), units: UNITS, routine: GRAMMAR });
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02", adjust: { bk1: { drop } } });
  ok("⚠️ **한 줄도 안 나가는 교재는 0쪽**이다 — 안 나가는 18쪽을 「많다」고 세지 않는다",
     plan.load.pages === 0 && !plan.says.some((t) => /많습니다/.test(t)), String(plan.load.pages));
}
{
  const db = fakeDb({ books: [ROW({ stop_mode: "book_off" })], cursor: CUR({ is_workbook: true }), units: UNITS, routine: GRAMMAR });
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02" });
  ok("교재멈춤 카드도 0쪽이다", plan.load.pages === 0, String(plan.load.pages));
}

console.log("\n■ ⑤-a ⚠️ 화면의 숫자칸을 **비웠을 때** (브라우저는 빈 글자를 준다)");
{
  /** ⚠️ `Number("") === 0` 이라 막지 않으면 `chunkPlan` 이 **1쪽**을 낸다. 실측: 김서은
   *  「어법 서술형 제패 2권」에 pages:"" → p.26 한 쪽만 나갔다. 원장님은
   *  「칸을 비웠으니 통째로 나가겠지」로 읽는다. **null 이 「통째로」다.** */
  const mk = (adj) => routineNext(fakeDb({ books: [ROW()], cursor: CUR({ is_workbook: true }), units: UNITS, routine: GRAMMAR }),
                                  { studentId: "s1", on: "2026-09-02", adjust: { bk1: adj } });
  const none = (await mk({})).books[0];
  const empty = (await mk({ pages: "" })).books[0];
  ok("⚠️ 분량 칸을 비우면 **통째로** 낸다 — 1쪽으로 쪼그라들지 않는다",
     empty.amount.pages === 18 && empty.amount.pages === none.amount.pages,
     `빈칸 ${empty.amount?.pages} vs 안 정함 ${none.amount?.pages}`);
  ok("0 도 「통째로」다 (0쪽짜리 숙제는 없다)", (await mk({ pages: 0 })).books[0].amount.pages === 18);
  ok("갯수 칸과 **같은 문을 지난다** (전에는 둘의 방어가 달랐다)",
     (await mk({ count: "" })).books[0].class.length > 0);
}

console.log("\n■ ⑤-b ⚠️ 지난 날짜 판 — 커서는 **오늘 것뿐**이다 (v2.cursor_of 에 날짜 칸이 없다)");
{
  /** ⚠️ 실측: 구도은을 2026-08-01 로 돌리면 교재 3권 전부가 「지금 회독을 다 끝냈습니다」로 떴다.
   *  그날 한창 하고 있던 교재들이다 — 배정이 그 뒤에 끝났을 뿐인데 앱이 **지어냈다**(대전제 0). */
  const fx = { books: [ROW()], cursor: CUR({ chapter: null, is_workbook: null, left_in_chapter: 0 }),
               units: [], routine: GRAMMAR };
  const past = await routineNext(fakeDb(fx), { studentId: "s1", on: "2026-08-01" });
  ok("지난 날짜 판이라고 밝힌다", past.stale === true && past.asOf === "2026-09-02",
     JSON.stringify({ stale: past.stale, asOf: past.asOf }));
  ok("⚠️ 지난 날짜에는 **「다 끝냈다」고 지어내지 않는다**",
     !/다 끝냈습니다/.test(past.books[0].why || ""), past.books[0].why || "");
  ok("원장님 화면에도 「참고용」이 뜬다", past.says.some((t) => /참고용/.test(t)), JSON.stringify(past.says));
  const now = await routineNext(fakeDb(fx), { studentId: "s1", on: "2026-09-02" });
  ok("오늘 판은 그대로 「갈아탈 교재」다", now.stale === false && /갈아탈 교재/.test(now.books[0].why), now.books[0].why);
}

console.log("\n■ ⑥ 멈춤 — **조용히 0줄로 비우지 않는다** (⑬)");
{
  const db = fakeDb({ books: [ROW({ stop_mode: "book_off" })], cursor: CUR(), units: UNITS, routine: GRAMMAR });
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02" });
  const c = plan.books[0];
  ok("교재멈춤 — 학습도 숙제도 0줄", SLOTS.every((s) => c[s].length === 0), JSON.stringify(SLOTS.map((s) => c[s].length)));
  ok("무슨 일인지 밝힌다", c.notes.some((t) => /교재멈춤/.test(t)), JSON.stringify(c.notes));
  ok("⚠️ **커서는 안 움직인다** — 어디에 서 있는지 보여 준다", c.frozenAt === CH, String(c.frozenAt));
}
{
  const db = fakeDb({ books: [ROW({ stop_mode: "hw_off" })], cursor: CUR(), units: UNITS, routine: GRAMMAR });
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02" });
  const c = plan.books[0];
  ok("숙제멈춤 — 학원 줄은 그대로 있다", c.class.length > 0, String(c.class.length));
  ok("⚠️ 숙제·예습 묶음이 **통째로** 빈다", c.home.length === 0 && c.next.length === 0);
  ok("「이 교재는 수업만 합니다」를 밝힌다", c.notes.some((t) => /수업만 합니다/.test(t)), JSON.stringify(c.notes));
  ok("발송/화면에도 그 말이 실린다", plan.says.some((t) => /수업만 합니다/.test(t)));
}
{
  const s1 = stopOf({ stop_mode: "book_off", stop_until: "2026-08-30" }, "2026-09-02");
  ok("멈춤 날짜가 지나면 **풀린다**", s1.stopMode === STOP.RUNNING && /풀렸/.test(s1.stopWhy), JSON.stringify(s1));
  const s2 = stopOf({ stop_mode: "book_off", stop_until: "2026-09-20" }, "2026-09-02");
  ok("아직이면 멈춘 채다", s2.stopMode === "book_off" && /2026-09-20/.test(s2.stopWhy), JSON.stringify(s2));
  const s3 = stopOf({ stop_mode: "hw_off", stop_exam_id: "e1", exam_name: "2학기 중간", exam_end: "2026-08-31" }, "2026-09-02");
  ok("⚠️ 시험에 묶은 멈춤은 **시험이 끝나면 저절로 풀린다** (손으로만 풀면 몇 주 서 있는다)",
     s3.stopMode === STOP.RUNNING, JSON.stringify(s3));
  const s4 = stopOf({ stop_mode: "book_off" }, "2026-09-02");
  ok("푸는 날을 안 받았으면 「풀 때까지」다 — 지어내지 않는다", s4.stopMode === "book_off" && s4.stopWhy === "풀 때까지");
}

console.log("\n■ ⑦ 세 묶음이 다 비면 — 건너뛰고, 그래도 비면 **밝힌다** (확정 ④ 붙임)");
{
  const db = fakeDb({ books: [ROW()], cursor: CUR(), units: UNITS, routine: [] });
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02" });
  const c = plan.books[0];
  ok("루틴이 없으면 비지만 **조용히 안 비운다**", c.empty === true && !!c.why, JSON.stringify(c.why));
  ok("까닭이 「이 영역에 루틴이 없다」다", /루틴이 없어/.test(c.why), c.why);
  /** ⚠️⚠️ 예전에는 `skipped`(= 그 대단원의 남은 덩어리 수)를 「건너뛴 회차 수」로 내놨다.
   *  화면이 「6회차 건너뜀」으로 읽으면 **안 일어난 일을 숫자로 말한다.** 건너뛰기 고리 자체가
   *  아무 일도 못 했다 — `layout` 이 비는지는 items·drop·stopMode 로만 정해지고 어느 덩어리를
   *  넣느냐와 **무관**해서, 덩어리 아홉에 isEmpty 가 전부 같았다(실측). 고리를 지우고 이름을 고쳤다. */
  ok("⚠️ 「건너뛴 회차」를 **지어내지 않는다** — 이름이 「남은 덩어리 수」다",
     c.leftLumps === 4 && c.skipped === undefined, JSON.stringify({ left: c.leftLumps, skipped: c.skipped }));
  {
    const one = (await routineNext(fakeDb({ books: [ROW({ per_session: 1 })], cursor: CUR(), units: UNITS, routine: [] }),
                                   { studentId: "s1", on: "2026-09-02" })).books[0];
    ok("갯수 1이면 남은 덩어리가 5다 (덩어리 6 − 이번 1)", one.leftLumps === 5, String(one.leftLumps));
  }
  ok("원장님 화면에도 뜬다", plan.says.some((s) => /루틴이 없어/.test(s)));
}
{
  const db = fakeDb({ books: [ROW({ area: null })], cursor: CUR(), units: UNITS, routine: [] });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02" })).books[0];
  ok("영역이 안 붙은 교재는 「영역을 붙여 주세요」로 선다 (재촉 목록)", /영역이 안 붙어/.test(c.why), c.why);
}
{
  const drop = GRAMMAR.map((r) => r.item_id);
  const db = fakeDb({ books: [ROW()], cursor: CUR(), units: UNITS, routine: GRAMMAR });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02", adjust: { bk1: { drop } } })).books[0];
  ok("⚠️ 뺄 항목이 회차를 통째로 비우면 **「이 아이는 이 교재에 지금 낼 것이 없다」**",
     c.empty === true && /낼 것이 없습니다/.test(c.why), c.why);
}
{
  const db = fakeDb({ books: [ROW()], cursor: CUR({ chapter: null, is_workbook: null, left_in_chapter: 0 }),
                      units: [], routine: GRAMMAR });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02" })).books[0];
  ok("교재를 다 뗀 아이는 「갈아탈 교재」로 선다 — 조용히 0줄이 되지 않는다",
     c.empty === true && /갈아탈 교재/.test(c.why), c.why);
}

console.log("\n■ ⑧ 검사 ✕ — 「다음 회차」 대신 **그 단원 다시** (⑨-a)");
{
  const missed = [{ ...UNITS[0], unit_id: "b1", status: "missing", book_id: "bk1" }];
  const db = fakeDb({ books: [ROW()], cursor: CUR(), units: UNITS, routine: GRAMMAR, checks: missed });
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02" });
  const c = plan.books[0];
  ok("✕ 면 **그 단원 다시**가 깔린다", c.again === true && c.class[0].unitIds.join() === "b1", JSON.stringify(c.class[0]?.unitIds));
  ok("⚠️ 매 수업 루틴은 **그대로** 깔린다 (①이 ✕ 라고 ②가 비지 않는다)", c.class.length === 6, String(c.class.length));
  ok("무슨 일인지 밝힌다", c.notes.some((t) => /그 단원 다시/.test(t)), JSON.stringify(c.notes));
  ok("⚠️ 앞 단원을 못 했으니 **다음 단원 예습은 안 낸다** (확인 안 됨 — 원장님께 물을 것)", c.next.length === 0);
}
{
  const done = [{ ...UNITS[0], unit_id: "b1", status: "done", book_id: "bk1" }];
  const db = fakeDb({ books: [ROW()], cursor: CUR(), units: UNITS, routine: GRAMMAR, checks: done });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02" })).books[0];
  ok("○ 면 되돌아가지 않는다 — 커서가 가리킨 다음 회차다", c.again === false && c.class[0].unitIds.includes("b1") === true);
}
{
  const db = fakeDb({ books: [ROW()], cursor: CUR(), units: UNITS, routine: GRAMMAR, checks: [] });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02" })).books[0];
  ok("검사를 아직 안 했어도 오늘 학습은 **있다**", c.class.length === 6 && c.again === false, String(c.class.length));
}

{
  const rows = [{ ...UNITS[0], unit_id: "b1", status: "missing", book_id: "bk1" }];
  const db = fakeDb({ books: [ROW()], cursor: CUR(), units: UNITS, routine: GRAMMAR });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02", checks: rows })).books[0];
  ok("밖에서 넣은 검사 줄도 **같은 문을 지난다** (줄 목록이든 묶음이든)", c.again === true);
  ok("⚠️ 단원이 안 붙은 검사 줄은 안 센다 — 어느 교재인지 알 수 없다",
     groupChecks([{ status: "missing", book_id: null }]).size === 0);
  ok("△ 는 되돌리지 않는다 — 「하는 중」이지 ✕ 가 아니다",
     groupChecks([{ status: "weak", book_id: "bk1" }]).get("bk1").missing.length === 0);
}

console.log("\n■ ⑨ 메모로 대신한 날 (㊳) — **그 교재만** 올라간다");
{
  const two = [ROW(), ROW({ sb_id: "sb2", book_id: "bk2", book_name: "자이스토리 문법 중3" })];
  let j = 0;
  const db = { async query(sql) {
    if (sql.includes("v2.today()")) return { rows: [{ d: "2026-09-02" }] };
    if (sql.includes("min(x.sort) over")) return { rows: [] };
    if (sql.includes("v2.student_book")) return { rows: two };
    if (sql.includes("v2.cursor_of")) return { rows: [CUR()] };
    if (sql.includes("i.slot = 'check'")) return { rows: [] };
    if (sql.includes("from v2.units u")) return { rows: OTHER("n" + (j++)) };
    if (sql.includes("v2.area_routine")) return { rows: GRAMMAR };
    if (sql.includes("v2.progress_part")) return { rows: [] };
    throw new Error("모르는 SQL");
  } };
  const plan = await routineNext(db, { studentId: "s1", on: "2026-09-02",
    memo: { bk1: { class: "간접의문문 어순을 칠판으로만 설명" } } });
  const a = plan.books[0], b = plan.books[1];
  ok("메모가 **항목 대신** 그날의 ② 가 된다", a.class.length === 1 && a.class[0].byMemo === true && /간접의문문/.test(a.class[0].memo),
     JSON.stringify(a.class[0]));
  ok("숙제는 그대로 나간다 (학습 메모는 학습만 덮는다)", a.home.length === 5, String(a.home.length));
  ok("마감하면 그 교재의 그 회차가 ○ 로 올라간다", memoCovers(plan, "bk1").length === 2, JSON.stringify(memoCovers(plan, "bk1")));
  ok("⚠️ **다른 교재는 안 건드린다** — 한 줄이 새면 그날 판 전부가 ○ 가 된다",
     memoCovers(plan, "bk2").length === 0 && b.class.length === 6, String(memoCovers(plan, "bk2").length));
}

console.log("\n■ ⑩ 루틴 — 학생루틴이 기본루틴을 대신한다 (㉒) · 예습은 따로 선다");
{
  const rows = [...GRAMMAR, { ...R("문제풀기", "class", 1), src: "student", item_id: "i4", gate_prev: true, count_n: 3 }];
  const m = pickRoutine(rows);
  ok("학생루틴이 한 줄이라도 있으면 **그 영역은 학생 것만** 쓴다", m.get("문법").length === 1, String(m.get("문법")?.length));
  ok("잠금과 갯수가 따라온다", m.get("문법")[0].gate_prev === true && m.get("문법")[0].count_n === 3);
}
ok("「교재예습」은 **예습 묶음**으로 간다", isPreview({ name: "교재예습", place: "home" }) === true);
ok("place='next' 가 들어오면 그것으로 가른다", isPreview({ name: "무엇", place: "next" }) === true);
ok("보통 숙제는 예습이 아니다", isPreview({ name: "문제풀기", place: "home" }) === false);
ok("both 는 학원에서 한 번, 집에서 또 한 번 (0036)", JSON.stringify(slotsOf({ place: "both" })) === '["class","home"]');
ok("⚠️ 모르는 자리는 **아무 데도 안 끼운다**", slotsOf({ place: "저녁" }).length === 0);
{
  const db = fakeDb({ books: [ROW({ area: "독해", order_basis: "sub" })], cursor: CUR(), units: UNITS,
                      routine: READING });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02" })).books[0];
  ok("독해는 예습 한 줄이 **다음 단원 예습**으로 선다", c.next.length === 1 && c.next[0].name === "교재예습",
     JSON.stringify(c.next.map((x) => x.name)));
  ok("그 줄은 숙제 묶음에 **두 번 안 선다** (원칙 1)", c.home.length === 0, JSON.stringify(c.home.map((x) => x.name)));
  /** ⚠️⚠️ **여기가 제일 큰 자리.** 계획 ⑨ ③ 은 「오늘 한 단원의 복습 + **다음 단원의 예습**」이다.
   *  예전에는 세 묶음이 다 **같은 오늘 덩어리**를 가리켰다 — 실측으로 예습 줄이 선 카드 35개 중
   *  16개에서 next 의 unitIds 와 label 이 class 와 **글자까지 같았다.** 그러면
   *  (1) 아이가 학원에서 방금 푼 단원을 「예습」으로 또 받고
   *  (2) 같은 단원이 slot='class' ○ 와 slot='next' ○ 로 **두 줄** 저장돼
   *      progress 의 winner() 가 예습 줄을 먼저 집으면 done 으로 안 올라가고
   *      **커서가 안 움직여 내일 같은 단원이 또 깔린다.**
   *  이름과 슬롯만 보면 이 구멍을 원리적으로 못 잡는다 — **unitIds 가 다른지**를 본다. */
  ok("⚠️ 예습은 **다음 덩어리**를 가리킨다 — 오늘 것을 예습이라고 내밀지 않는다",
     c.next[0].unitIds.join() !== c.class[0].unitIds.join(),
     `학원 ${c.class[0]?.unitIds} / 예습 ${c.next[0]?.unitIds}`);
  ok("예습 줄에 **다음 단원 이름**이 붙는다 (오늘은 Unit 01·02, 예습은 Unit 03·04)",
     /Unit 03/.test(c.next[0].label) && !/Unit 01/.test(c.next[0].label), c.next[0].label);
  ok("예습에는 오늘 쪽 범위를 안 적는다 (그건 오늘 낼 것이다)", c.next[0].rangeNote === null, String(c.next[0].rangeNote));
  ok("예습이 가리키는 곳의 분량을 따로 센다", c.nextAmount?.pages > 0 && c.nextUnits.length === 4,
     JSON.stringify({ p: c.nextAmount?.pages, n: c.nextUnits?.length }));
}
{
  // 이 대단원에 남은 덩어리가 없으면 **다음 자리를 DB 에 물어본다** (afterUnits — 차례는 cursor_of 와 같다)
  const nextCh = [{ ...U("n1", "Unit 01 관계대명사", "Practice", false, 201, 70, 71),
                    chapter: "Chapter 05 관계사", label: "Chapter 05 관계사 › Unit 01 관계대명사" }];
  const db = fakeDb({ books: [ROW({ area: "독해", order_basis: "sub", per_session: 6 })], cursor: CUR(),
                      units: UNITS, routine: READING, after: nextCh });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02" })).books[0];
  ok("이 대단원이 끝나면 **다음 자리**를 물어본다", asked(db, "min(x.sort) over"));
  ok("예습이 다음 대단원 첫 덩어리를 가리킨다", c.next[0]?.unitIds.join() === "n1", JSON.stringify(c.next[0]?.unitIds));
}
{
  // ⚠️ 다음 자리가 아예 없으면 — 오늘 것을 예습이라고 내밀지 않고 **밝힌다** (조용히 안 비운다)
  const db = fakeDb({ books: [ROW({ area: "독해", order_basis: "sub", per_session: 6 })], cursor: CUR(),
                      units: UNITS, routine: READING, after: [] });
  const c = (await routineNext(db, { studentId: "s1", on: "2026-09-02" })).books[0];
  ok("⚠️ 다음 단원이 없으면 예습이 **안 나가고**, 무슨 일인지 밝힌다",
     c.next.length === 0 && c.notes.some((t) => /다음 단원이 없어/.test(t)), JSON.stringify(c.notes));
  ok("그렇다고 오늘 학습·숙제까지 비지는 않는다", c.class.length > 0, String(c.class.length));
}

console.log("\n■ ⑪ 판단이 한 곳뿐인가 — 파일을 훑는다");
{
  const walk = (d, out = []) => { for (const f of readdirSync(d)) {
    // ⚠️ `scripts/` 는 뺀다 — DB 함수가 **맞게 세는지**는 검사가 진짜 DB 로 물어봐야 한다
    //    (check-derive · check-progress 가 그 일을 한다). 여기서 보는 것은 **화면과 lib** 이다
    if (["node_modules", ".next", ".git", "backup", "supabase", "public", "scripts"].includes(f)) continue;
    const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
      : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
  const files = walk(".").filter((f) => !f.endsWith("lib/routine.js") && !f.endsWith("check-routine2.mjs"));
  const cursorers = files.filter((f) => /v2\.cursor_of/.test(readFileSync(f, "utf8")));
  ok("커서 SQL 을 lib/routine.js 밖에서 부르지 않는다", cursorers.length === 0, cursorers.join(" "));
  const src = readFileSync("lib/routine.js", "utf8");
  ok("쪽 셈을 다시 만들지 않는다 — chunk.js 의 pageCount 를 부른다",
     !/page_end\s*-\s*.*page_start|pageEnd\s*-\s*.*pageStart/.test(src));
  ok("분량 쪼개기를 다시 만들지 않는다 — chunk.js 의 chunkPlan 을 부른다",
     /from "\.\/chunk\.js"/.test(src) && /chunkPlan\(/.test(src));
  ok("⚠️ SQL 에 `${…}` 를 끼워 넣지 않는다 (끼우면 기계로 검사할 수가 없다)",
     !/`[^`]*\b(from|join|into|update)\s+[\w.]*\$\{/s.test(src));
}

// ────────────────────────────────────────────────────────────────
console.log("\n■ ⑫ 진짜 DB 로 한 번 — 가짜 DB 는 **죽은 칸을 원리적으로 못 잡는다**");
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const db = { query: (s, p) => c.query(s, p) };
  const today = (await c.query("select v2.today() as d")).rows[0].d;

  // ⓐ 진짜 교재로 워크북 덩어리
  const gi = (await c.query(`select id from v2.books where name = $1`, ["그래머인사이드3"])).rows[0];
  const st = (await c.query(`select id from v2.students where name = $1`, ["구도은"])).rows[0];
  ok("본보기 교재와 아이를 찾았다", !!gi && !!st);
  if (gi && st) {
    const rows = (await c.query(
      `select u.id, u.chapter, u.mid, u.sub, u.activity, u.is_workbook, u.sort,
              u.page_start, u.page_end, u.q_count, v2.unit_label(u.id, true) as label
         from v2.units u where u.book_id = $1 and u.state='active' and u.chapter = $2 order by u.sort`,
      [gi.id, "Chapter 04 부정사"])).rows;
    ok("진짜 단원 줄을 읽었다 (14줄)", rows.length === 14, String(rows.length));
    const wb = lumpsOf(rows.filter((r) => r.is_workbook), { orderBasis: "chapter", chunkDepth: "sub" });
    ok("⚠️ 진짜 줄로도 워크북은 **한 덩어리 · 18쪽**", wb.length === 1 && wb[0].pages === 18,
       `${wb.length}덩어리 ${wb[0]?.pages}쪽`);
    const all = lumpsOf(rows, { orderBasis: "chapter", chunkDepth: "sub" });
    let sawWb = false, bad = null;
    for (const x of all) { if (x.isWorkbook) sawWb = true; else if (sawWb) bad = x.label; }
    ok("⚠️ 검사 Q — 워크북 뒤에 같은 대단원 본책이 안 나온다", bad === null, bad || "");
    ok("단원 이름은 DB(v2.unit_label)가 준 것을 쓴다", /Chapter 04 부정사 ›/.test(all[0].label), all[0].label);
  }

  // ⓐ-2 ⚠️ 날짜가 하루 밀리지 않는가 — node-pg 는 date 를 **그 기계 자정** Date 로 준다
  const rt = (await c.query(`select v2.today() as d, v2.today()::text as t`)).rows[0];
  const plan0 = await routineNext(db, { studentId: st.id });
  ok("⚠️ 날짜가 하루도 안 밀린다 (밀리면 그날 숙제가 통째로 빈다)", plan0.date === rt.t,
     `${plan0.date} vs ${rt.t}`);
  ok("`on` 을 안 주면 v2.today() 에 물어본다 (기계 시계를 안 믿는다)", plan0.date === rt.t);

  // ⓑ 진짜 아이로 한 판 차려 본다
  const plan = await routineNext(db, { studentId: st.id, on: today });
  ok("진짜 아이로 한 판이 차려진다", Array.isArray(plan.books) && plan.books.length > 0, String(plan.books.length));
  ok("빈 교재는 **까닭이 붙어 있다** — 조용히 0줄이 없다",
     plan.books.every((b) => !b.empty || !!b.why),
     JSON.stringify(plan.books.filter((b) => b.empty && !b.why).map((b) => b.name)));
  const hw = plan.books.find((b) => b.stopMode === STOP.HW_OFF);
  ok("숙제멈춤 교재가 실제로 있다 (실측 구도은 · 일관성 있는 기준 영문법)", !!hw, JSON.stringify(plan.books.map((b) => b.stopMode)));
  if (hw) ok("그 교재는 학원 줄만 있고 숙제·예습이 통째로 비어 있다",
             hw.class.length > 0 && hw.home.length === 0 && hw.next.length === 0,
             `${hw.class.length}/${hw.home.length}/${hw.next.length}`);
  const doneBook = plan.books.find((b) => b.chapter === null);
  ok("다 뗀 교재가 실제로 있다 (실측 구도은 · 3800제3)", !!doneBook, "");
  if (doneBook) ok("그 교재는 「갈아탈 교재」로 선다", /갈아탈 교재/.test(doneBook.why || ""), doneBook.why || "");

  // ⓒ 교재멈춤 아이
  const st2 = (await c.query(`select id from v2.students where name = $1`, ["공시연"])).rows[0];
  if (st2) {
    const p2 = await routineNext(db, { studentId: st2.id, on: today });
    const off = p2.books.filter((b) => b.stopMode === STOP.BOOK_OFF);
    ok("교재멈춤 교재가 실제로 있다 (실측 공시연)", off.length > 0, String(off.length));
    ok("⚠️ 멈춘 교재는 **0줄이고 커서가 서 있다**",
       off.every((b) => SLOTS.every((s) => b[s].length === 0)), "");
  }

  // ⓒ-2 ⚠️⚠️ **한 대단원 안에서 되풀이되는 이름** — 본보기 자료(그래머인사이드3)로는
  //     소단원 이름이 안 겹쳐서 **원리적으로 못 잡는다.** 진짜 교재를 읽어서 본다.
  const eb = (await c.query(`select id from v2.books where name = $1`, ["어법끝스타트"])).rows[0];
  if (eb) {
    const rows = (await c.query(
      `select u.id, u.chapter, u.mid, u.sub, u.activity, u.is_workbook, u.sort,
              u.page_start, u.page_end, u.q_count, v2.unit_label(u.id, true) as label
         from v2.units u where u.book_id = $1 and u.state='active' and u.chapter = $2 order by u.sort`,
      [eb.id, "PART 1 네모 어법"])).rows;
    const l = lumpsOf(rows, { orderBasis: "sub", chunkDepth: "sub" });
    const ex = l.filter((x) => x.units.every((u) => u.sub === "UNIT Exercise"));
    ok("⚠️ 「UNIT Exercise」가 **10덩어리**다 — 10줄 한 덩어리(p.38~141)가 아니다",
       ex.length === 10, `${ex.length}덩어리`);
    const big = Math.max(...l.map((x) => amountOf(x.units, {}).pages));
    ok("⚠️ 한 덩어리가 **104쪽짜리**가 되지 않는다", big < 20, `가장 큰 덩어리 ${big}쪽`);
  }

  // ⓒ-3 ⚠️⚠️ **예습이 오늘 단원을 가리키는 카드가 없다.** 실측으로 16카드가 글자까지 같았다 —
  //     그러면 같은 단원이 class ○ 와 next ○ 로 두 줄 저장돼 커서가 안 움직인다.
  const every = (await c.query(`select id, name from v2.students where state = 'active'`)).rows;
  const same = [], twoNums = [];
  for (const one of every) {
    const q = await routineNext(db, { studentId: one.id, on: today });
    for (const b of q.books) {
      if (b.next?.length && (b.class[0]?.unitIds ?? []).join() === (b.next[0]?.unitIds ?? []).join())
        same.push(`${one.name}/${b.name}`);
    }
    // ⚠️ 한 판에 숫자가 둘이면 안 된다 — 말하는 쪽수와 카드들의 분량 합이 같아야 한다
    const sum = q.books.reduce((t, b) =>
      t + (SLOTS.some((x) => (b[x] ?? []).length) ? Number(b.amount?.pages) || 0 : 0), 0);
    if (q.load.pages !== sum) twoNums.push(`${one.name} ${q.load.pages}≠${sum}`);
  }
  ok("⚠️ 예습이 **오늘 단원을 가리키는 카드가 없다** (전교생)", same.length === 0, same.slice(0, 3).join(" · "));
  ok("⚠️ 말하는 쪽수 = 카드 분량의 합 (한 판에 숫자가 둘이면 안 된다)",
     twoNums.length === 0, twoNums.slice(0, 3).join(" · "));

  // ⓒ-4 ⚠️⚠️ **검사 줄에 단원이 안 붙어 있다** — 「검사가 방아쇠다」의 그 방아쇠 자리다.
  //     2026-09-02 실측: check 줄 3994개 **전부** unit_id 가 null (✕ 643줄 포함).
  //     지어내서 켜지 않는다 — 대신 **버리지 말고 밝힌다.**
  const cnt = (await c.query(
    `select count(*)::int as n, count(unit_id)::int as u from v2.day_item where slot = 'check'`)).rows[0];
  ok("검사 줄이 실제로 있다", cnt.n > 0, JSON.stringify(cnt));
  const miss = (await c.query(
    `select s.student_id, s.date::text as d from v2.day_sheet s
       join v2.day_item i on i.sheet_id = s.id
      where i.slot = 'check' and i.status = 'missing' order by s.date desc limit 1`)).rows[0];
  if (miss) {
    const q = await routineNext(db, { studentId: miss.student_id, on: miss.d });
    ok("⚠️ 단원이 안 붙은 검사 줄을 **버리지 않고 밝힌다** (안 밝히면 화면 켜는 날 그대로 터진다)",
       q.checkOrphans === 0 || q.says.some((t) => /단원이 안 붙어/.test(t)),
       JSON.stringify({ orphans: q.checkOrphans, says: q.says.filter((t) => /단원/.test(t)) }));
    ok("⚠️ 「✕ → 그 단원 다시」는 **단원이 붙은 ✕ 줄에서만** 켠다 (없는 단원을 지어내지 않는다)",
       q.books.filter((b) => b.again).every((b) => (b.class[0]?.unitIds ?? []).filter(Boolean).length > 0),
       JSON.stringify(q.books.filter((b) => b.again).map((b) => b.name)));
  }

  // ⓓ 저장된 판의 분량은 DB 가 센다 — 같은 식인지 나란히 본다
  const load = (await c.query(`select * from v2.today_load($1, $2)`, [st.id, today])).rows[0];
  ok("v2.today_load 가 살아 있다 (저장된 판은 DB 가 센다)", load && "pages" in load, JSON.stringify(load));

  await c.end();
} catch (e) {
  fail++; console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 숙제 차리기 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
