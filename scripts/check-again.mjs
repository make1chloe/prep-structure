/**
 * **갯수 두 단추 검사** — `lib/again.js`.
 *
 * 여기서 지켜야 하는 것은 다섯이다. 다섯 다 **오류가 안 나는 사고**라 검사가 아니면 못 잡는다.
 *   ① ⚠️⚠️ **「반복」이 같은 단원을 또 내면 안 된다.** 지난번 단원은 이미 끝났다 —
 *      그대로 쓰면 아이가 어제 푼 것을 오늘 또 받고, 진도는 안 올라가며, 화면은 멀쩡하다.
 *      **「그대로」인 것은 갯수·분량·뺄 항목이고, 단원은 `v2.cursor_of` 가 준 지금 자리**다.
 *   ② **「루틴」은 `routineNext()` 를 그냥 부른 것이다** — 조절을 한 톨도 안 얹는다.
 *   ③ **교재멈춤이면 어느 단추도 안 낸다.**
 *   ④ **지난 판이 없으면 「반복」은 뜻이 없다** — 단추를 흐리게 하지 않고 **까닭을 글로** 준다.
 *      「판은 있는데 단원이 안 붙어 못 읽었다」를 **「첫 회다」로 지어내지 않는다.**
 *   ⑤ **「없다」가 곧 「뺐다」는 아니다** — 그 자리가 그날 통째로 안 나갔을 수 있다.
 *
 * ⚠️ **가짜 DB 만 상대하면 죽은 칸·제약 위반을 원리적으로 못 잡는다.**
 *    그래서 ■⑤ 는 **진짜 DB** 로 돈다 — 트랜잭션 안에서 쓰고 끝에 rollback 한다.
 * ⚠️⚠️ **리허설 학생(zz_시험_ · import_batch='fixture')으로만 쓴다.**
 *    앞 판에서 `state='active'` 로 진짜 학생을 골라 **장원우의 오늘 판에 숙제 52줄**이 굳은 적이 있다.
 *    남은 것은 `scripts/check-residue.mjs` 가 센다.
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";
import {
  AGAIN, WHY, LUMP_SLOTS, spanPages, sameFrom, buttonsFor, lastGiven, stopNow, againPlan,
} from "../lib/again.js";
import { freezeDay } from "../lib/day.js";

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};

// ────────────────────────────────────────────────────────────────
console.log("■ ① 쪽 세기 — 여기서 하나 틀리면 「지난번 분량」이 통째로 틀린다");
ok("p.4~5 는 2쪽이다 (시작과 끝을 둘 다 센다)", spanPages([[4, 5]]) === 2, String(spanPages([[4, 5]])));
ok("겹친 토막을 두 번 안 센다", spanPages([[4, 8], [6, 10]]) === 7, String(spanPages([[4, 8], [6, 10]])));
ok("떨어진 토막은 따로 센다", spanPages([[4, 5], [10, 11]]) === 4, String(spanPages([[4, 5], [10, 11]])));
ok("맞닿은 토막을 이어 센다", spanPages([[4, 5], [6, 7]]) === 4, String(spanPages([[4, 5], [6, 7]])));
ok("거꾸로 된 토막은 안 센다 (지어내지 않는다)", spanPages([[9, 3]]) === 0, String(spanPages([[9, 3]])));
ok("빈 것은 0", spanPages([]) === 0);

// ── 지난 판 줄 흉내 (SQL_LAST 가 주는 모양 그대로) ─────────────────────────────
const U = (k) => `00000000-0000-4000-8000-0000000000${String(k).padStart(2, "0")}`;
const IT = (k) => `00000000-0000-4000-7000-0000000000${String(k).padStart(2, "0")}`;
const past = (o = {}) => ({
  on_date: "2026-08-26", id: U(90), slot: "home", item_id: IT(1), unit_id: U(1),
  range_note: null, memo: null, sort: 0, status: "none",
  chapter: "STEP 1", mid: "이론", sub: "가", is_workbook: false, unit_sort: 1,
  page_start: 4, page_end: 4, q_count: null, q_range: null, label: "STEP 1 › 가", ...o,
});
/** 루틴 한 줄 흉내 — `routineOf` 가 주는 모양 */
const item = (k, place, name) => ({ item_id: IT(k), name, place, sort: k });

