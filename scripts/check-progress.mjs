/** 진도 올리기 검사 — **진도가 올라가는 입구 다섯이 전부 한 벌을 지나는가**가 핵심이다.
 *
 *  ⚠️ 여기서 잡는 사고는 전부 **오류가 안 나고 진도율은 오히려 좋아 보인다.**
 *     예습 ○ · 덜 덮은 배정 ○ · 「한 번에 ✕」가 ○ 를 지움 · 2회독이 1회독 줄을 덮음 · 메모가 남의 교재까지.
 *     검사로만 잡힌다 (계획 자동 검사 ⑭).
 *
 *  ⚠️ 가짜 DB 만 상대하면 **죽은 칸을 원리적으로 못 잡는다** — 끝에서 **진짜 DB** 로도 한 번 돈다.
 */
import {
  checkProgress, decideOne, winner, rankOf, parseRange,
  fromCheck, fromStaff, fromStudent, fromMemo, rollup,
  pendingMarks, settleMarks, raiseFlag, openFlags, resolveFlag,
} from "../lib/progress.js";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";

let fail = 0, n = 0;
const ok = (t, c, why = "") => { n++; if (!c) { fail++; console.log(`   ❌ ${t}${why ? " — " + why : ""}`); }
                                 else console.log(`   ✅ ${t}`); };

/* ── 가짜 DB — lib 이 쓰는 SQL 을 「q:이름」으로 알아본다 ─────────── */
const U = {
  // 쪽이 붙은 워크북 줄 (그래머인사이드3 Chapter 04 모양 — 18쪽)
  wb: { id: "u-wb", book_id: "b1", chapter: "Chapter 04", sub: null, activity: "워크북",
        is_workbook: true, sort: 10, page_start: 35, page_end: 52, q_count: null, q_range: null, state: "active" },
  // 문항수만 있는 줄 (중등3800제 「중간·기말고사 대비문제」 모양 — 60문항)
  q60: { id: "u-q60", book_id: "b1", chapter: "CHAPTER 1", sub: null, activity: "문제",
         is_workbook: false, sort: 20, page_start: null, page_end: null, q_count: 60, q_range: null, state: "active" },
  // 쪽도 문항도 모르는 줄 — **원장님께 물어야 하는 자리**
  bare: { id: "u-bare", book_id: "b1", chapter: "CHAPTER 2", sub: null, activity: "본책",
          is_workbook: false, sort: 30, page_start: null, page_end: null, q_count: null, q_range: null, state: "active" },
  // 다른 교재 — 메모 자동완료가 여기까지 새면 안 된다
  other: { id: "u-other", book_id: "b2", chapter: "PSS 1", sub: "1-4", activity: "본책",
           is_workbook: false, sort: 10, page_start: 1, page_end: 2, q_count: null, q_range: null, state: "active" },
  // ⚠️ **쪽과 문항이 둘 다 찬 줄** — 실측 447줄이 이 모양인데 가짜 단원에 하나도 없어서
  //    「축을 안 밝힌 1-3 을 쪽으로 읽는다」가 검사를 초록으로 지나갔다 (검증 2026-09-02)
  both: { id: "u-both", book_id: "b1", chapter: "1 명사절", sub: "01 that절", activity: "본책",
          is_workbook: false, sort: 40, page_start: 1, page_end: 2, q_count: 7, q_range: "1-7", state: "active" },
  // 한 쪽짜리 (중등3800제 모양) — 「8번」 한 문제가 「p.8 을 다 덮었다」가 되던 자리
  one: { id: "u-one", book_id: "b1", chapter: "CH 8", sub: null, activity: "본책",
         is_workbook: false, sort: 50, page_start: 8, page_end: 8, q_count: null, q_range: null, state: "active" },
};

function fake(seed = {}) {
  const st = {
    units: seed.units ?? Object.values(U),
    books: seed.books ?? [{ book_id: "b1", round: 1, from_date: "2026-01-01", in_window: true },
                          { book_id: "b2", round: 1, from_date: "2026-01-01", in_window: true }],
    progress: seed.progress ?? [],
    parts: seed.parts ?? [],
    items: seed.items ?? [],
    flags: seed.flags ?? [],
    canEdit: seed.canEdit ?? true,
    log: [],
  };
  const db = {
    st,
    async query(sql, p = []) {
      const tag = (String(sql).match(/q:(\w+)/) ?? [])[1] ?? String(sql).trim().split(/\s+/)[0];
      st.log.push(tag);
      const has = (arr, v) => arr.includes(v);
      switch (tag) {
        // ⚠️ **되돌리기를 흉내 낸다.** 안 그러면 「진도가 안 바뀌면 이의도 안 닫힌다」를
        //    가짜 DB 로는 원리적으로 못 잡는다 (닫힌 채로 남아도 검사가 초록이 된다)
        case "begin":
          st.snap = JSON.stringify({ progress: st.progress, parts: st.parts, flags: st.flags });
          return { rows: [], rowCount: 0 };
        case "commit": st.snap = null; return { rows: [], rowCount: 0 };
        case "rollback": {
          if (st.snap) { const s = JSON.parse(st.snap);
                         st.progress = s.progress; st.parts = s.parts; st.flags = s.flags; st.snap = null; }
          return { rows: [], rowCount: 0 };
        }
        case "units":   return { rows: st.units.filter((u) => has(p[0], u.id)) };
        case "round":   return { rows: st.books.filter((b) => has(p[1], b.book_id)) };
        case "progress":return { rows: st.progress.filter((r) => has(p[1], r.unit_id)) };
        case "parts":   return { rows: st.parts.filter((r) => has(p[1], r.unit_id)) };
        case "siblings":return { rows: st.items.filter((i) => has(p[0], i.sheet_id)) };
        // 아이 찍기가 그날 판의 slot 을 찾아 붙이는 자리 (S1)
        case "daySlots": return { rows: st.items.filter((i) => has(p[2], i.unit_id)) };
        case "memoItems": {
          const bk = new Set(st.units.filter((u) => u.book_id === p[2]).map((u) => u.id));
          return { rows: st.items.filter((i) => bk.has(i.unit_id)) };
        }
        case "canEdit": return { rows: [{ ok: st.canEdit }] };
        case "write": {
          const [s, u, r, status, doneOn, lastBy, confirmed, markedOn] = p;
          const row = st.progress.find((x) => x.unit_id === u && Number(x.round) === Number(r));
          if (row) Object.assign(row, { status, done_on: doneOn, last_by: lastBy, confirmed, marked_on: markedOn });
          else st.progress.push({ unit_id: u, round: r, status, done_on: doneOn,
                                  last_by: lastBy, confirmed, marked_on: markedOn, note: null });
          return { rows: [], rowCount: 1 };
        }
        case "partSeen": {
          const hit = st.parts.some((x) => x.unit_id === p[1] && Number(x.round) === Number(p[2])
            && x.q_from == p[3] && x.q_to == p[4] && x.page_from == p[5] && x.page_to == p[6]);
          return { rows: hit ? [{ "?column?": 1 }] : [] };
        }
        case "partAdd":
          st.parts.push({ unit_id: p[1], round: p[2], q_from: p[3], q_to: p[4],
                          page_from: p[5], page_to: p[6] });
          return { rows: [], rowCount: 1 };
        case "pending":
          return { rows: st.progress.filter((r) => r.last_by === "student" && r.confirmed === false) };
        case "confirm": case "revert": {
          const row = st.progress.find((x) => x.unit_id === p[1] && Number(x.round) === Number(p[2])
            && x.last_by === "student" && x.confirmed === false);
          if (!row) return { rows: [], rowCount: 0 };
          if (tag === "confirm") row.confirmed = true;
          else Object.assign(row, { status: "none", done_on: null, confirmed: true, last_by: "staff" });
          return { rows: [], rowCount: 1 };
        }
        case "flagAdd": {
          const f = { id: "f" + (st.flags.length + 1), student_id: p[0], unit_id: p[1],
                      round: p[2], kind: p[3], said: p[4], outcome: null };
          st.flags.push(f); return { rows: [{ id: f.id }] };
        }
        case "flagOpen": return { rows: st.flags.filter((f) => f.outcome == null) };
        case "flagClose": {
          const f = st.flags.find((x) => x.id === p[0] && x.outcome == null);
          if (!f) return { rows: [], rowCount: 0 };
          f.outcome = p[2]; f.seen_by = p[1];
          return { rows: [f], rowCount: 1 };
        }
        default: throw new Error("가짜 DB 가 모르는 SQL — " + tag);
      }
    },
  };
  return db;
}
const S = "s1", ON = "2026-09-02";
const P = (unit_id, o = {}) => ({ unit_id, round: 1, status: "none", done_on: null, marked_on: null,
                                  last_by: "staff", confirmed: true, note: null, ...o });
