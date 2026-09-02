/** 마감 검사 — **글자로 훑지 않고 실제로 돌려 본다.**
 *  가짜 DB 를 끼워 함수를 부르고 **무엇이 나갔나·무엇이 올라갔나를 센다.**
 *
 *  계획 자동 검사 ⑤ 마감 가리기가 빠뜨린 칸이 없는가
 *                ⑪ 0줄이면 실패로 되돌리는가
 *                ⑭ 메모 자동완료가 **그 교재에만** 걸리는가 · 예습은 안 올리는가
 *  사고 #7(마감 전 내용이 학부모 화면에) · #8(되돌리면 판을 지움) · 물음 Q(늦귀가) · T(빈 카드)
 */
import {
  closeGate, closeSheet, reopenSheet, sheetForFamily, itemsForFamily,
  familyDayLabel, hideEmptyCards, STAFF_ONLY, ASK, PREPARING, NOTHING, DAY_OPEN,
} from "../lib/close.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };
/** ⚠️ 터지는 것도 **실패**다. 그대로 두면 거기서 검사가 멈춰 아래 것들이 안 돌고,
 *  그 사이에 새는 자리가 생긴다 — 터진 것을 한 줄로 바꿔 계속 둔다 */
const attempt = async (f) => { try { return await f(); } catch (e) { return { ok: false, why: `터졌다 — ${e.message}` }; } };

// ── 가짜 DB — 실제로 무엇이 오갔는지 센다 ───────────────────────
function fakeDb(w = {}) {
  const st = {
    sheet: w.sheet ?? null, items: w.items ?? [], late: w.late ?? [],
    quiz: w.quiz ?? [], sb: w.sb ?? [], streak: w.streak ?? [],
  };
  const calls = [], progress = [];
  return { calls, progress, st,
    async query(sql, p = []) {
      const s = String(sql).trim();
      calls.push(s);
      if (/^(begin|commit|rollback)$/i.test(s)) return { rows: [] };
      if (s.includes("bool_and")) return { rows: st.streak };
      if (s.includes("from v2.day_sheet where id")) return { rows: st.sheet ? [st.sheet] : [] };
      if (s.includes("from v2.day_item i")) return { rows: st.items };
      if (s.includes("from v2.late_stay")) return { rows: st.late };
      if (s.includes("from v2.quiz")) return { rows: st.quiz };
      if (s.includes("from v2.student_book")) return { rows: st.sb };
      if (s.includes("insert into v2.progress")) {
        const [stu, ids, round, on] = p;
        for (const u of ids) progress.push({ student: stu, unit_id: u, round, done_on: on });
        return { rows: ids.map((u) => ({ unit_id: u })) };
      }
      if (s.includes("set closed_at = null")) {                       // 되돌리기
        if (!st.sheet?.closed_at) return { rows: [] };
        const out = { id: st.sheet.id, sent_at: st.sheet.sent_at ?? null };
        st.sheet = { ...st.sheet, closed_at: null, closed_by: null };
        return { rows: [out] };
      }
      if (s.includes("set closed_at = coalesce")) {                   // 마감
        if (w.closeFails || st.sheet?.closed_at) return { rows: [] }; // 누가 먼저 눌렀다
        const at = p[1] ?? "2026-09-02T21:00:00+09:00";
        st.sheet = { ...st.sheet, closed_at: at, closed_by: p[2] };
        return { rows: [{ id: st.sheet.id, closed_at: at }] };
      }
      throw new Error("가짜 DB 가 모르는 문 — " + s.slice(0, 70));
    } };
}

// ── 밑감 ────────────────────────────────────────────────────────
const S = "sheet-1", ST = "stu-1", BA = "book-A", BB = "book-B";
const sheet = (o = {}) => ({
  id: S, student_id: ST, class_id: "cls-1", date: "2026-09-02", attend: "present",
  closed_at: null, closed_by: null, sent_at: null,
  comment: "오늘 관계대명사 했습니다", staff_note: "⚠️ 어머니 전화 아직", ...o });