console.log("\n■ ② 지난 판에서 **갯수 · 분량 · 뺄 항목**을 세어 온다 (원칙 5 — 따로 저장 안 한다)");
{
  const rows = [
    past({ slot: "class", item_id: IT(3), unit_id: U(1), sub: "가", unit_sort: 1, page_start: 4, page_end: 4 }),
    past({ slot: "home", item_id: IT(1), unit_id: U(1), sub: "가", unit_sort: 1, page_start: 4, page_end: 4 }),
    past({ slot: "home", item_id: IT(1), unit_id: U(2), sub: "나", unit_sort: 2, page_start: 5, page_end: 5 }),
    past({ slot: "home", item_id: IT(1), unit_id: U(3), sub: "다", unit_sort: 3, page_start: 6, page_end: 6 }),
  ];
  const items = [item(1, "home", "문답노트"), item(2, "home", "복습 워크북"), item(3, "class", "숙제채점")];
  const s = sameFrom(rows, { items });
  ok("갯수 — 소단원 셋이 나갔으면 3회차다", s.count === 3, String(s.count));
  ok("분량 — 범위를 안 적었으면 **통째로**(null) 다", s.pages === null, JSON.stringify(s.pages));
  ok("뺄 항목 — 그날 안 나간 「복습 워크북」이 잡힌다", s.drop.length === 1 && s.drop[0] === IT(2),
     JSON.stringify(s.drop));
  ok("지난 판 날짜를 같이 돌려준다", s.on === "2026-08-26", String(s.on));
  ok("⚠️ **단원을 조절로 넘기지 않는다** — 갯수·분량·뺄 항목 셋뿐이다",
     !("unitIds" in s) && !("chapter" in s), Object.keys(s).join(","));
}
{
  const rows = [
    past({ slot: "home", range_note: "p.4~5", unit_id: U(1), sub: "가", unit_sort: 1 }),
    past({ slot: "home", range_note: "p.4~5", unit_id: U(2), sub: "나", unit_sort: 2, page_start: 5, page_end: 5 }),
  ];
  const s = sameFrom(rows, { items: [item(1, "home", "문답노트")] });
  ok("분량 — 「p.4~5」를 적었으면 **2쪽**이다", s.pages === 2, String(s.pages));
  ok("그때 갯수는 2회차", s.count === 2, String(s.count));
}
{
  const s = sameFrom([past({ range_note: "17번만" })], { items: [item(1, "home", "문답노트")] });
  ok("⚠️ 범위가 쪽이 아니라 문항이면 **분량을 안 지어낸다**", s.pages === null && s.kind === "q",
     JSON.stringify({ pages: s.pages, kind: s.kind }));
  ok("그 사실을 글로 남긴다", s.notes.some((t) => /문항/.test(t)), JSON.stringify(s.notes));
}
{
  const s = sameFrom([past({ range_note: "짝수만" })], { items: [item(1, "home", "문답노트")] });
  ok("⚠️ 못 읽는 범위(「짝수만」)도 **안 지어낸다**", s.pages === null && s.kind === "unknown",
     JSON.stringify({ pages: s.pages, kind: s.kind }));
}
{
  // ⚠️ `routineNext` 는 pages 0 을 「1쪽만」으로 읽는다 — 실측으로 그 자리에서 1쪽만 나간 적이 있다
  const s = sameFrom([past({ range_note: "p.0~0" })], { items: [] });
  ok("⚠️ 분량으로 **0 을 절대 안 돌려준다** (0 은 「1쪽만」이 된다)", s.pages !== 0, String(s.pages));
}
{
  const rows = [past({ slot: "next", item_id: IT(9), unit_id: U(8), sub: "다음단원", unit_sort: 9 })];
  const s = sameFrom(rows, { items: [] });
  ok("⚠️ 예습(next)은 **다음 단원**이라 갯수에 안 넣는다", s.count === null, String(s.count));
  ok("갯수를 세는 자리는 둘뿐이다", LUMP_SLOTS.join(",") === "class,home", LUMP_SLOTS.join(","));
}