const got = (db, u) => db.st.progress.find((x) => x.unit_id === u) ?? null;

/* ────────────────────────────────────────────────────────────── */
console.log("■ 낱말과 순위 — ⚠️ ○ > △ > ✕ (옛 앱은 이게 깨져 있었다)");
ok("○ 이 △ 보다 세다", rankOf("done") > rankOf("weak"));
ok("△ 가 ✕ 보다 세다", rankOf("weak") > rankOf("missing"));
ok("건너뜀은 ✕ 보다 세고 △ 보다 약하다", rankOf("skip") > rankOf("missing") && rankOf("skip") < rankOf("weak"));
ok("모르는 낱말은 순위가 없다", rankOf("complete") < 0);
{
  const w = winner([{ unitId: "U5", mark: "done" }, { unitId: "U5", mark: "missing" }]);
  ok("한 단원에 ○ 와 ✕ 가 같이 오면 ○ 이 이긴다", w.length === 1 && w[0].mark === "done", JSON.stringify(w));
}

console.log("\n■ 범위 메모 읽기 — ⚠️ 못 읽으면 **지어내지 않는다**");
ok("p.31-34 는 쪽", parseRange("p.31-34").kind === "page");
ok("1번-30번 은 문항 1~30", JSON.stringify(parseRange("1번-30번")) === '{"kind":"q","spans":[[1,30]]}',
   JSON.stringify(parseRange("1번-30번")));
ok("「1-30」은 축을 안 밝힌 것 (단원이 정한다)", parseRange("1-30").kind === "num");
ok("「짝수만」은 **모른다**고 답한다", parseRange("짝수만").kind === "unknown");
ok("비면 「범위 메모 없음」", parseRange("").kind === "none");

console.log("\n■ ⚠️① 예습(slot='next')에 ○ 을 줘도 **완료로 안 올라간다**");
{
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "next", range: null, itemId: "i1", sheetId: "sh1" }] });
  ok("예습 ○ → 하는 중 ◐", got(db, "u-wb")?.status === "doing", JSON.stringify(got(db, "u-wb")));
  ok("왜 그런지 말해 준다", /예습/.test(r.applied[0]?.why ?? ""), r.applied[0]?.why);
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: "2026-07-10" })] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "next", itemId: "i1", sheetId: "sh1" }] });
  ok("예습이라고 **이미 완료인 것을 내리지도 않는다**", got(db, "u-wb").status === "done");
}
{
  const db = fake();
  await fromMemo(db, { studentId: S, on: ON, bookId: "b1" }, {
    slots: ["class", "next"] });
  ok("메모 마감으로도 예습은 안 올라간다 (입구가 달라도 규칙은 한 벌)",
     (got(db, "u-wb")?.status ?? "none") !== "done");
}

console.log("\n■ ⚠️② 덜 덮은 배정은 ◐ 까지 — 판정은 lib/chunk.js 를 부른다");
{
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", range: "p.35-40", itemId: "i1", sheetId: "sh1" }] });
  ok("18쪽 중 6쪽만 내고 ○ → ◐", got(db, "u-wb").status === "doing", JSON.stringify(got(db, "u-wb")));
  ok("낸 조각을 남긴다 (다음에 「지난번 어디까지」를 띄우려고)", db.st.parts.length === 1, JSON.stringify(db.st.parts));
}
{
  const db = fake({ parts: [{ unit_id: "u-q60", round: 1, q_from: 1, q_to: 30, page_from: null, page_to: null }] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-q60", mark: "done", slot: "home", range: "31-60", itemId: "i1", sheetId: "sh1" }] });
  ok("60문항짜리 — 1-30 뒤 31-60 을 내면 **원장 조작 없이** ○ 이 된다",
     got(db, "u-q60").status === "done", JSON.stringify(got(db, "u-q60")));
}
{
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-bare", mark: "done", slot: "home", range: "p.31-34", itemId: "i1", sheetId: "sh1" }] });
  ok("쪽도 문항도 모르는 줄 → ◐ 이고 「이걸로 끝」을 묻는다",
     got(db, "u-bare").status === "doing" && r.applied[0].ask === true, JSON.stringify(r.applied[0]));
}
{
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", range: "짝수만", itemId: "i1", sheetId: "sh1" }] });
  ok("⚠️ 범위 메모를 못 읽으면 ○ 를 줘도 ◐ + 물음 (덮었다고 지어내지 않는다)",
     got(db, "u-wb").status === "doing" && r.applied[0].ask === true, JSON.stringify(r.applied[0]));
}
{
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", range: null, itemId: "i1", sheetId: "sh1" }] });
  ok("범위 메모가 **비면** 통째로 낸 것 → ○", got(db, "u-wb").status === "done");
}

console.log("\n■ ⚠️ **어느 자로 재나** — 쪽이냐 문항이냐. 2026-09-02 사고: 축을 마음대로 되돌렸다");
{
  // 쪽·문항이 둘 다 찬 줄(실측 447줄). 「1-3」을 쪽으로 읽으면 p.1~2 를 통째로 덮어 ○ 이 된다
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-both", mark: "done", slot: "home", range: "1-3", itemId: "i1", sheetId: "sh1" }] });
  ok("⚠️⚠️ 쪽·문항이 둘 다 있는 줄의 「1-3」은 **문항**으로 읽는다 (7문항 중 3개 → ◐)",
     got(db, "u-both").status === "doing", JSON.stringify(got(db, "u-both")));
  ok("남은 것을 **문항**으로 말한다 (「남은 쪽 p.4~7」이 아니다)",
     /문항/.test(r.applied[0]?.why ?? "") && !/쪽/.test(r.applied[0]?.why ?? ""), r.applied[0]?.why);
  ok("어느 자로 쟀는지 화면에 알려 준다", r.applied[0]?.axis === "q", String(r.applied[0]?.axis));
}
{
  // 한 쪽짜리 단원에 「8번」 — 문항 자가 없는데 쪽으로 갈아타면 **한 문제가 단원을 끝낸다**
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-one", mark: "done", slot: "home", range: "8번", itemId: "i1", sheetId: "sh1" }] });
  ok("⚠️⚠️ p.8~8 짜리 줄에 「8번」 하나를 내고 ○ → **완료가 아니다**",
     got(db, "u-one").status === "doing", JSON.stringify(got(db, "u-one")));
  ok("문항 자가 없으면 쪽으로 지어내지 않고 **묻는다**", r.applied[0]?.ask === true, JSON.stringify(r.applied[0]));
}
{
  // 반대 방향 — 쪽만 있는 줄에 「1-30번」. 옛 코드는 p.1~30 으로 읽어 영영 ◐ 인데 묻지도 않았다
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", range: "1-30번", itemId: "i1", sheetId: "sh1" }] });
  ok("쪽만 있는 줄에 「1-30번」 → ◐ 이고 **묻는다** (영영 안 풀리는 ◐ 로 두지 않는다)",
     got(db, "u-wb").status === "doing" && r.applied[0].ask === true, JSON.stringify(r.applied[0]));
}
{
  // 문항 줄인데 화면 문구가 「남은 쪽 p.31~60」이면 그 교재에 없는 쪽수가 아이에게 나간다
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-q60", mark: "done", slot: "home", range: "1-30번", itemId: "i1", sheetId: "sh1" }] });
  ok("⚠️ 문항 줄에 **쪽수를 말하지 않는다** (「남은 문항 31~60번」)",
     !/쪽|p\./.test(r.applied[0]?.why ?? ""), r.applied[0]?.why);
}

console.log("\n■ ⚠️ **같은 판·같은 단원에 항목이 여럿** — 진 항목의 범위를 버리지 않는다 (실측 4쌍)");
{
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON, marks: [
    { unitId: "u-wb", mark: "done", slot: "home",  range: "p.35-40", itemId: "i1", sheetId: "sh1" },
    { unitId: "u-wb", mark: "done", slot: "class", range: "p.41-52", itemId: "i2", sheetId: "sh1" }] });
  ok("⚠️⚠️ 둘로 나눠 낸 18쪽을 **합쳐서** 다 덮었다고 본다",
     got(db, "u-wb").status === "done", JSON.stringify(got(db, "u-wb")) + " / " + r.applied[0]?.why);
  ok("진 항목의 조각도 남는다 (안 남기면 다음에도 영영 안 덮인다)",
     db.st.parts.length === 2, JSON.stringify(db.st.parts));
}
{
  // 같은 입력, 순서만 뒤집기 — 답이 갈리면 그날그날 진도가 달라진다
  const two = (order) => fromCheck(order.db, { studentId: S, on: ON, marks: order.m });
  const a = fake(), b = fake();
  const mA = [{ unitId: "u-wb", mark: "done", slot: "home", range: null, itemId: "i1", sheetId: "sh1" },
              { unitId: "u-wb", mark: "done", slot: "home", range: "p.35-40", itemId: "i2", sheetId: "sh1" }];
  await two({ db: a, m: mA });
  await two({ db: b, m: [...mA].reverse() });
  ok("⚠️ 순서를 뒤집어도 **같은 답**이 나온다", got(a, "u-wb").status === got(b, "u-wb").status,
     `${got(a, "u-wb").status} vs ${got(b, "u-wb").status}`);
}
{
  const w1 = winner([{ unitId: "U5", mark: "done", slot: "next" }, { unitId: "U5", mark: "done", slot: "class" }]);
  const w2 = winner([{ unitId: "U5", mark: "done", slot: "class" }, { unitId: "U5", mark: "done", slot: "next" }]);
  ok("⚠️ 등원과 예습이 같은 단원에 같이 오면 **늘 등원**이 이긴다 (순서와 무관)",
     w1[0].slot === "class" && w2[0].slot === "class", `${w1[0].slot} / ${w2[0].slot}`);
}