const item = (o = {}) => ({
  id: "i" + Math.random().toString(36).slice(2, 7), slot: "class", item_id: null,
  book_id: null, unit_id: null, range_note: null, status: null, done_note: null, memo: null, sort: 0,
  book_name: null, unit_chapter: null, unit_sub: null, unit_activity: null, ...o });

// 교재 A 는 메모로 대신한 날 · 교재 B 는 그냥 한 날
const twoBooks = () => [
  item({ slot: "class", book_id: BA, unit_id: "uA1", memo: "교재 덮고 구두로 설명", book_name: "PSS", unit_chapter: "CH1", unit_sub: "1-4" }),
  item({ slot: "home",  book_id: BA, unit_id: "uA2", memo: "교재 덮고 구두로 설명", book_name: "PSS", unit_chapter: "CH1", unit_sub: "1-5" }),
  item({ slot: "next",  book_id: BA, unit_id: "uA3", memo: "교재 덮고 구두로 설명", book_name: "PSS", unit_chapter: "CH2", unit_sub: "2-1" }),
  item({ slot: "class", book_id: BB, unit_id: "uB1", book_name: "3800제", unit_chapter: "CH7" }),
  item({ slot: "home",  book_id: BB, unit_id: "uB2", book_name: "3800제", unit_chapter: "CH7" }),
];
const sbBoth = [{ book_id: BA, round: 2, from_date: "2026-01-01" }, { book_id: BB, round: 1, from_date: "2026-01-01" }];

console.log("■ 마감 전 가리기 — 값에 안 싣는다 (사고 #7)");
{
  const open = sheet(), closed = sheet({ closed_at: "2026-09-02T21:00:00+09:00" });
  const pOpen = sheetForFamily(open, { role: "parent" });
  const pClosed = sheetForFamily(closed, { role: "parent" });
  ok("마감 전 — 학부모 값에 수업 내용이 **키째로 없다**", !("comment" in pOpen), Object.keys(pOpen).join(","));
  ok("마감 전 — 학부모 값에 원장 메모가 없다", !("staff_note" in pOpen));
  ok("마감 뒤 — 수업 내용은 실린다", pClosed.comment === open.comment);
  ok("마감 뒤에도 — 원장 메모는 **키째로 없다**", !("staff_note" in pClosed), Object.keys(pClosed).join(","));
  ok("원장에게는 원장 메모가 그대로 간다", sheetForFamily(closed, { role: "staff" }).staff_note === open.staff_note);
  ok("학생 화면도 학부모와 같은 문을 지난다", !("staff_note" in sheetForFamily(closed, { role: "student" })));
  // 계획 자동 검사 ⑤ — 목록에 적힌 칸이 하나라도 남으면 실패
  const left = STAFF_ONLY.day_sheet.filter((c) => c in pClosed || c in pOpen);
  ok("STAFF_ONLY 에 적은 칸이 한 칸도 안 남았다", left.length === 0, left.join(","));
}
{
  const open = sheet(), closed = sheet({ closed_at: "2026-09-02T21:00:00+09:00" });
  const its = twoBooks();
  ok("마감 전 — 판 안의 줄이 0개다", itemsForFamily(its, open, { role: "parent" }).length === 0);
  ok("마감 뒤 — 판 안의 줄이 그대로 간다", itemsForFamily(its, closed, { role: "parent" }).length === its.length);
  ok("원장은 마감 전에도 줄을 다 본다", itemsForFamily(its, open, { role: "staff" }).length === its.length);
}
{
  ok(`마감 전 글은 「${PREPARING}」`, familyDayLabel(sheet(), { hasContent: true }) === PREPARING);
  ok(`마감 뒤 빈 날은 「${NOTHING}」로 굳는다`,
     familyDayLabel(sheet({ closed_at: "x" }), { hasContent: false }) === NOTHING);
  ok("마감 뒤 내용이 있으면 라벨이 없다", familyDayLabel(sheet({ closed_at: "x" }), { hasContent: true }) === null);
  ok(`달력의 마감 안 한 날은 「${DAY_OPEN}」`, sheetForFamily(sheet(), { role: "parent" }).dayLabel === DAY_OPEN);
  // 물음 T — 원장 화면에서는 빈 것도 보여야 빠뜨린 것을 잡는다
  ok("빈 카드 숨기기는 아이·학부모만", hideEmptyCards("parent") && hideEmptyCards("student"));
  ok("원장 화면에서는 빈 것도 보인다", hideEmptyCards("staff") === false);
}

