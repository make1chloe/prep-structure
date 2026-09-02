/**
 * 판 굳히기 검사 — `lib/day.js`.
 *
 * 여기서 지켜야 하는 것은 넷이다. 넷 다 **오류가 안 나는 사고**라 검사가 아니면 못 잡는다.
 *   ① **두 번 눌러도 같은 결과** — 열쇠(`day_item_one_per_slot`)가 NULLS NOT DISTINCT 라서
 *      「항목 없는 메모 줄」도 두 번 안 선다.
 *   ② **아이가 낸 것을 안 지운다** — 이미 검사가 찍힌 줄은 다시 굳혀도 한 칸도 안 바뀐다.
 *      이번 초안에 없는 줄도 **안 지운다**(대전제 6 — 그 줄에 아이 사진이 붙어 있다).
 *   ③ **범위(단원)가 빈 숙제는 거절한다**(계획 「넷째 길목」) — 그때는 **한 줄도 안 쓴다.**
 *   ④ **0줄이면 실패로 되돌린다**(자동 검사 ⑪) — 단 「바뀔 줄이 애초에 없었다」와는 가른다.
 *
 * ⚠️ **가짜 DB 만 상대하면 죽은 칸·제약 위반을 원리적으로 못 잡는다.**
 *    그래서 아래 ■3 은 **진짜 DB** 로 돈다 — 트랜잭션 안에서 쓰고 끝에 rollback 한다.
 *    (자료는 한 줄도 안 남는다. `v2.audit` 줄까지 같이 되돌아간다)
 */
import { rowsOf, freezeDay, rowKey, DAY_SLOTS, HW_SLOTS } from "../lib/day.js";
import { routineNext } from "../lib/routine.js";
import { Client } from "pg";
import { readFileSync } from "node:fs";

let fail = 0, n = 0;
const ok = (t, c, why = "") => {
  n++;
  if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
  else console.log(`   ✅ ${t}`);
};

// ── 초안 흉내 (routineNext 가 주는 카드 모양 그대로) ───────────────────────────────
const U = (k) => `00000000-0000-4000-8000-00000000000${k}`;
const card = (o = {}) => ({ bookId: "bk1", name: "교재가", class: [], home: [], next: [],
                            why: null, notes: [], ...o });
const draft = (o = {}) => ({ itemId: U(1), unitId: U(2), name: "숙제채점", label: "UNIT 01",
                             rangeNote: null, ...o });
const plan = (books, o = {}) => ({ studentId: U(9), date: "2026-09-02", asOf: "2026-09-02",
                                   stale: false, books, ...o });

console.log("■ ① 초안을 줄로 편다 — **다시 계산하지 않는다. 옮겨 적을 뿐이다**");
{
  const r = rowsOf(plan([card({ class: [draft()], home: [draft()], next: [draft({ unitId: U(3) })] })]));
  ok("세 묶음이 세 줄이 된다", r.rows.length === 3, JSON.stringify(r.rows.length));
  ok("묶음 이름을 그대로 쓴다", r.rows.map((x) => x.slot).join(",") === "class,home,next",
     r.rows.map((x) => x.slot).join(","));
  ok("차례(sort)는 **묶음마다 0부터**", r.rows.every((x) => x.sort === 0),
     JSON.stringify(r.rows.map((x) => [x.slot, x.sort])));
  ok("굳힐 줄이 없으면 bad 도 없다", r.bad.length === 0 && r.merged.length === 0);
}
{
  const r = rowsOf(plan([card({ home: [draft(), draft({ itemId: U(4) }), draft({ unitId: U(5) })] })]));
  ok("같은 묶음 안에서 차례가 0·1·2 로 는다", r.rows.map((x) => x.sort).join(",") === "0,1,2",
     r.rows.map((x) => x.sort).join(","));
}
{
  const two = rowsOf(plan([
    card({ bookId: "bk1", home: [draft()] }),
    card({ bookId: "bk2", name: "교재나", home: [draft({ unitId: U(6) })] }),
  ]));
  ok("교재가 둘이면 같은 묶음 안에서 차례가 이어진다",
     two.rows.map((x) => x.sort).join(",") === "0,1", two.rows.map((x) => x.sort).join(","));
  ok("같은 항목이라도 **단원이 다르면 다른 줄**이다", new Set(two.rows.map(rowKey)).size === 2);
}