// ⚠️⚠️ 2026-09-02 **2차** 사고 — 「범위를 다 모으기」로 고치면서 **예습의 범위까지 모았다.**
//    「반드시 막는 것 ①」이 상태가 아니라 **범위**로 다시 샜다. 아래 다섯이 그 사고다
{
  const w = winner([{ unitId: "U5", mark: "done", slot: "class", range: "p.35-40" },
                    { unitId: "U5", mark: "done", slot: "next",  range: null }]);
  ok("⚠️⚠️ winner 가 **예습의 범위 메모를 안 모은다** (범위 없는 예습 ○ 이 「통째」로 접히면 안 된다)",
     JSON.stringify(w[0].notes) === '["p.35-40"]', JSON.stringify(w[0].notes));
}
{
  // 진짜 DB 재현 그대로 — 한 판에 등원 ○ 'p.35-40' 과 **범위 안 적은 예습 ○** 이 같이 깔려 있고
  // 부르는 쪽은 등원 것만 넘긴다(gather 가 예습을 긁어 온다)
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "class", unit_id: "u-wb", range_note: "p.35-40", status: "done" },
    { id: "i2", sheet_id: "sh1", slot: "next",  unit_id: "u-wb", range_note: null,      status: "done" }] });
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "class", range: "p.35-40", itemId: "i1", sheetId: "sh1" }] });
  ok("⚠️⚠️ 범위 안 적은 **예습 ○ 하나 때문에** 6쪽만 낸 단원이 완료가 되면 안 된다",
     got(db, "u-wb").status === "doing", JSON.stringify(got(db, "u-wb")) + " / " + r.applied[0]?.why);
  ok("실제로 낸 p.35~40 조각은 **그대로 남는다**",
     db.st.parts.length === 1 && db.st.parts[0].page_from === 35 && db.st.parts[0].page_to === 40,
     JSON.stringify(db.st.parts));

  // 같은 판에서 예습 줄만 지우면 답이 달라지면 안 된다 — 그게 이 사고의 냄새였다
  const db2 = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "class", unit_id: "u-wb", range_note: "p.35-40", status: "done" }] });
  await fromCheck(db2, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "class", range: "p.35-40", itemId: "i1", sheetId: "sh1" }] });
  ok("⚠️ 예습 줄이 **있으나 없으나 같은 답**이다", got(db, "u-wb").status === got(db2, "u-wb").status,
     `${got(db, "u-wb").status} vs ${got(db2, "u-wb").status}`);
}
{
  // 예습이 **범위를 적은** 경우도 같다 — 등원 p.35-40 + 예습 p.41-52 는 18쪽을 다 덮지 않은 것이다
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON, marks: [
    { unitId: "u-wb", mark: "done", slot: "class", range: "p.35-40", itemId: "i1", sheetId: "sh1" },
    { unitId: "u-wb", mark: "done", slot: "next",  range: "p.41-52", itemId: "i2", sheetId: "sh1" }] });
  ok("⚠️⚠️ 예습이 범위를 적어도 그 쪽수는 **완료 판정에 안 섞인다**",
     got(db, "u-wb").status === "doing", JSON.stringify(got(db, "u-wb")));
  ok("예습이 낸다고 한 쪽은 조각으로도 안 남는다 (남기면 rollup 이 완료로 올린다)",
     db.st.parts.length === 1 && db.st.parts[0].page_to === 40, JSON.stringify(db.st.parts));
}
{
  // ③ 으로 새는 길 — 예습 ○ 이 단원을 다 덮는 범위를 들고 오면 조각이 남아 rollup 이 완료로 올렸다
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "next", range: "p.35-52", itemId: "i1", sheetId: "sh1" }] });
  ok("⚠️⚠️ 예습 ○ 의 범위는 **조각으로 안 남는다**", db.st.parts.length === 0, JSON.stringify(db.st.parts));
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: ON });
  ok("⚠️⚠️ 그래서 rollup 도 예습만 깔린 단원을 완료로 못 올린다",
     got(db, "u-wb").status === "doing", JSON.stringify(got(db, "u-wb")));
}