console.log("\n■ 마감할 수 있나 — 막지 않고 묻는다");
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth,
    late: [{ id: "L1", reason: "재시험 남음", until_at: "22:00", left_at: null, sent_at: null }] });
  const g = await closeGate(db, S);
  ok("⚠️ 늦귀가를 안 보냈으면 **반드시 묻는** 물음이 선다", g.mustAsk.includes(ASK.LATE_UNSENT), g.mustAsk.join(","));
  ok("늦귀가 물음이 몇 건인지 말한다", g.asks.find((a) => a.code === ASK.LATE_UNSENT)?.n === 1);
}
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth,
    late: [{ id: "L1", reason: "x", until_at: "22:00", left_at: "22:10", sent_at: "2026-09-02T20:00:00+09:00" }] });
  const g = await closeGate(db, S);
  ok("늦귀가를 보냈으면 그 물음은 안 뜬다", g.mustAsk.length === 0, g.mustAsk.join(","));
}
{
  const its = [
    item({ slot: "check", book_id: BB, unit_id: "uB1", status: null, book_name: "3800제" }),
    item({ slot: "home",  book_id: BB, unit_id: null, range_note: null, book_name: "3800제" }),
  ];
  const db = fakeDb({ sheet: sheet({ comment: null }), items: its, sb: sbBoth,
    quiz: [{ id: "q1", kind: "word", state: "taken", total: 20, correct: null, wrong: null, cut_pct: 90 }] });
  const g = await closeGate(db, S);
  const codes = g.asks.map((a) => a.code);
  ok("안 찍은 검사를 부른다", codes.includes(ASK.ITEM_UNCHECKED), codes.join(","));
  ok("범위 없는 숙제를 부른다", codes.includes(ASK.ITEM_NO_RANGE));
  ok("채점 안 한 시험을 부른다", codes.includes(ASK.QUIZ_UNSCORED));
  ok("부모님께 나갈 글이 비었다고 부른다", codes.includes(ASK.NO_COMMENT));
  ok("⚠️ 그래도 **막지 않는다** (반드시 묻는 것은 늦귀가뿐)", g.mustAsk.length === 0, g.mustAsk.join(","));
}