console.log("\n■ ② ⚠️ **범위(단원)가 빈 숙제는 거절한다** (계획 「넷째 길목」)");
{
  const r = rowsOf(plan([card({ home: [draft({ unitId: null })] })]));
  ok("범위 없는 숙제는 줄로 안 선다", r.rows.length === 0 && r.bad.length === 1,
     JSON.stringify({ rows: r.rows.length, bad: r.bad.length }));
}
{
  const r = rowsOf(plan([card({ next: [draft({ unitId: null })] })]));
  ok("예습(next)도 마찬가지다", r.bad.length === 1 && r.rows.length === 0);
}
{
  const r = rowsOf(plan([card({ class: [draft({ unitId: null, itemId: null, memo: "구두로 함", byMemo: true })] })]));
  ok("⚠️ 학원 학습(class)은 단원이 없어도 선다 — 「교재 없이 구두로 한 날」이 그것이다",
     r.rows.length === 1 && r.bad.length === 0, JSON.stringify(r.bad));
  ok("막는 자리는 숙제 둘뿐이다", HW_SLOTS.join(",") === "home,next", HW_SLOTS.join(","));
}
{
  const r = rowsOf(plan([card({ home: [draft(), draft()] })]));
  ok("열쇠가 같은 줄은 **접고 세어서 돌려준다** (조용히 안 접는다)",
     r.rows.length === 1 && r.merged.length === 1, JSON.stringify(r.merged.length));
}
{
  const r = rowsOf(plan([card({ why: "이 아이는 이 교재에 지금 낼 것이 없습니다" })]));
  ok("한 줄도 안 나온 교재는 **까닭과 함께** 돌려준다",
     r.empty.length === 1 && /낼 것이 없/.test(r.empty[0].why ?? ""), JSON.stringify(r.empty));
}
ok("판이 받는 묶음은 넷이다 (check 는 초안이 안 차린다)",
   DAY_SLOTS.join(",") === "check,class,home,next", DAY_SLOTS.join(","));

console.log("\n■ ③ 문지기 — 거절할 때는 **DB 를 아예 안 건드린다**");
{
  // ⚠️ 이 가짜 DB 는 **건드리면 터진다.** 문지기가 새면 그 자리가 여기서 드러난다.
  //    터진 것을 잡아서 ❌ 로 적는다 — 검사가 통째로 죽으면 나머지를 못 본다
  const noDb = { query: () => { throw new Error("DB 를 건드렸다 — 거절할 자리에서 새어 나갔다"); } };
  const dry = async (p, o) => {
    try { return await freezeDay(noDb, p, o); }
    catch (e) { return { ok: null, why: "threw", msg: String(e?.message ?? e) }; }
  };

  const r0 = await dry(plan([card({ home: [draft()] })]), {});
  ok("classId 를 빼먹으면 거절한다 (특강 판이 정규 판을 덮는 자리다)",
     r0.why === "threw" && /classId/.test(r0.msg), r0.msg?.slice(0, 60));

  const r1 = await dry(plan([card({ home: [draft({ unitId: null })] })]), { classId: null });
  ok("범위 없는 숙제 — **한 줄도 안 쓰고** 되돌린다", r1.ok === false && r1.why === "no_range",
     `${r1.why} · ${r1.msg?.slice(0, 60)}`);
  ok("무엇이 잘못됐는지 화면에 말해 준다", /범위/.test(r1.msg ?? ""), r1.msg);

  const r2 = await dry(plan([card()]), { classId: null });
  ok("굳힐 줄이 하나도 없으면 **판도 안 세운다**", r2.ok === false && r2.why === "empty",
     `${r2.why} · ${r2.msg?.slice(0, 60)}`);

  const r3 = await dry({ books: [] }, { classId: null });
  ok("학생 없는 초안은 거절한다", r3.why === "threw" && /학생/.test(r3.msg), r3.msg?.slice(0, 40));
}