// ⚠️⚠️ 2026-09-02 **2차** 사고 — 형제 중 하나가 못 읽는 메모면 **읽히는 형제의 범위까지 통째로 버렸다.**
//    18쪽을 다 냈다는 기록이 progress_part 에 한 줄도 안 남아 이튿날 rollup 으로도 영영 ◐ 이었다
{
  const db = fake();
  const r = await fromCheck(db, { studentId: S, on: ON, marks: [
    { unitId: "u-wb", mark: "done", slot: "class", range: "짝수만",  itemId: "i1", sheetId: "sh1" },
    { unitId: "u-wb", mark: "done", slot: "home",  range: "p.35-52", itemId: "i2", sheetId: "sh1" }] });
  ok("못 읽는 형제가 섞이면 상태는 그대로 ◐ + 물음이다 (덮었다고 지어내지 않는다)",
     got(db, "u-wb").status === "doing" && r.applied[0].ask === true, JSON.stringify(r.applied[0]));
  ok("⚠️⚠️ 그래도 **읽힌 형제의 범위는 조각으로 남는다**",
     db.st.parts.length === 1 && db.st.parts[0].page_from === 35 && db.st.parts[0].page_to === 52,
     JSON.stringify(db.st.parts));
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: "2026-09-03" });
  ok("⚠️⚠️ 그 조각으로 이튿날 rollup 이 덮는다 (기록이 사라지지 않았다)",
     got(db, "u-wb").status === "done", JSON.stringify(got(db, "u-wb")));
}
{
  // 읽힌 것이 하나도 없으면 **지어내지 않는다** — 조각도 안 남는다
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", range: "짝수만", itemId: "i1", sheetId: "sh1" }] });
  ok("못 읽는 메모 하나뿐이면 조각도 안 남긴다 (쪽수를 지어내지 않는다)",
     db.st.parts.length === 0, JSON.stringify(db.st.parts));
}
{
  // 축이 엇갈리는 것만 있을 때도 (page + q) — 어느 자인지 모르니 조각을 안 남긴다
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON, marks: [
    { unitId: "u-wb", mark: "done", slot: "class", range: "p.35-40", itemId: "i1", sheetId: "sh1" },
    { unitId: "u-wb", mark: "done", slot: "home",  range: "1-30번",  itemId: "i2", sheetId: "sh1" }] });
  ok("쪽과 문항이 한 단원에 같이 오면 ◐ 이고 조각도 안 남긴다",
     got(db, "u-wb").status === "doing" && db.st.parts.length === 0, JSON.stringify(db.st.parts));
}

console.log("\n■ ⚠️③ 항목을 1건씩 넘겨도 ○ 이 안 지워진다 (옛 앱 사고 — /check 「한 번에 ✕」)");
{
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "home", unit_id: "u-wb", range_note: null, status: "done" },
    { id: "i2", sheet_id: "sh1", slot: "home", unit_id: "u-wb", range_note: null, status: "missing" }] });
  // 옛 앱처럼 **✕ 한 건만** 넘긴다 — 그래도 같은 판의 ○ 를 긁어와 ○ 이 이겨야 한다
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "missing", slot: "home", itemId: "i2", sheetId: "sh1" }] });
  ok("본교재 ○ · 워크북 ✕ 를 따로 눌러도 U 는 완료다",
     got(db, "u-wb")?.status === "done", JSON.stringify(got(db, "u-wb")));
}
{
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "home", unit_id: "u-wb", range_note: null, status: "done" },
    { id: "i2", sheet_id: "sh1", slot: "home", unit_id: "u-wb", range_note: null, status: "missing" }] });
  await fromCheck(db, { studentId: S, on: ON, marks: [
    { unitId: "u-wb", mark: "done", slot: "home", itemId: "i1", sheetId: "sh1" },
    { unitId: "u-wb", mark: "missing", slot: "home", itemId: "i2", sheetId: "sh1" }] });
  ok("한 번에 모아 넘겨도 같은 답", got(db, "u-wb").status === "done");
}

console.log("\n■ ⚠️ ✕ 는 **지우지 않는다. 상태로 내린다** (대전제 6 · v2 는 delete 권한이 없다)");
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON, note: "17번만 다시" })] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "missing", slot: "home", itemId: "i1" }] });
  const g = got(db, "u-wb");
  ok("오늘 찍은 ○ 를 ✕ 로 고치면 내려간다", g.status === "none" && g.done_on === null, JSON.stringify(g));
  ok("줄은 남는다 (지우지 않는다)", db.st.progress.length === 1);
  ok("단원 메모는 그대로 살아 있다", g.note === "17번만 다시");
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: "2026-07-10" })] });
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "missing", slot: "home", itemId: "i1" }] });
  ok("⚠️ **지난달 완료는 이번 주 ✕ 가 못 지운다**", got(db, "u-wb").status === "done");
  ok("왜 안 내렸는지 말해 준다", /지난 완료/.test(r.skipped[0]?.why ?? ""), r.skipped[0]?.why);
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: "2026-07-10" })] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "weak", slot: "home", itemId: "i1" }] });
  ok("⚠️ 지난 완료는 △ 로도 안 낮아진다", got(db, "u-wb").status === "done");
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON })] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "weak", slot: "home", itemId: "i1" }] });
  ok("같은 날 ○ 뒤 △ 로 고치면 ◐ 로 내려간다", got(db, "u-wb").status === "doing");
}
{
  // ⚠️ 자물쇠는 **검사에만** 건다. 원장님이 못 내리면 잘못 올라간 지난 완료를 내릴 길이 앱에 없다
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: "2026-07-10" })] });
  const r = await fromStaff(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "missing" }] });
  ok("⚠️⚠️ **원장님은** 잘못 올라간 지난 완료를 ✕ 로 내릴 수 있다",
     got(db, "u-wb").status === "none" && r.applied.length === 1, JSON.stringify(got(db, "u-wb")));
  ok("내려도 줄과 메모는 남는다 (지우지 않는다)", db.st.progress.length === 1);
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: "2026-07-10" })] });
  await fromStaff(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "weak" }] });
  ok("원장님은 지난 완료를 △ 로도 낮출 수 있다", got(db, "u-wb").status === "doing");
}

console.log("\n■ ◐ 이 언제 찍혔나 — `marked_on`(0065). 없을 때는 **안 건드렸다**");
{
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "next", itemId: "i1", sheetId: "sh1" }] });
  ok("◐ 에도 만진 날이 남는다", got(db, "u-wb").marked_on === ON, JSON.stringify(got(db, "u-wb")));
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "missing", slot: "home", itemId: "i1" }] });
  ok("오늘 찍은 ◐ 은 오늘 ✕ 로 도로 내려간다", got(db, "u-wb").status === "none");
}
{
  const db = fake({ progress: [P("u-wb", { status: "doing", marked_on: "2026-07-10" })] });
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "missing", slot: "home", itemId: "i1" }] });
  ok("⚠️ 지난 ◐ 은 오늘 검사가 못 내린다", got(db, "u-wb").status === "doing", r.skipped[0]?.why);
}
{
  const db = fake({ progress: [P("u-wb", { status: "doing", marked_on: null })] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "missing", slot: "home", itemId: "i1" }] });
  ok("⚠️ 언제 찍혔는지 **모르는** 옛 ◐ 은 안 건드린다 (대전제 0)", got(db, "u-wb").status === "doing");
}

console.log("\n■ 미검사·수업중은 **손댄 적 없는 것**이다 (진도 삭제로 읽지 않는다)");
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON })] });
  for (const m of [null, "none", "inclass", ""])
    await fromCheck(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: m, slot: "home", itemId: "i1" }] });
  ok("검사 취소·미검사·수업중은 진도를 안 건드린다", got(db, "u-wb").status === "done");
}