console.log("\n■ 메모 자동완료 — 누르기 전에 보여준다 (㊳)");
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth });
  const g = await closeGate(db, S);
  const books = g.preview.autoDone.map((b) => b.book_id);
  ok("메모를 단 교재만 미리보기에 선다", JSON.stringify(books) === JSON.stringify([BA]), books.join(","));
  const units = g.preview.autoDone[0].units.map((u) => u.unit_id).sort();
  ok("⭐ 예습(next) 줄은 안 올라간다", !units.includes("uA3"), units.join(","));
  ok("올라갈 단원이 둘이다", JSON.stringify(units) === JSON.stringify(["uA1", "uA2"]), units.join(","));
  ok("그 아이의 그 회독으로 올린다 (2회독)", g.preview.autoDone[0].round === 2);
  ok("단원 이름을 보여준다 (「CH1 › 1-4」)", g.preview.autoDone[0].units[0].label === "CH1 › 1-4",
     g.preview.autoDone[0].units[0].label);
  ok("마감하면 무엇이 학부모에게 가는지도 보여준다", g.preview.reachesFamily.length > 0);
}
{
  // 회독을 모르는 교재 — 지어내면 엉뚱한 회독이 ○ 가 된다
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: [{ book_id: BB, round: 1, from_date: "2026-01-01" }] });
  const g = await closeGate(db, S);
  ok("배정 줄이 없으면 회독을 지어내지 않는다", g.preview.autoDone.length === 0, JSON.stringify(g.preview.autoDone));
  ok("그 사실을 물음으로 부른다", g.asks.some((a) => a.code === ASK.NO_ROUND));
}
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth, streak: [
    { date: "2026-09-02", book_id: BA, memo_only: true },
    { date: "2026-08-30", book_id: BA, memo_only: true },
    { date: "2026-08-27", book_id: BA, memo_only: true },
    { date: "2026-08-24", book_id: BA, memo_only: false }] });
  const g = await closeGate(db, S);
  const a = g.asks.find((x) => x.code === ASK.MEMO_STREAK);
  ok("3회 연속 메모면 앱이 먼저 부른다", a?.n === 3, JSON.stringify(a ?? null));
  ok("⚠️ 부르기만 하고 막지는 않는다", a?.must === false);
}

console.log("\n■ 마감한다 — 되돌릴 수 없는 자리라 서버 답을 기다린다");
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth,
    late: [{ id: "L1", reason: "x", until_at: "22:00", left_at: null, sent_at: null }] });
  const r = await attempt(() => closeSheet(db, S, { by: "me" }));
  ok("⚠️ 늦귀가를 안 물으면 마감이 거절된다", r.ok === false && r.why === "ask", JSON.stringify(r.need ?? r.why));
  ok("거절이면 판이 안 닫힌다", db.st.sheet.closed_at === null);
  ok("거절이면 진도가 한 줄도 안 올라간다", db.progress.length === 0, String(db.progress.length));
}
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth,
    late: [{ id: "L1", reason: "x", until_at: "22:00", left_at: null, sent_at: null }] });
  const r = await closeSheet(db, S, { by: "me", confirm: [ASK.LATE_UNSENT] });
  ok("물으면 마감된다", r.ok === true, JSON.stringify(r.why ?? ""));
  ok("판이 닫혔다", !!db.st.sheet.closed_at);
  const got = db.progress.map((x) => x.unit_id).sort();
  ok("⭐⭐ 메모 자동완료가 **그 교재에만** 걸린다 (교재 B 는 안 올라간다)",
     JSON.stringify(got) === JSON.stringify(["uA1", "uA2"]), got.join(","));
  ok("올린 회독이 그 아이의 회독이다 (2)", db.progress.every((x) => x.round === 2));
  ok("완료 날짜는 그 판의 날이다", db.progress.every((x) => x.done_on === "2026-09-02"));
  ok("트랜잭션으로 묶었다 (begin·commit)", db.calls.includes("begin") && db.calls.includes("commit"));
}
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth });
  const r = await attempt(() => closeSheet(db, S, { by: "me", expect: "누가-회차를-고치기-전-지문" }));
  ok("보여준 뒤 판이 바뀌었으면 멈춘다", r.ok === false && r.why === "changed", JSON.stringify(r.why));
  ok("멈췄으면 진도가 안 올라간다", db.progress.length === 0);
  ok("멈췄으면 판도 안 닫힌다", db.st.sheet.closed_at === null);
}
{
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth });
  const g = await closeGate(db, S);
  const r = await closeSheet(db, S, { by: "me", expect: g.preview.stamp });
  ok("보여준 지문 그대로면 마감된다", r.ok === true, JSON.stringify(r.why ?? ""));
  ok("올라간 것이 미리보기와 같다",
     JSON.stringify(r.autoDone[0].units.map((u) => u.unit_id)) === JSON.stringify(["uA1", "uA2"]));
}
{
  const db = fakeDb({ sheet: sheet({ closed_at: "2026-09-01T21:00:00+09:00" }), items: twoBooks(), sb: sbBoth });
  const r = await attempt(() => closeSheet(db, S, { by: "me" }));
  ok("이미 마감한 판은 두 번 안 마감한다", r.ok === false && r.why === "already_closed");
  ok("두 번째 마감은 진도를 안 올린다", db.progress.length === 0);
}
{
  // 폰과 PC 에서 같이 눌렀다 — update 가 0줄로 온다
  const db = fakeDb({ sheet: sheet(), items: twoBooks(), sb: sbBoth, closeFails: true });
  const r = await attempt(() => closeSheet(db, S, { by: "me" }));
  ok("마감이 0줄이면 **실패**다 (자동 검사 ⑪)", r.ok === false && r.why === "no_rows", JSON.stringify(r.why));
  ok("0줄이면 진도도 안 올라간다", db.progress.length === 0);
  ok("0줄이면 되돌린다 (rollback)", db.calls.includes("rollback"));
}