// ── ■4 진짜 DB ────────────────────────────────────────────────────────────────
console.log("\n■ ④ 진짜 DB — 트랜잭션 안에서 쓰고 끝에 되돌린다");
let c = null;
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
  await c.query("begin");

  const db = { query: (s, p) => c.query(s, p) };
  /** 트랜잭션 안에서 또 트랜잭션을 흉내 낸다 — `opts.tx` 가 진짜 되돌리는지 보려고 */
  const savept = (name) => ({
    query: (s, p) => {
      const k = String(s).trim().toLowerCase();
      if (k === "begin") return c.query(`savepoint ${name}`);
      if (k === "rollback") return c.query(`rollback to savepoint ${name}`);
      if (k === "commit") return c.query(`release savepoint ${name}`);
      return c.query(s, p);
    },
  });

  // ⚠️⚠️ **진짜 재원생에게 쓰지 마라.** 앞 판에서 이 줄이 `state='active'` 로 골라
  //    **장원우의 오늘 판에 검사 자료 52줄**을 남겼다 — 원장님이 앱을 열면 없는 숙제가 보인다.
  //    되돌리기가 한 번 실패하면 그대로 굳는다. 리허설 계정으로만 쓴다(대전제 1 · fixture).
  const stu = (await c.query(
    `select id, name from v2.students where import_batch = 'fixture' order by name limit 1`)).rows[0];
  if (!stu) throw new Error("리허설 학생(zz_시험_)이 없다 — 진짜 학생으로는 안 돌린다");
  const units = (await c.query(
    `select u.id, u.book_id from v2.units u where u.state='active' order by u.book_id, u.sort limit 3`)).rows;
  const items = (await c.query(`select id from v2.learn_items order by sort, id limit 2`)).rows;
  ok("검사에 쓸 진짜 학생·단원·항목을 찾았다",
     !!stu && units.length === 3 && items.length === 2,
     JSON.stringify({ stu: !!stu, units: units.length, items: items.length }));

  // ⚠️ 진짜 자료를 안 스치도록 **아무 판도 없는 앞날**을 쓴다 (되돌리기는 하지만 겹치면 뜻이 흐려진다)
  const day = (await c.query(`select (v2.today() + 400)::text d`)).rows[0].d;
  const today = (await c.query(`select v2.today()::text d`)).rows[0].d;
  const nRows = async (d = day) => (await c.query(
    `select count(*)::int n from v2.day_item i join v2.day_sheet s on s.id=i.sheet_id
      where s.student_id=$1 and s.date=$2::date`, [stu.id, d])).rows[0].n;

  const real = (o = {}) => plan([card({
    bookId: units[0].book_id,
    class: [draft({ itemId: items[0].id, unitId: units[0].id })],
    home: [draft({ itemId: items[0].id, unitId: units[0].id, rangeNote: "p.10~12" }),
           draft({ itemId: items[1].id, unitId: units[1].id })],
    next: [draft({ itemId: items[0].id, unitId: units[2].id })],
  })], { studentId: stu.id, date: day, asOf: today, ...o });

  ok("굳히기 전 그날 판에 줄이 하나도 없다", (await nRows()) === 0, String(await nRows()));

  // ── ⓐ 미리보기는 아무것도 안 만든다
  {
    const p = await freezeDay(db, real(), { classId: null, dryRun: true });
    const sheets = (await c.query(
      `select count(*)::int n from v2.day_sheet where student_id=$1 and date=$2::date`, [stu.id, day])).rows[0].n;
    ok("미리보기는 판도 줄도 **안 만든다**", p.ok === true && sheets === 0 && (await nRows()) === 0,
       JSON.stringify({ sheets, rows: await nRows() }));
    ok("미리보기가 「몇 줄이 설지」를 말해 준다", p.stood.length === 4, String(p.stood.length));
  }

  // ── ⓑ 굳힌다 — 판이 없으면 attendanceWrite 가 먼저 세운다
  const r1 = await freezeDay(db, real(), { classId: null, tx: false });
  ok("굳혔다 (진짜 DB)", r1.ok === true, `${r1.why ?? ""} ${r1.msg ?? ""}`);
  ok("⚠️ 판이 없어서 **먼저 세웠다** — 직접 insert 하지 않았다", r1.sheetMade === true && !!r1.sheetId,
     JSON.stringify({ made: r1.sheetMade, sheet: !!r1.sheetId }));
  ok("네 줄이 새로 섰다", r1.stood.length === 4 && r1.changed === 4,
     JSON.stringify({ stood: r1.stood.length, changed: r1.changed }));
  ok("미리 센 것과 실제가 같다 (expected === changed)", r1.expected === r1.changed,
     JSON.stringify({ e: r1.expected, c: r1.changed }));
  ok("진짜 판에 네 줄이 남았다", (await nRows()) === 4, String(await nRows()));

  const back = (await c.query(
    `select i.slot, i.item_id, i.unit_id, i.range_note, i.status, i.sort
       from v2.day_item i join v2.day_sheet s on s.id=i.sheet_id
      where s.student_id=$1 and s.date=$2::date order by i.slot, i.sort`, [stu.id, day])).rows;
  ok("새로 선 줄은 전부 **미검사('none')** 다", back.every((x) => x.status === "none"),
     JSON.stringify(back.map((x) => x.status)));
  ok("범위를 적은 줄은 범위가 그대로 남았다",
     back.some((x) => x.range_note === "p.10~12"), JSON.stringify(back.map((x) => x.range_note)));
  ok("숙제 줄은 **전부 단원이 붙어 있다** (넷째 길목)",
     back.filter((x) => HW_SLOTS.includes(x.slot)).every((x) => !!x.unit_id),
     JSON.stringify(back.filter((x) => HW_SLOTS.includes(x.slot)).map((x) => x.unit_id)));

  // ── ⓒ ⚠️ **두 번 눌러도 같은 결과**
  const r2 = await freezeDay(db, real(), { classId: null, tx: false });
  ok("⚠️ 두 번 눌러도 줄이 안 는다 (열쇠가 잡는다)", (await nRows()) === 4, String(await nRows()));
  ok("두 번째는 **새로 선 줄이 없다** — 다시 적었을 뿐이다",
     r2.ok === true && r2.stood.length === 0 && r2.again.length === 4,
     JSON.stringify({ stood: r2.stood.length, again: r2.again.length }));
  ok("판이 이미 서 있으면 다시 안 세운다", r2.sheetMade === false && r2.sheetId === r1.sheetId);

  // ── ⓓ ⚠️⚠️ **아이가 낸 것·찍은 것을 안 지운다**
  const hw = back.find((x) => x.slot === "home" && x.range_note === "p.10~12");
  await c.query(
    `update v2.day_item i set status='done', done_note='아이가 여기까지 했다'
      from v2.day_sheet s where s.id=i.sheet_id and s.student_id=$1 and s.date=$2::date
        and i.slot='home' and i.unit_id=$3`, [stu.id, day, hw.unit_id]);
  const r3 = await freezeDay(db, plan([card({
    bookId: units[0].book_id,
    class: [draft({ itemId: items[0].id, unitId: units[0].id })],
    home: [draft({ itemId: items[0].id, unitId: units[0].id, rangeNote: "p.99~100" }),   // 범위를 바꿔 다시 굳힌다
           draft({ itemId: items[1].id, unitId: units[1].id })],
    next: [draft({ itemId: items[0].id, unitId: units[2].id })],
  })], { studentId: stu.id, date: day, asOf: today }), { classId: null, tx: false });
  const after = (await c.query(
    `select i.slot, i.unit_id, i.range_note, i.status, i.done_note
       from v2.day_item i join v2.day_sheet s on s.id=i.sheet_id
      where s.student_id=$1 and s.date=$2::date and i.slot='home' and i.unit_id=$3`,
    [stu.id, day, hw.unit_id])).rows[0];
  ok("⚠️⚠️ 이미 ○ 가 찍힌 줄은 다시 굳혀도 **한 칸도 안 바뀐다**",
     after.range_note === "p.10~12" && after.status === "done", JSON.stringify(after));
  ok("아이가 적은 것(done_note)도 그대로다", after.done_note === "아이가 여기까지 했다", String(after.done_note));
  ok("그 줄을 「안 건드렸다」고 화면에 말해 준다", r3.kept.length === 1, JSON.stringify(r3.kept.length));
  ok("나머지 줄은 그대로 다시 적힌다", r3.ok === true && r3.again.length === 3,
     JSON.stringify({ again: r3.again.length, changed: r3.changed }));
  ok("바뀔 줄만 세었다 (expected 가 4가 아니라 3이다)", r3.expected === 3, String(r3.expected));

  // ── ⓔ ⚠️ **이번 초안에 없는 줄도 안 지운다** (대전제 6 — 그 줄에 아이 사진이 붙어 있다)
  const r4 = await freezeDay(db, plan([card({
    bookId: units[0].book_id,
    home: [draft({ itemId: items[1].id, unitId: units[1].id })],
  })], { studentId: stu.id, date: day, asOf: today }), { classId: null, tx: false });
  ok("⚠️ 초안에서 빠진 줄을 **안 지운다**", (await nRows()) === 4, String(await nRows()));
  ok("빠진 줄이 몇인지 화면에 말해 준다", r4.extra.length === 3, JSON.stringify(r4.extra.length));

  // ── ⓕ 범위 빈 숙제 — **한 줄도 안 쓴다** (진짜 DB 로도)
  const r5 = await freezeDay(db, plan([card({
    bookId: units[0].book_id,
    home: [draft({ itemId: items[0].id, unitId: null })],
  })], { studentId: stu.id, date: day, asOf: today }), { classId: null, tx: false });
  ok("⚠️ 범위 없는 숙제는 진짜 DB 에도 한 줄도 안 들어간다",
     r5.ok === false && r5.why === "no_range" && (await nRows()) === 4,
     JSON.stringify({ why: r5.why, rows: await nRows() }));

  // ── ⓖ ⚠️ **0줄이면 실패로 되돌린다** (자동 검사 ⑪)
  {
    const sp = savept("blocked");
    // 접근 규칙이 막아 0줄이 오는 상황을 흉내 낸다 — 굳히는 문만 0줄로 바꿔치기한다
    const blocked = { query: (s, p) => (/day:freeze/.test(String(s)) ? { rows: [] } : sp.query(s, p)) };
    const day2 = (await c.query(`select (v2.today() + 401)::text d`)).rows[0].d;
    const r6 = await freezeDay(blocked, plan([card({
      bookId: units[0].book_id, home: [draft({ itemId: items[0].id, unitId: units[0].id })],
    })], { studentId: stu.id, date: day2, asOf: today }), { classId: null, tx: true });
    const sheets2 = (await c.query(
      `select count(*)::int n from v2.day_sheet where student_id=$1 and date=$2::date`, [stu.id, day2])).rows[0].n;
    ok("⚠️ 0줄이 오면 **성공이라 말하지 않는다**", r6.ok === false && r6.why === "no_rows",
       JSON.stringify({ ok: r6.ok, why: r6.why }));
    ok("⚠️ 되돌렸다 — 그 사이 세운 판까지 같이 사라진다 (opts.tx)", sheets2 === 0, String(sheets2));
    ok("무엇이 막았는지 말해 준다", /한 줄도 안 바뀌/.test(r6.msg ?? ""), r6.msg);
  }

  // ── ⓗ 「바뀔 줄이 애초에 없었다」는 **실패가 아니다**
  {
    await c.query(
      `update v2.day_item i set status='weak' from v2.day_sheet s
        where s.id=i.sheet_id and s.student_id=$1 and s.date=$2::date`, [stu.id, day]);
    const r7 = await freezeDay(db, real(), { classId: null, tx: false });
    ok("⚠️ 전부 찍혀 있어 0줄이면 **그건 실패가 아니다**",
       r7.ok === true && r7.changed === 0 && r7.expected === 0,
       JSON.stringify({ ok: r7.ok, changed: r7.changed, expected: r7.expected }));
    ok("네 줄 다 「안 건드렸다」로 온다", r7.kept.length === 4, String(r7.kept.length));
    ok("화면에 「바뀐 것이 없다」고 말한다", /바뀐 것이 없/.test(r7.msg ?? ""), r7.msg);
  }

  // ── ⓘ 마감한 판에는 줄을 안 세운다
  {
    await c.query(`update v2.day_sheet set closed_at = now() where id = $1`, [r1.sheetId]);
    const r8 = await freezeDay(db, real(), { classId: null, tx: false });
    ok("⚠️ 마감한 판에는 줄을 안 세운다 (학부모가 이미 봤다)",
       r8.ok === false && r8.why === "closed", JSON.stringify({ ok: r8.ok, why: r8.why }));
    ok("줄 수가 안 늘었다", (await nRows()) === 4, String(await nRows()));
    await c.query(`update v2.day_sheet set closed_at = null where id = $1`, [r1.sheetId]);
  }

  // ── ⓙ ⚠️ **진짜 초안(routineNext)이 준 것을 그대로 굳힌다** — 모양이 맞는지 여기서 드러난다
  {
    const cands = (await c.query(
      `select s.id from v2.students s
         join v2.student_book sb on sb.student_id=s.id
          and sb.from_date<=v2.today() and (sb.to_date is null or sb.to_date>=v2.today())
        where s.state='active' group by s.id order by count(*) desc limit 5`)).rows;
    let got = null;
    for (const s of cands) {
      const p = await routineNext(db, { studentId: s.id, on: today });
      const r = rowsOf(p);
      if (r.rows.length) { got = { p, r, sid: s.id }; break; }
    }
    ok("진짜 초안에서 굳힐 줄이 나온다 (routineNext → rowsOf)", !!got && got.r.rows.length > 0,
       got ? String(got.r.rows.length) : "다섯 아이 전부 초안이 비었다");
    if (got) {
      ok("⚠️ 진짜 초안의 숙제 줄에는 **전부 단원이 붙어 있다** (넷째 길목과 안 부딪힌다)",
         got.r.bad.length === 0, JSON.stringify(got.r.bad.map((x) => [x.slot, x.name])));
      ok("열쇠가 겹치는 줄이 없다 (겹치면 접는다 — 조용히는 아니다)",
         new Set(got.r.rows.map(rowKey)).size === got.r.rows.length);
      // 오늘 판이 이미 마감돼 있으면 굳힐 수 없다 — 되돌아갈 트랜잭션이니 잠깐 연다
      await c.query(`update v2.day_sheet set closed_at=null where student_id=$1 and date=$2::date`,
                    [got.sid, today]);
      const before = (await c.query(
        `select count(*)::int n from v2.day_item i join v2.day_sheet s on s.id=i.sheet_id
          where s.student_id=$1 and s.date=$2::date`, [got.sid, today])).rows[0].n;
      const rr = await freezeDay(db, got.p, { classId: null, tx: false });
      const afterN = (await c.query(
        `select count(*)::int n from v2.day_item i join v2.day_sheet s on s.id=i.sheet_id
          where s.student_id=$1 and s.date=$2::date`, [got.sid, today])).rows[0].n;
      ok("⚠️ 진짜 초안이 진짜 판으로 굳는다", rr.ok === true, `${rr.why ?? ""} ${rr.msg ?? ""}`);
      ok("새로 선 줄만큼 판이 늘었다", afterN - before === rr.stood.length,
         JSON.stringify({ before, afterN, stood: rr.stood.length }));
      // 두 번 눌러도 같은 결과 — 진짜 초안으로도
      await freezeDay(db, got.p, { classId: null, tx: false });
      const afterN2 = (await c.query(
        `select count(*)::int n from v2.day_item i join v2.day_sheet s on s.id=i.sheet_id
          where s.student_id=$1 and s.date=$2::date`, [got.sid, today])).rows[0].n;
      ok("⚠️ 진짜 초안도 두 번 눌러 줄이 안 는다", afterN2 === afterN, `${afterN} → ${afterN2}`);
    }
  }

  await c.query("rollback");
  const left = (await c.query(
    `select count(*)::int n from v2.day_sheet where student_id=$1 and date >= (v2.today()+400)::date`,
    [stu.id])).rows[0].n;
  ok("⚠️ 검사가 쓴 것은 **한 줄도 안 남는다** (rollback)", left === 0, String(left));
} catch (e) {
  fail++;
  console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
  try { await c?.query("rollback"); } catch { /* 이미 닫혔다 */ }
} finally {
  try { await c?.end(); } catch { /* 이미 닫혔다 */ }
}

console.log(`\n■ 판 굳히기 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