console.log("\n■ ⚠️④ 회독 — 배정 줄에서 온다. **지어내지 않는다**");
{
  const db = fake({ books: [{ book_id: "b1", round: 2, from_date: "2026-08-01", in_window: true }] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", itemId: "i1" }] });
  ok("2회독 아이는 **2회독 줄**에 쓴다", Number(got(db, "u-wb").round) === 2, JSON.stringify(got(db, "u-wb")));
}
{
  const db = fake({ books: [], progress: [] });
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", itemId: "i1" }] });
  ok("⚠️ 배정 줄이 없으면 **1회독으로 치지 않는다** — 안 올리고 알린다",
     db.st.progress.length === 0 && /회독을 모른다/.test(r.skipped[0]?.why ?? ""), JSON.stringify(r.skipped));
}
{
  const db = fake({ progress: [P("u-wb", { round: 1, status: "done", done_on: "2026-07-10" })],
                    books: [{ book_id: "b1", round: 2, from_date: "2026-08-01", in_window: true }] });
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", itemId: "i1" }] });
  ok("2회독 진도가 **1회독 줄을 안 덮는다**", db.st.progress.length === 2, JSON.stringify(db.st.progress));
}

console.log("\n■ ⚠️ 없는 단원이 섞이면 **통째로 멈춘다** (부분 저장이 더 나쁘다 · 2026-08-17 사고)");
{
  const db = fake({ progress: [] });
  const r = await fromCheck(db, { studentId: S, on: ON, marks: [
    { unitId: "u-wb", mark: "done", slot: "home", itemId: "i1" },
    { unitId: "u-사라진것", mark: "done", slot: "home", itemId: "i2" }] });
  ok("아무것도 저장 안 된다", r.ok === false && db.st.progress.length === 0);
  ok("원장님께 「새로고침」이라고 말한다", /새로고침/.test(r.why ?? ""), r.why);
}

console.log("\n■ ② 원장이 진도판에서 직접 찍기 — 커서 잠김을 푸는 **기본 손잡이**");
{
  const db = fake({ parts: [{ unit_id: "u-wb", round: 1, q_from: null, q_to: null, page_from: 35, page_to: 40 }] });
  await fromStaff(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done" }] });
  ok("조각만 낸 단원도 원장님이 찍으면 ○ (안 그러면 커서가 영영 잠긴다)",
     got(db, "u-wb").status === "done", JSON.stringify(got(db, "u-wb")));
  ok("원장님이 찍은 줄로 남는다", got(db, "u-wb").last_by === "staff" && got(db, "u-wb").confirmed === true);
}
{
  const db = fake();
  await fromStaff(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "skip" }] });
  ok("건너뜀도 여기로 — 분모에서 빠진다", got(db, "u-wb").status === "skip");
}

console.log("\n■ ③ 조각이 원본을 다 덮으면 **저절로** ○ (원장님이 다시 안 찍는다)");
{
  const db = fake({ progress: [P("u-wb", { status: "doing" })],
                    parts: [{ unit_id: "u-wb", round: 1, q_from: null, q_to: null, page_from: 35, page_to: 52 }] });
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: ON });
  ok("◐ 이던 것이 다 덮이면 ○ 이 된다", got(db, "u-wb").status === "done");
}
{
  const db = fake({ progress: [P("u-wb", { status: "doing" })],
                    parts: [{ unit_id: "u-wb", round: 1, q_from: null, q_to: null, page_from: 35, page_to: 40 }] });
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: ON });
  ok("아직 덜 덮였으면 ◐ 그대로", got(db, "u-wb").status === "doing");
}
{
  const db = fake({ progress: [], parts: [] });
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: ON });
  ok("⚠️ 아무도 ○ 를 준 적 없는 단원은 조각만으로 안 올라간다", db.st.progress.length === 0);
}
// ⚠️⚠️ 2026-09-02 사고 — 입구 ③ 이 「반드시 막는 것 ①」을 통째로 되돌리던 자리.
//    조각을 한 번도 안 세고 status='doing' 이기만 하면 ○ 로 올렸다. 아래 셋이 그 사고다
{
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "next", itemId: "i1", sheetId: "sh1" }] });
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: ON });
  ok("⚠️⚠️ 예습 ○ 으로 선 ◐ 을 rollup 이 완료로 못 올린다 (조각이 0줄이다)",
     got(db, "u-wb").status === "doing" && db.st.parts.length === 0, JSON.stringify(got(db, "u-wb")));
}
{
  const db = fake({ progress: [P("u-wb", { status: "doing" })], parts: [] });
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: ON });
  ok("⚠️ △ 로 선 ◐ 도 rollup 이 못 올린다", got(db, "u-wb").status === "doing", JSON.stringify(got(db, "u-wb")));
}
{
  // 조각은 1회독 것인데 ◐ 은 2회독 줄이다 — 남의 회독 조각으로 올리면 안 된다
  const db = fake({ progress: [P("u-wb", { round: 2, status: "doing" })],
                    books: [{ book_id: "b1", round: 2, from_date: "2026-08-01", in_window: true }],
                    parts: [{ unit_id: "u-wb", round: 1, q_from: null, q_to: null, page_from: 35, page_to: 52 }] });
  await rollup(db, { studentId: S, unitIds: ["u-wb"], on: ON });
  ok("⚠️ 1회독 조각으로 2회독 ◐ 을 안 올린다", got(db, "u-wb").status === "doing", JSON.stringify(db.st.progress));
}

console.log("\n■ ④ 메모로 대신한 날 마감(절 ㊳) — ⚠️ **그 교재만**");
{
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "class", unit_id: "u-wb", range_note: null, status: "none" },
    { id: "i2", sheet_id: "sh1", slot: "class", unit_id: "u-other", range_note: null, status: "none" }] });
  const r = await fromMemo(db, { studentId: S, on: ON, bookId: "b1" });
  ok("메모를 적은 교재의 항목만 ○ 로 올라간다", got(db, "u-wb").status === "done");
  ok("⚠️ 다른 교재는 **하나도** 안 건드린다", got(db, "u-other") === null, JSON.stringify(db.st.progress));
  ok("교재를 안 주면 아예 안 돈다", (await fromMemo(db, { studentId: S, on: ON })).ok === false);
  ok("무엇이 올라갔는지 목록으로 돌려준다", r.applied.length === 1);
}
{
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "class", unit_id: "u-wb", range_note: null, status: "none" }] });
  const r = await fromMemo(db, { studentId: S, on: ON, bookId: "b1" }, { dryRun: true });
  ok("마감 전 미리보기는 **아무것도 안 쓴다**", db.st.progress.length === 0 && r.applied.length === 1);
}
// ⚠️⚠️ 2026-09-02 사고 — 마감이 그날 이미 찍어 둔 줄까지 ○ 로 뒤집었다.
//    원장님이 「안 해왔다」고 남긴 판단이 마감 한 번에 조용히 사라진다
{
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "class", unit_id: "u-wb",  range_note: null, status: "missing" },
    { id: "i2", sheet_id: "sh1", slot: "class", unit_id: "u-q60", range_note: null, status: "none" }] });
  const r = await fromMemo(db, { studentId: S, on: ON, bookId: "b1" });
  ok("⚠️⚠️ ✕ 로 찍어 둔 줄은 마감이 **안 건드린다**",
     got(db, "u-wb") === null, JSON.stringify(db.st.progress));
  ok("손 안 댄 줄만 올라간다", got(db, "u-q60")?.status === "done");
  ok("「이건 이미 ✕ 라 안 올립니다」를 같이 알려 준다",
     r.kept?.length === 1 && r.kept[0].unitId === "u-wb", JSON.stringify(r.kept));
}
{
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "class", unit_id: "u-wb", range_note: null, status: "done" }] });
  await fromMemo(db, { studentId: S, on: ON, bookId: "b1" });
  ok("이미 ○ 로 검사된 줄도 마감이 다시 안 건드린다", db.st.progress.length === 0, JSON.stringify(db.st.progress));
}