console.log("\n■ 되돌리기 — 판을 지우지 않는다 (사고 #8)");
{
  const db = fakeDb({ sheet: sheet({ closed_at: "2026-09-02T21:00:00+09:00",
                                     sent_at: "2026-09-02T21:05:00+09:00" }) });
  const r = await reopenSheet(db, S, { by: "me" });
  ok("되돌리면 성공한다", r.ok === true);
  ok("⚠️ 판 줄이 그대로 남는다", db.st.sheet !== null && db.st.sheet.id === S);
  ok("⚠️ 지우는 문을 한 번도 안 불렀다", !db.calls.some((s) => /\bdelete\b/i.test(s)), db.calls.join(" | "));
  ok("⚠️ 발송 자취(sent_at)를 안 건드린다", db.st.sheet.sent_at === "2026-09-02T21:05:00+09:00");
  ok("되돌린 판은 다시 가려진다", sheetForFamily(db.st.sheet, { role: "parent" }).state === "preparing");
  ok("되돌린 판은 다시 「아직 정리 중이에요」", familyDayLabel(db.st.sheet, { hasContent: true }) === PREPARING);
}
{
  const db = fakeDb({ sheet: sheet() });
  const r = await reopenSheet(db, S);
  ok("안 닫힌 판을 되돌리면 0줄 = 실패", r.ok === false && r.why === "not_closed");
}

console.log("\n■ 글자를 훑는다 — 마감을 지나지 않는 자리가 없는가");
{
  const src = readFileSync("lib/close.js", "utf8");
  ok("lib/close.js 는 판을 지우는 문을 안 쓴다", !/delete\s+from\s+v2\.day_sheet/i.test(src));
  const walk = (d, out = []) => { for (const f of readdirSync(d)) {
    if ([ "node_modules", ".next", ".git", "backup" ].includes(f)) continue;
    const p = join(d, f); statSync(p).isDirectory() ? walk(p, out)
      : /\.(js|jsx|ts|tsx|mjs)$/.test(f) && out.push(p); } return out; };
  // ⚠️ 훑는 곳은 **밖으로 값을 만들어 내보내는 자리**뿐이다 — `app/` 과 `lib/`.
  //    `scripts/` 는 원장 PC 에서만 돌고 학부모에게 안 내려가므로 뺀다
  //    (check-schema.mjs 가 파기 검사 SQL 에서 칸 이름을 정당하게 쓴다).
  const files = [...walk("app"), ...walk("lib")].filter((f) => !f.endsWith("lib/close.js"));
  // 주석을 먼저 지운다 — 글자로 훑는 검사는 헛짚는다 (계획 「폰 화면에서 이미 치른 값」)
  const bare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const leak = files.filter((f) => /staff_note/.test(bare(readFileSync(f, "utf8"))));
  ok("원장 메모(staff_note)를 lib/close.js 밖에서 읽는 자리가 없다", leak.length === 0, leak.join(" "));
}

console.log(`\n■ 마감 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