console.log("\n■ ③ ⚠️ 「없다」가 곧 「뺐다」는 아니다 (그 자리가 그날 통째로 안 나갔을 수 있다)");
{
  const rows = [past({ slot: "home", item_id: IT(1) })];
  const items = [item(1, "home", "문답노트"), item(9, "next", "교재예습")];
  const s = sameFrom(rows, { items });
  ok("예습 자리가 통째로 없던 날 — 예습을 **안 뺀다**", s.drop.length === 0, JSON.stringify(s.drop));
  ok("대신 「몰라서 안 뺐다」고 말한다", s.notes.some((t) => /안 뺐/.test(t)), JSON.stringify(s.notes));
}
{
  const rows = [past({ slot: "home", item_id: null, memo: "구두로 함" })];
  const s = sameFrom(rows, { items: [item(1, "home", "문답노트")] });
  ok("메모로 대신한 날은 **뺀 항목을 못 센다** — 하나도 안 뺀다", s.drop.length === 0 && s.byMemo === true,
     JSON.stringify({ drop: s.drop, byMemo: s.byMemo }));
}

console.log("\n■ ④ 단추 — **흐리게 하지 않고 까닭을 글로 준다** (절 ㉑ 투명도 금지)");
{
  const b = buttonsFor({ why: WHY.OK });
  ok("보통은 둘 다 눌린다", b.same.on === true && b.routine.on === true);
  ok("눌리는 자리에는 까닭이 없다", b.same.why === null && b.routine.why === null);
}
{
  const b = buttonsFor({ why: WHY.FIRST });
  ok("첫 회 — 「반복」은 못 누르고 「루틴」은 눌린다", b.same.on === false && b.routine.on === true);
  ok("까닭이 **글로** 온다 (화면이 그대로 적는다)", /지난 판이 없/.test(b.same.why ?? ""), b.same.why);
}
{
  const b = buttonsFor({ why: WHY.NO_UNIT, lastSheetOn: "2026-08-26" });
  ok("단원이 안 붙은 지난 판 — 「반복」이 무엇을 베낄지 모른다", b.same.on === false,
     JSON.stringify(b.same));
  ok("그 날짜를 같이 적어 준다", /2026-08-26/.test(b.same.why ?? ""), b.same.why);
}
{
  const b = buttonsFor({ stopMode: "book_off", stopWhy: "9월 20일까지" });
  ok("⚠️ 교재멈춤이면 **어느 단추도 안 낸다**", b.same.on === false && b.routine.on === false,
     JSON.stringify(b));
  ok("언제까지 멈춰 있는지 적어 준다", /9월 20일까지/.test(b.routine.why ?? ""), b.routine.why);
}