console.log("\n■ ⑤ 아이가 찍기(절 ㊶) — 세 겹");
{
  const db = fake({ canEdit: false });
  const r = await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done" }] });
  ok("① 스위치가 닫혀 있으면 못 찍는다", r.ok === false && db.st.progress.length === 0, r.why);
}
{
  const db = fake();
  await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done" }] });
  const g = got(db, "u-wb");
  ok("③ 아이가 찍은 줄은 「확인 기다리는 중」으로만 선다",
     g.last_by === "student" && g.confirmed === false, JSON.stringify(g));
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: "2026-07-10", last_by: "staff" })] });
  const r = await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "weak" }] });
  ok("② 원장님이 찍은 줄은 아이가 못 덮는다", got(db, "u-wb").status === "done" && r.blocked.length === 1);
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON, last_by: "check" })] });
  await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "weak" }] });
  ok("② 검사가 찍은 줄도 못 덮는다", got(db, "u-wb").status === "done");
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", last_by: "student", confirmed: false })] });
  await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "weak" }] });
  ok("자기가 찍은 줄은 고칠 수 있다", got(db, "u-wb").status === "doing");
}
{
  const db = fake();
  const r = await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "skip" }] });
  ok("건너뛰기는 아이가 못 한다", r.blocked.length === 1 && db.st.progress.length === 0);
}
// ⚠️⚠️ 2026-09-02 사고 — ⑤ 는 예습 예외도 덮음 판정도 **한 번도 안 지났다.**
//    「판정 없이 그대로 올리는 손잡이」는 원장(staff)만 쥔다
{
  const db = fake({ parts: [{ unit_id: "u-wb", round: 1, q_from: null, q_to: null, page_from: 35, page_to: 40 }] });
  const r = await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done" }] });
  ok("⚠️⚠️ 조각만 낸 단원은 아이가 ○ 를 눌러도 ◐ 까지다 (덮음 판정을 지난다)",
     got(db, "u-wb").status === "doing", JSON.stringify(got(db, "u-wb")));
  ok("자취에 **거짓말이 안 남는다** (원장님은 누른 적이 없다)",
     !/원장님이 직접/.test(r.applied[0]?.why ?? ""), r.applied[0]?.why);
}
{
  const db = fake();
  await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done", slot: "next" }] });
  ok("⚠️ 그날 예습으로만 깔린 단원은 아이가 눌러도 완료가 아니다", got(db, "u-wb").status === "doing");
}
// ⚠️⚠️ 2026-09-02 **2차** 사고 — 위 검사는 slot 을 **손으로 넣어** 통과하고 있었다.
//    아이 화면은 slot 을 안 보낸다. 형제 긁기(gather)는 by==='check' 일 때만 돌아
//    fromStudent 는 그날 판의 slot 을 **원리적으로 못 봤다** → 예습만 깔린 단원이 통째로 완료가 됐다
{
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "next", unit_id: "u-wb", range_note: null, status: "none" }] });
  const r = await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done" }] });
  ok("⚠️⚠️ **slot 을 안 넘겨도** 그날 예습으로만 깔린 단원은 아이가 눌러 완료가 안 된다",
     got(db, "u-wb").status === "doing", JSON.stringify(got(db, "u-wb")));
  ok("왜 그런지도 예습이라고 말한다", /예습/.test(r.applied[0]?.why ?? ""), r.applied[0]?.why);
}
{
  // 같은 단원이 등원으로도 깔려 있으면 예습이 아니다 — 등원이 이긴다
  const db = fake({ items: [
    { id: "i1", sheet_id: "sh1", slot: "next",  unit_id: "u-wb", range_note: null, status: "none" },
    { id: "i2", sheet_id: "sh1", slot: "class", unit_id: "u-wb", range_note: null, status: "none" }] });
  await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done" }] });
  ok("등원으로도 깔린 단원은 아이가 눌러 완료가 된다 (예습만 막는 것이다)",
     got(db, "u-wb").status === "done", JSON.stringify(got(db, "u-wb")));
}
{
  // 그날 판에 아예 없는 단원 — 진도판에서 찍는 길이다. 예습으로 치지 않는다
  const db = fake({ items: [] });
  await fromStudent(db, { studentId: S, on: ON, marks: [{ unitId: "u-wb", mark: "done" }] });
  ok("그날 판에 없는 단원은 예습으로 치지 않는다", got(db, "u-wb").status === "done");
}
{
  const db = fake({ progress: [
    P("u-wb", { status: "done", last_by: "student", confirmed: false }),
    P("u-q60", { status: "done", last_by: "student", confirmed: false })] });
  const list = await pendingMarks(db);
  ok("④ 「아이가 찍은 것」이 한 목록으로 뜬다", list.length === 2);
  await settleMarks(db, [{ studentId: S, unitId: "u-wb", round: 1 }]);
  ok("확인하면 테두리가 없어진다 (confirmed=true)", got(db, "u-wb").confirmed === true);
  await settleMarks(db, [{ studentId: S, unitId: "u-q60", round: 1 }], { revert: true });
  const g = got(db, "u-q60");
  ok("되돌려도 **지우지 않는다 — 상태로 내린다**",
     g.status === "none" && g.done_on === null && db.st.progress.length === 2, JSON.stringify(g));
}

console.log("\n■ ❗이의 — ⚠️ **진도를 안 바꾼다.** 원장님이 누르는 순간에만 바뀐다");
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON })] });
  await raiseFlag(db, { studentId: S, unitId: "u-wb", round: 1, kind: "not_done", said: "아직 안 했어요" });
  ok("이의를 달아도 진도 줄은 그대로", got(db, "u-wb").status === "done");
  ok("아직 안 본 이의로 뜬다", (await openFlags(db)).length === 1);
  await resolveFlag(db, { flagId: "f1", outcome: "kept", seenBy: "p1", on: ON });
  ok("「그대로 둠」으로 닫으면 진도는 안 바뀐다", got(db, "u-wb").status === "done");
  ok("닫힌 이의는 대기열에서 빠진다", (await openFlags(db)).length === 0);
}
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON })] });
  await raiseFlag(db, { studentId: S, unitId: "u-wb", round: 1, kind: "not_done" });
  await resolveFlag(db, { flagId: "f1", outcome: "changed", seenBy: "p1", on: ON });
  ok("「되돌림」을 누르면 그때 진도가 내려간다", got(db, "u-wb").status === "none");
}
{
  // 지난 완료에 단 이의 — 자물쇠 때문에 「눌렀는데 값만 안 바뀌던」 자리
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: "2026-07-10" })] });
  await raiseFlag(db, { studentId: S, unitId: "u-wb", round: 1, kind: "not_done" });
  const r = await resolveFlag(db, { flagId: "f1", outcome: "changed", seenBy: "p1", on: ON });
  ok("⚠️⚠️ 지난 완료에 단 이의도 원장님이 누르면 실제로 내려간다",
     r.ok === true && got(db, "u-wb").status === "none", JSON.stringify(got(db, "u-wb")));
}
// ⚠️⚠️ 2026-09-02 사고 — 이의를 **먼저 닫고** 진도를 나중에 바꿨다.
//    진도가 안 바뀌어도 이의는 대기열에서 사라지고, 다시 볼 길이 없었다
{
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON })] });
  await raiseFlag(db, { studentId: S, unitId: "u-wb", round: 1, kind: "not_done" });
  const r = await resolveFlag(db, { flagId: "f1", outcome: "changed", seenBy: "p1" });   // 날짜를 안 넘겼다
  ok("⚠️⚠️ 날짜가 없으면 이의가 **열린 채로 남는다**", (await openFlags(db)).length === 1, JSON.stringify(db.st.flags));
  ok("그리고 실패라고 답한다 (화면이 「됐습니다」를 띄우면 안 된다)", r.ok === false, JSON.stringify(r));
  ok("진도도 그대로", got(db, "u-wb").status === "done");
}
{
  // 그 교재 배정 줄도 없고 이의에 회독도 안 적혀 있다 — 진도를 못 바꾼다
  const db = fake({ progress: [P("u-wb", { status: "done", done_on: ON })], books: [] });
  await raiseFlag(db, { studentId: S, unitId: "u-wb", round: null, kind: "not_done" });
  const r = await resolveFlag(db, { flagId: "f1", outcome: "changed", seenBy: "p1", on: ON });
  ok("⚠️ 진도가 안 바뀌면 이의를 **안 닫는다**", (await openFlags(db)).length === 1, JSON.stringify(db.st.flags));
  ok("왜 못 바꿨는지 말해 준다", r.ok === false && /회독/.test(r.why ?? ""), JSON.stringify(r.why));
}
{
  // 1회독 때 단 이의를 2회독 시작 뒤에 닫는다 — 오늘 배정으로 다시 뽑으면 **2회독 줄**이 바뀐다
  const db = fake({ progress: [P("u-wb", { round: 1, status: "done", done_on: "2026-05-01" }),
                               P("u-wb", { round: 2, status: "done", done_on: ON })],
                    books: [{ book_id: "b1", round: 2, from_date: "2026-08-01", in_window: true }] });
  await raiseFlag(db, { studentId: S, unitId: "u-wb", round: 1, kind: "not_done" });
  await resolveFlag(db, { flagId: "f1", outcome: "changed", seenBy: "p1", on: ON });
  const r1 = db.st.progress.find((x) => Number(x.round) === 1), r2 = db.st.progress.find((x) => Number(x.round) === 2);
  ok("⚠️ 이의가 달린 **그 회독** 줄이 바뀐다 (1회독)", r1.status === "none", JSON.stringify(db.st.progress));
  ok("남의 회독(2회독)은 그대로", r2.status === "done");
}

console.log("\n■ 못 쓰게 막는 것");
{
  const db = fake();
  ok("날짜가 없으면 지어내지 않는다",
     (await fromCheck(db, { studentId: S, marks: [{ unitId: "u-wb", mark: "done" }] })).ok === false);
  ok("학생이 없으면 안 돈다",
     (await checkProgress(db, { on: ON, marks: [{ unitId: "u-wb", mark: "done" }] })).ok === false);
  ok("찍힌 것이 없으면 조용히 아무것도 안 한다",
     (await fromCheck(db, { studentId: S, on: ON, marks: [] })).ok === true && db.st.progress.length === 0);
}
{
  const db = fake();
  await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", itemId: "i1" }] }, { tx: true });
  ok("한 판으로 묶어 쓴다 (begin·commit)",
     db.st.log.includes("begin") && db.st.log.includes("commit"), db.st.log.join(","));
}
{
  const db = fake();
  db.query = ((orig) => async (sql, p) => {
    if (/q:write/.test(String(sql))) throw new Error("일부러 터뜨림");
    return orig(sql, p);
  })(db.query.bind(db));
  const r = await fromCheck(db, { studentId: S, on: ON,
    marks: [{ unitId: "u-wb", mark: "done", slot: "home", itemId: "i1" }] });
  ok("쓰다 터지면 되돌린다 (rollback)", r.ok === false && db.st.log.includes("rollback"), db.st.log.join(","));
}

console.log("\n■ 판정 한 벌만 따로 — 화면이 이걸 다시 짜면 안 된다");
{
  const d = decideOne({ mark: "done", slot: "next", unit: U.wb, on: ON });
  ok("decideOne 만 불러도 예습은 ◐", d.status === "doing");
  const e = decideOne({ mark: "done", slot: null, unit: U.wb, on: ON, by: "staff" });
  ok("decideOne — 원장 직접은 ○", e.status === "done");
}