console.log("\n■ ⑤ 가짜 DB — 「반복」과 「루틴」이 실제로 다르게 나가나");
{
  const BOOK = "00000000-0000-4000-6000-000000000001";
  const STU = "00000000-0000-4000-9000-000000000009";
  // 지금 커서가 선 대단원(STEP 2)의 줄 넷 — 소단원 이름이 달라 **덩어리 넷**이다
  const now = [1, 2, 3, 4].map((k) => ({
    id: U(10 + k), chapter: "STEP 2", mid: "실전", sub: `새${k}`, activity: "문제",
    is_workbook: false, sort: 10 + k, page_start: 35 + k, page_end: 35 + k,
    q_count: null, q_range: null, label: `STEP 2 › 새${k}`, prog: null,
  }));
  const routineRows = [
    { src: "area", area: "독해", item_id: IT(1), name: "문답노트", place: "home", sort: 1,
      method: null, tool: null, checks: null, gate_prev: false, count_n: null },
    { src: "area", area: "독해", item_id: IT(2), name: "복습 워크북", place: "home", sort: 2,
      method: null, tool: null, checks: null, gate_prev: false, count_n: null },
    { src: "area", area: "독해", item_id: IT(3), name: "숙제채점", place: "class", sort: 3,
      method: null, tool: null, checks: null, gate_prev: false, count_n: null },
  ];
  const lastRows = [1, 2, 3].map((k) => ({
    on_date: "2026-08-26", id: U(90 + k), slot: k === 1 ? "class" : "home",
    item_id: k === 1 ? IT(3) : IT(1), unit_id: U(k), range_note: null, memo: null, sort: k, status: "none",
    chapter: "STEP 1", mid: "이론", sub: `옛${k}`, is_workbook: false, unit_sort: k,
    page_start: 3 + k, page_end: 3 + k, q_count: null, q_range: null, label: `STEP 1 › 옛${k}`,
  }));

  const seen = [];
  const fake = (over = {}) => ({
    query: async (sql) => {
      const s = String(sql);
      seen.push(s.slice(0, 40));
      const R = (rows) => ({ rows });
      if (/v2\.today\(\) as d/.test(s)) return R([{ d: "2026-09-02" }]);
      if (/again:last/.test(s)) return R(over.last ?? lastRows);
      if (/again:any/.test(s)) return R([{ on_date: null, n: 0, with_unit: 0 }]);
      if (/again:orphan/.test(s)) return R([]);
      if (/again:seq/.test(s)) return R(lastRows.map((r) => ({ id: r.unit_id, chapter: r.chapter,
        mid: r.mid, sub: r.sub, is_workbook: false, sort: r.unit_sort,
        page_start: r.page_start, page_end: r.page_end, q_count: null, q_range: null })));
      if (/again:stop/.test(s)) return R([{ stop_mode: over.stop ?? "running" }]);
      if (/from v2\.student_book sb/.test(s)) return R([{
        sb_id: "sb1", book_id: BOOK, book_name: "빈순삽함 실전 100", area: "독해", book_state: "active",
        chunk_depth: "sub", order_basis: "sub", round: 1, per_session: 2,
        unit_test: null, unit_test_n: null, stop_mode: over.stop === "book_off" ? "book_off" : "running",
        stop_until: null, stop_exam_id: null, exam_name: null, exam_end: null }]);
      if (/v2\.area_routine/.test(s)) return R(routineRows);
      if (/i\.slot = 'check'/.test(s)) return R([]);
      if (/v2\.cursor_of/.test(s)) return R([{ round: 1, chapter: "STEP 2", is_workbook: false, left_in_chapter: 4 }]);
      if (/min\(x\.sort\) over/.test(s)) return R([]);
      if (/u\.chapter = \$4/.test(s)) return R(now);
      if (/v2\.progress_part/.test(s)) return R([]);
      throw new Error("모르는 SQL — " + s.slice(0, 70));
    },
  });

  const same = await againPlan(fake(), { studentId: STU, on: "2026-09-02", mode: AGAIN.SAME });
  const routine = await againPlan(fake(), { studentId: STU, on: "2026-09-02", mode: AGAIN.ROUTINE });
  const card = (r) => r.plan.books[0];
  const ids = (r) => [...new Set([...(card(r).class ?? []), ...(card(r).home ?? [])].flatMap((x) => x.unitIds ?? []))];

  ok("「루틴」은 조절을 **한 톨도 안 얹는다**", Object.keys(routine.adjust).length === 0,
     JSON.stringify(routine.adjust));
  ok("「반복」은 지난번 갯수 3회차를 얹는다", same.adjust[BOOK]?.count === 3,
     JSON.stringify(same.adjust[BOOK]));
  ok("「반복」은 지난번에 안 나간 항목을 뺀 채로 얹는다",
     JSON.stringify(same.adjust[BOOK]?.drop) === JSON.stringify([IT(2)]),
     JSON.stringify(same.adjust[BOOK]?.drop));
  ok("⚠️⚠️ **「반복」이 낸 단원은 지난번 단원이 아니다** (지금 자리다)",
     ids(same).length > 0 && ids(same).every((x) => !lastRows.some((r) => r.unit_id === x)),
     JSON.stringify(ids(same)));
  ok("「반복」이 낸 단원은 커서가 선 대단원(STEP 2) 것이다",
     card(same).chapter === "STEP 2" && ids(same).every((x) => now.some((u) => u.id === x)),
     JSON.stringify({ ch: card(same).chapter, ids: ids(same) }));
  ok("「반복」은 3회차 — 단원 셋이 나간다", ids(same).length === 3, String(ids(same).length));
  ok("「루틴」은 회차 기본값(per_session 2) — 단원 둘이 나간다", ids(routine).length === 2,
     String(ids(routine).length));
  ok("「반복」은 뺀 항목이 실제로 안 나간다 (숙제 1줄)", (card(same).home ?? []).length === 1,
     JSON.stringify((card(same).home ?? []).map((x) => x.name)));
  ok("「루틴」은 루틴 그대로 다 나간다 (숙제 2줄)", (card(routine).home ?? []).length === 2,
     JSON.stringify((card(routine).home ?? []).map((x) => x.name)));
  ok("무엇을 했는지 한 줄로 말해 준다", /지난번에 낸 그대로/.test(same.msg) && /루틴대로/.test(routine.msg),
     `${same.msg} | ${routine.msg}`);

  // ⚠️ 지난 판이 아예 없을 때 — **조용히 루틴으로 갈아타지 않는다**
  const first = await againPlan(fake({ last: [] }), { studentId: STU, on: "2026-09-02", mode: AGAIN.SAME });
  ok("지난 판이 없으면 「반복」은 뜻이 없다고 말한다", first.books[0].why === WHY.FIRST, first.books[0].why);
  ok("단추를 흐리게 하지 않고 **까닭**을 준다", first.books[0].buttons.same.on === false
     && /지난 판이 없/.test(first.books[0].buttons.same.why ?? ""), first.books[0].buttons.same.why);
  ok("그래도 조절은 안 얹는다 (루틴대로 나간다)", Object.keys(first.adjust).length === 0,
     JSON.stringify(first.adjust));
  ok("무엇을 했는지 글로 남긴다", first.books[0].notes.some((t) => /루틴대로/.test(t)),
     JSON.stringify(first.books[0].notes));

  // ⚠️ 교재멈춤 — 어느 단추도 안 낸다
  for (const mode of [AGAIN.SAME, AGAIN.ROUTINE]) {
    const off = await againPlan(fake({ stop: "book_off" }), { studentId: STU, on: "2026-09-02", mode });
    const c = off.plan.books[0];
    ok(`교재멈춤 — 「${mode}」 도 한 줄도 안 낸다`,
       (c.class ?? []).length === 0 && (c.home ?? []).length === 0 && (c.next ?? []).length === 0,
       JSON.stringify({ class: c.class?.length, home: c.home?.length, next: c.next?.length }));
    ok(`교재멈춤 — 「${mode}」 는 까닭을 적는다`, off.books[0].why === WHY.BOOK_OFF
       && /교재멈춤/.test(off.books[0].buttons.same.why ?? ""), off.books[0].buttons.same.why);
  }

  // 단추는 둘뿐이다
  let threw = null;
  try { await againPlan(fake(), { studentId: STU, mode: "whatever" }); } catch (e) { threw = String(e.message); }
  ok("모르는 단추 이름은 거절한다", /단추는 둘뿐/.test(threw ?? ""), String(threw));
  ok("멈춤 판단은 **v2.book_stop 한 곳**에 묻는다", seen.some((x) => /again:stop/.test(x)),
     seen.slice(0, 4).join(" | "));
}

// ────────────────────────────────────────────────────────────────
console.log("\n■ ⑥ 진짜 DB — 리허설 학생 · 트랜잭션 안에서 쓰고 끝에 되돌린다");
let c = null;
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) {
    try { await c.connect(); break; }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
  await c.query("begin");
  const db = { query: (s, p) => c.query(s, p) };

  // ⚠️⚠️ **진짜 재원생에게 쓰지 마라.** `state='active'` 로 고르면 원장님 판에 없는 숙제가 남는다
  const stu = (await c.query(
    `select id, name from v2.students where import_batch = 'fixture' order by name limit 1`)).rows[0];
  if (!stu) throw new Error("리허설 학생(zz_시험_)이 없다 — 진짜 학생으로는 안 돌린다");
  const sb = (await c.query(
    `select sb.book_id, b.name, b.area, sb.per_session, sb.round
       from v2.student_book sb join v2.books b on b.id = sb.book_id
      where sb.student_id = $1::uuid order by b.name limit 1`, [stu.id])).rows[0];
  ok("리허설 학생과 그 아이가 든 교재를 찾았다", !!stu && !!sb,
     JSON.stringify({ stu: stu?.name, book: sb?.name }));
  if (!sb) throw new Error("리허설 학생에게 배정된 교재가 없다");

  const today = (await c.query(`select v2.today()::text d`)).rows[0].d;
  // ⚠️ SQL 안에 `${…}` 를 안 끼운다 — 값은 전부 $1 로 넘긴다
  const back = async (k) => (await c.query(`select (v2.today() - $1::int)::text d`, [k])).rows[0].d;
  const d7 = await back(7);
  const d3 = await back(3);

  // ── ⓐ 첫 회 — 지난 판이 아예 없다
  {
    const r = await againPlan(db, { studentId: stu.id, on: today, mode: AGAIN.SAME });
    const b = r.books.find((x) => x.bookId === sb.book_id);
    ok("지난 판이 없으면 「반복」은 **뜻이 없다**고 답한다", b?.why === WHY.FIRST, String(b?.why));
    ok("조절을 얹지 않는다", Object.keys(r.adjust).length === 0, JSON.stringify(r.adjust));
  }

  // ── ⓑ ⚠️ 판은 있는데 **단원이 안 붙은** 줄뿐일 때 — 「첫 회」로 지어내지 않는다
  await c.query("savepoint sp_nounit");
  {
    // 학원 학습(class)은 단원 없이도 선다 — 「교재 없이 구두로 한 날」이 그것이다
    const memoPlan = { studentId: stu.id, date: d3, asOf: today, stale: false, books: [{
      bookId: sb.book_id, name: sb.name, why: null, notes: [], class: [
        { itemId: null, unitId: null, memo: "구두로만 했다", byMemo: true, label: null }], home: [], next: [] }] };
    const w = await freezeDay(db, memoPlan, { classId: null, tx: false });
    ok("단원 없는 학원 학습 한 줄을 지난 판에 세웠다", w.ok === true, `${w.why ?? ""} ${w.msg ?? ""}`);
    const g = await lastGiven(db, { studentId: stu.id, bookId: sb.book_id, before: today });
    ok("⚠️ 「단원이 안 붙어 못 읽었다」를 **「첫 회다」로 지어내지 않는다**", g.why === WHY.NO_UNIT, String(g.why));
    ok("그 판의 날짜를 같이 돌려준다", g.lastSheetOn === d3, `${g.lastSheetOn} ≠ ${d3}`);
  }
  await c.query("rollback to savepoint sp_nounit");

  // ── ⓒ 지난 판을 세운다 — **커서를 다음 대단원으로 옮긴 뒤**라야 ①을 볼 수 있다
  const ch1 = (await c.query(
    `select u.id, u.chapter, u.sub, u.sort from v2.units u
      where u.book_id = $1::uuid and u.state = 'active'
      order by u.sort limit 3`, [sb.book_id])).rows;
  const chapter1 = ch1[0]?.chapter;
  ok("첫 대단원의 줄 셋을 읽었다", ch1.length === 3 && !!chapter1, JSON.stringify(ch1.map((x) => x.sub)));

  const items = (await c.query(
    `select r.item_id, li.name, r.place from v2.area_routine r
       join v2.learn_items li on li.id = r.item_id
      where r.area = $1::text and li.state = 'active' order by r.sort`, [sb.area])).rows;
  const oneClass = items.find((x) => x.place === "class");
  const oneHome = items.find((x) => x.place === "home");
  const onePrev = items.find((x) => x.place === "next");
  ok("그 영역 루틴에서 학원·숙제 항목을 하나씩 골랐다", !!oneClass && !!oneHome,
     JSON.stringify({ n: items.length, cls: oneClass?.name, home: oneHome?.name }));

  // 지난 판: 소단원 셋(=3회차) · 항목 둘만 (나머지는 그날 뺀 것이다)
  const oldPlan = { studentId: stu.id, date: d7, asOf: today, stale: false, books: [{
    bookId: sb.book_id, name: sb.name, why: null, notes: [],
    class: [{ itemId: oneClass.item_id, unitId: ch1[0].id, unitIds: ch1.map((u) => u.id),
              name: oneClass.name, label: "지난 회차", rangeNote: null }],
    home: [{ itemId: oneHome.item_id, unitId: ch1[0].id, unitIds: ch1.map((u) => u.id),
             name: oneHome.name, label: "지난 회차", rangeNote: null }],
    next: [] }] };
  const w7 = await freezeDay(db, oldPlan, { classId: null, tx: false });
  ok("지난 판을 굳혔다 (lib/day.js 가 세운 그 줄들이다)", w7.ok === true && w7.changed === 6,
     `${w7.why ?? ""} changed=${w7.changed} ${w7.msg ?? ""}`);

  // ⚠️ 첫 대단원을 끝낸 것으로 찍는다 — 그래야 커서가 다음 대단원으로 간다
  const doneN = (await c.query(
    `insert into v2.progress (student_id, unit_id, round, status, done_on, last_by)
     select $1::uuid, u.id, $2::smallint, 'done', $3::date, 'staff'
       from v2.units u where u.book_id = $4::uuid and u.state = 'active' and u.chapter = $5::text
     on conflict (student_id, unit_id, round) do update set status = 'done', done_on = excluded.done_on
     returning unit_id`, [stu.id, sb.round, d7, sb.book_id, chapter1])).rowCount;
  const cur = (await c.query(
    `select chapter from v2.cursor_of($1::uuid, $2::uuid, $3::date)`, [stu.id, sb.book_id, today])).rows[0];
  ok("첫 대단원을 끝내니 커서가 **다음 대단원**으로 갔다", !!cur?.chapter && cur.chapter !== chapter1,
     `${chapter1} → ${cur?.chapter} (진도 ${doneN}줄)`);

  // ── ⓓ 「반복」 — 갯수·뺄 항목은 그대로, **단원은 지금 자리**
  {
    const r = await againPlan(db, { studentId: stu.id, on: today, mode: AGAIN.SAME });
    const b = r.books.find((x) => x.bookId === sb.book_id);
    const adj = r.adjust[sb.book_id];
    ok("지난 판을 찾았다", b?.why === WHY.OK && b?.lastOn === d7, `${b?.why} · ${b?.lastOn}`);
    ok("갯수 — 지난번에 소단원 셋이 나갔으니 3회차", adj?.count === 3, JSON.stringify(adj?.count));
    ok("분량 — 범위를 안 적었으니 통째로(null)", adj?.pages === null, JSON.stringify(adj?.pages));
    ok("뺄 항목 — 그날 안 나간 항목이 잡힌다", (adj?.drop ?? []).length > 0, JSON.stringify(adj?.drop?.length));
    if (onePrev) {
      ok("⚠️ 예습 자리는 그날 통째로 없었으므로 **안 뺀다**",
         !(adj?.drop ?? []).includes(String(onePrev.item_id)), onePrev.name);
    }

    const card = r.plan.books.find((x) => x.bookId === sb.book_id);
    const gave = [...(card.class ?? []), ...(card.home ?? [])];
    const unitIds = [...new Set(gave.flatMap((x) => x.unitIds ?? []))];
    const oldIds = new Set(ch1.map((u) => u.id));
    ok("⚠️⚠️ **「반복」이 낸 단원은 지난번 단원이 아니다**",
       unitIds.length > 0 && unitIds.every((x) => !oldIds.has(x)), JSON.stringify(unitIds.length));
    ok("낸 단원은 커서가 선 그 대단원 것이다", card.chapter === cur.chapter, `${card.chapter} ≠ ${cur.chapter}`);
    const names = [...new Set(gave.map((x) => x.name))].sort();
    ok("항목은 **지난번에 낸 그것들뿐**이다",
       JSON.stringify(names) === JSON.stringify([oneClass.name, oneHome.name].sort()), JSON.stringify(names));
  }

  // ── ⓔ 「루틴」 — 루틴대로 전부, 회차는 기본값
  {
    const r = await againPlan(db, { studentId: stu.id, on: today, mode: AGAIN.ROUTINE });
    ok("「루틴」은 조절을 한 톨도 안 얹는다", Object.keys(r.adjust).length === 0, JSON.stringify(r.adjust));
    const card = r.plan.books.find((x) => x.bookId === sb.book_id);
    const names = new Set([...(card.class ?? []), ...(card.home ?? []), ...(card.next ?? [])].map((x) => x.name));
    ok("「루틴」은 루틴 항목이 다 나간다 (「반복」보다 많다)", names.size > 2, JSON.stringify([...names]));
  }

  // ── ⓕ 교재멈춤 — 어느 단추도 안 낸다
  await c.query("savepoint sp_off");
  {
    await c.query(`update v2.student_book set stop_mode = 'book_off' where student_id = $1::uuid and book_id = $2::uuid`,
      [stu.id, sb.book_id]);
    ok("v2.book_stop 이 「book_off」라고 답한다",
       (await stopNow(db, { studentId: stu.id, bookId: sb.book_id, on: today })) === "book_off");
    for (const mode of [AGAIN.SAME, AGAIN.ROUTINE]) {
      const r = await againPlan(db, { studentId: stu.id, on: today, mode });
      const card = r.plan.books.find((x) => x.bookId === sb.book_id);
      const n2 = ["class", "home", "next"].reduce((s, k) => s + (card[k]?.length ?? 0), 0);
      ok(`교재멈춤 — 「${mode}」 가 한 줄도 안 낸다 (진짜 DB)`, n2 === 0, String(n2));
    }
  }
  await c.query("rollback to savepoint sp_off");

  // ── ⓖ ⚠️ 되돌린다 — 자료를 한 줄도 안 남긴다
  await c.query("rollback");
  const left = (await c.query(
    `select count(*)::int n from v2.day_item i join v2.day_sheet s on s.id = i.sheet_id
      where s.student_id = $1::uuid`, [stu.id])).rows[0].n;
  ok("⚠️ 되돌린 뒤 리허설 학생 판에 줄이 **한 줄도 안 남았다**", left === 0, String(left));
  const prog = (await c.query(
    `select count(*)::int n from v2.progress where student_id = $1::uuid`, [stu.id])).rows[0].n;
  ok("진도도 안 남았다", prog === 0, String(prog));
} catch (e) {
  fail++;
  console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
  try { await c?.query("rollback"); } catch { /* 이미 끝난 트랜잭션 */ }
} finally {
  try { await c?.end(); } catch { /* 이미 닫혔다 */ }
}

console.log(`\n■ 갯수 두 단추 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