console.log("\n■ ⚠️ **진도에 쓰는 문이 하나뿐인가** — 파일을 훑는다 (옆문이 하나라도 나면 규칙이 두 벌이 된다)");
{
  // 읽기(from · join)는 괜찮다 — 커서와 진도율이 읽는다. **쓰기**만 막는다.
  const WRITE = /(insert\s+into|update)\s+v2\.progress(_part|_flag)?\b/i;
  // ⚠️ **봐주는 목록은 비어 있다.** 2026-09-02 에 마지막 옆문(lib/close.js 의 옛 `Q_PROG_UP` —
  //    마감이 v2.progress 에 바로 `status='done'` 을 박던 자리)이 `fromMemo()` 로 갈아탔다.
  //    이제 「마감으로 올라간 진도」와 「진도판에서 올린 진도」가 **한 벌**이다.
  //    ⚠️ 여기에 줄을 다시 더하지 마라 — 더하는 순간 규칙이 두 벌이 된다.
  const known = new Map();
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.name === "_tmp", "sandbox", "node_modules" || e.name.startsWith(".")) continue;
    const p = d + "/" + e.name;
    if (e.isDirectory()) walk(p); else if (/\.(js|mjs|jsx)$/.test(e.name)) files.push(p);
  } };
  for (const d of ["lib", "app"]) { try { walk(d); } catch { /* 아직 없는 폴더 */ } }

  const doors = [];
  for (const f of files) {
    if (f === "lib/progress.js") continue;
    const src = readFileSync(f, "utf8");
    if (WRITE.test(src) || /\.from\(\s*["']progress["']\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(src))
      doors.push(f);
  }
  const fresh = doors.filter((f) => !known.has(f));
  ok("새로 난 옆문이 없다 (진도 쓰기는 lib/progress.js 한 곳)", fresh.length === 0, fresh.join(" · "));
  for (const f of doors.filter((x) => known.has(x)))
    console.log(`   ⚠️ **아직 열려 있는 옆문 — ${f}**: ${known.get(f)}`);
}

/* ── ⚠️ 진짜 DB 로 한 번 — 가짜 DB 는 죽은 칸을 원리적으로 못 잡는다 ── */
console.log("\n■ 진짜 v2 로 — 트랜잭션 안에서 쓰고 **되돌린다**");
try {
  const url = readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  for (let i = 1; ; i++) { try { await c.connect(); break; }
    catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 3000)); } }
  await c.query("begin");

  const stu = (await c.query(`select id from v2.students where state='active' order by created_at limit 1`)).rows[0];
  // ⚠️ **쪽이 두 장 넘는** 단원만 고른다 — 한 쪽짜리로는 「일부만 냈다」를 만들 수가 없어
  //    N1(예습 범위가 완료 판정에 섞인다)을 진짜 DB 로 재현할 수 없다
  const bk = (await c.query(
    `select b.id, count(*) n from v2.books b join v2.units u on u.book_id=b.id
      where u.state='active' and u.page_start is not null
        and coalesce(u.page_end, u.page_start) > u.page_start + 1
      group by b.id having count(*) >= 3 order by count(*) desc limit 1`)).rows[0];
  const units = (await c.query(
    `select id, chapter, page_start, page_end, q_count from v2.units
      where book_id=$1 and state='active' and page_start is not null
        and coalesce(page_end, page_start) > page_start + 1
      order by sort limit 3`, [bk.id])).rows;
  await c.query(`insert into v2.student_book(student_id,book_id,from_date,round)
                 values($1,$2,v2.today()-1,3)
                 on conflict (student_id,book_id,from_date) do update set round=3`, [stu.id, bk.id]);

  const db = { query: (sql, p) => c.query(sql, p) };
  const on = (await c.query(`select v2.today()::text d`)).rows[0].d;

  const r1 = await checkProgress(db, { studentId: stu.id, on, by: "check", marks: [
    { unitId: units[0].id, mark: "done", slot: "home", range: null },
    { unitId: units[1].id, mark: "done", slot: "next", range: null }] }, { tx: false, gather: false });
  ok("진짜 DB 에 썼다", r1.ok === true, r1.why);
  const rows = (await c.query(
    `select unit_id, round, status, done_on, last_by, confirmed from v2.progress
      where student_id=$1 and unit_id = any($2::uuid[])`, [stu.id, units.map((u) => u.id)])).rows;
  const a = rows.find((x) => x.unit_id === units[0].id), b = rows.find((x) => x.unit_id === units[1].id);
  ok("숙제 ○ → 완료", a?.status === "done", JSON.stringify(a));
  ok("⚠️ 예습 ○ → **완료가 아니다**", b?.status === "doing", JSON.stringify(b));
  ok("회독은 배정 줄에서 왔다 (3회독)", Number(a?.round) === 3, String(a?.round));
  ok("검사가 쓴 줄로 남는다", a?.last_by === "check" && a?.confirmed === true);

  // ⚠️⚠️ 진짜 DB 로 그 사고를 그대로 — 예습으로 선 ◐ 에 rollup 을 부른다.
  //    옛 코드는 조각이 0줄인데도 done 으로 올려 **수업을 한 번도 안 한 단원**이 완료로 찍혔다
  const partsN = (await c.query(
    `select count(*)::int n from v2.progress_part where student_id=$1 and unit_id=$2`,
    [stu.id, units[1].id])).rows[0].n;
  await rollup(db, { studentId: stu.id, unitIds: [units[1].id], on }, { tx: false });
  const after1 = (await c.query(
    `select status, marked_on::text m from v2.progress where student_id=$1 and unit_id=$2 and round=3`,
    [stu.id, units[1].id])).rows[0];
  ok("⚠️⚠️ 조각이 0줄인 ◐ 은 rollup 이 완료로 못 올린다 (진짜 DB)",
     partsN === 0 && after1?.status === "doing", `조각 ${partsN}줄 / ${JSON.stringify(after1)}`);
  ok("만진 날(marked_on)이 진짜 칸에 써진다 (0065)", after1?.m === on, String(after1?.m));

  /* ⚠️⚠️ N1 (2026-09-02 2차) — 한 판에 **등원 ○(일부 쪽) + 범위 안 적은 예습 ○** 이 같이 깔린다.
     예습의 「범위 없음」이 완료 판정에 섞여 6쪽만 낸 단원이 통째로 완료가 됐다 */
  const sheet = (await c.query(
    `insert into v2.day_sheet(student_id, date) values($1,$2::date)
     on conflict (student_id, date, class_id) do update set updated_at=now() returning id`,
    [stu.id, on])).rows[0];
  const half = `p.${units[1].page_start}-${units[1].page_start + 1}`;
  const it = (await c.query(
    `insert into v2.day_item(sheet_id, slot, unit_id, range_note, status) values
       ($1,'class',$2,$3,'done'), ($1,'next',$2,null,'done')
     on conflict (sheet_id, slot, item_id, unit_id) do update set range_note=excluded.range_note,
       status=excluded.status returning id, slot`, [sheet.id, units[1].id, half])).rows;
  const cls = it.find((x) => x.slot === "class");
  const r2 = await checkProgress(db, { studentId: stu.id, on, by: "check", marks: [
    { unitId: units[1].id, mark: "done", slot: "class", range: half, itemId: cls.id, sheetId: sheet.id }],
  }, { tx: false });
  const n1 = (await c.query(
    `select status, done_on from v2.progress where student_id=$1 and unit_id=$2 and round=3`,
    [stu.id, units[1].id])).rows[0];
  ok("⚠️⚠️ 범위 안 적은 **예습 ○** 이 옆에 있어도 일부만 낸 단원은 ◐ 이다 (진짜 DB)",
     n1?.status === "doing", JSON.stringify(n1) + " / " + (r2.applied[0]?.why ?? r2.why));
  const n1p = (await c.query(
    `select page_from, page_to from v2.progress_part where student_id=$1 and unit_id=$2 and round=3`,
    [stu.id, units[1].id])).rows;
  ok("⚠️ 실제로 낸 그 쪽은 조각으로 **남는다** (진짜 DB)",
     n1p.length === 1 && n1p[0].page_from === units[1].page_start, JSON.stringify(n1p));

  /* ⚠️⚠️ S1 (2026-09-02 2차) — 아이 화면은 slot 을 안 보낸다.
     그날 **예습으로만** 깔린 단원을 아이가 누르면 통째로 완료가 됐다 */
  await c.query(`update v2.students set progress_edit='on' where id=$1`, [stu.id]);
  await c.query(
    `insert into v2.day_item(sheet_id, slot, unit_id, status) values($1,'next',$2,'none')
     on conflict (sheet_id, slot, item_id, unit_id) do nothing`, [sheet.id, units[2].id]);
  const r3 = await fromStudent(db, { studentId: stu.id, on,
    marks: [{ unitId: units[2].id, mark: "done" }] }, { tx: false });
  const s1 = (await c.query(
    `select status, last_by, confirmed from v2.progress where student_id=$1 and unit_id=$2 and round=3`,
    [stu.id, units[2].id])).rows[0];
  ok("⚠️⚠️ 아이가 slot 없이 눌러도 **그날 예습으로만 깔린 단원**은 완료가 아니다 (진짜 DB)",
     s1?.status === "doing", JSON.stringify(s1) + " / " + (r3.applied[0]?.why ?? r3.why));
  ok("아이가 찍은 줄로만 선다", s1?.last_by === "student" && s1?.confirmed === false, JSON.stringify(s1));

  // ✕ — 지우지 않고 내린다
  await checkProgress(db, { studentId: stu.id, on, by: "check",
    marks: [{ unitId: units[0].id, mark: "missing", slot: "home" }] }, { tx: false, gather: false });
  const after = (await c.query(
    `select status, done_on from v2.progress where student_id=$1 and unit_id=$2 and round=3`,
    [stu.id, units[0].id])).rows;
  ok("✕ 는 줄을 **안 지운다** — 상태로 내린다",
     after.length === 1 && after[0].status === "none", JSON.stringify(after));

  // 커서가 실제로 안 넘어가는지 — 예습으로 완료가 찍혔다면 여기서 드러난다
  const cur = (await c.query(`select * from v2.cursor_of($1,$2)`, [stu.id, bk.id])).rows[0];
  ok("커서가 예습 단원을 건너뛰지 않았다", cur != null, JSON.stringify(cur));

  await c.query("rollback");
  await c.end();
} catch (e) {
  fail++; console.log("   ❌ 진짜 DB 로 못 돌렸다 —", String(e.message).split("\n")[0]);
}

console.log(`\n■ 진도 올리기 검사 ${n}건 · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
