/**
 * **갯수 두 단추** — 「반복」과 「루틴」. (원장님 확정 2026-09-02)
 *
 * > 「**반복** 버튼 누르면 그대로, **루틴** 누르면 루틴대로 다시 부여」
 *
 * ```
 *  [반복]  지난번에 낸 그대로     갯수 · 분량 · 뺄 항목을 그대로 얹는다
 *  [루틴]  루틴이 정한 대로       routineNext() 를 그냥 부른 것
 * ```
 *
 * ── ⚠️⚠️ **「그대로」는 분량과 조절이지 단원이 아니다**
 *    지난번 단원은 **이미 끝났다.** 지난 판의 단원을 그대로 쓰면 **같은 단원을 또 낸다** —
 *    아이는 어제 푼 것을 오늘 또 받고, 진도는 안 올라가며, 오류는 안 난다.
 *    → 이 파일은 지난 판에서 **셋만** 세어 온다: **갯수 · 분량 · 뺄 항목**.
 *      **어디를 낼지는 `v2.cursor_of` 가 정한 지금 자리**다. 여기서 단원을 고르지 않는다.
 *
 * ── 여기서 **안 하는 것** (남의 몫이다 — 두 벌로 만들면 그날부터 어긋난다)
 *    · 무엇을 낼지 **정하는 것** → `lib/routine.js` 의 `routineNext()`.
 *      **「루틴」 단추는 그것을 그냥 부르는 것이다. 다시 만들지 않는다**(원칙 1).
 *    · 지금 어디인가 → `v2.cursor_of`. 멈췄나 → `v2.book_stop`(0065). 여기서 다시 안 센다.
 *    · 덩어리 가르기 → `routine.lumpsOf()` · 범위 메모 읽기 → `progress.mergeRanges()`.
 *    · 판에 줄 세우기 → `lib/day.js` 의 `freezeDay()`. 이 파일은 **초안까지**다.
 *
 * ── ⚠️ 「지난번에 낸 것」은 **어디에도 따로 저장하지 않는다** (원칙 5)
 *    `lib/day.js` 가 굳힌 `v2.day_item` 줄에서 **세어 나온다.**
 *    갯수 = 그날 나간 덩어리 수 · 분량 = 그날 나간 쪽 수(`range_note`) ·
 *    뺄 항목 = 그 영역 루틴에 있는데 그날 판에 **없던** 항목.
 *
 * ── ⚠️ 못 세는 자리는 **지어내지 않는다** (대전제 0)
 *    · 지난 판이 아예 없다(첫 회) → 「반복」은 **뜻이 없다.** 그 사실을 돌려준다.
 *    · 지난 판은 있는데 줄에 **단원이 안 붙어** 있다 → 어느 교재 것인지 모른다. 밝힌다.
 *      ⚠️ 실측(2026-09-02 진짜 DB): `day_item` 의 `class` 32줄 **전부** · `next` 3줄 **전부** ·
 *      `home` 102줄 중 79줄이 `unit_id` 가 비어 있다. **지금은 거의 못 센다** —
 *      화면이 판을 굳힐 때 `unit_id` 를 붙여야 이 단추가 산다.
 *    · 교재가 멈춰 있다(`v2.book_stop` 이 `book_off`) → **어느 단추도 안 낸다.**
 *
 * ── ⚠️ 화면은 단추를 **흐리게 하지 않는다** (투명도 금지 · 절 ㉑)
 *    못 누르는 자리는 `buttons.same.on = false` 와 **까닭 한 줄**(`why`)로 돌려준다.
 *    화면은 그 줄을 그대로 적는다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 를 받는 얕은 어댑터다 (pg 든 supabase 든).
 * ⚠️ SQL 안에 `${…}` 를 끼우지 않는다 — 끼우면 `scripts/check-sql.mjs` 가 칸 이름을 못 물어본다.
 */
import { ymd } from "./session.js";
import {
  booksOf, routineOf, lumpsOf, slotsOf, routineNext, loadOf, saysOf, STOP,
} from "./routine.js";
import { mergeRanges } from "./progress.js";

// ────────────────────────────────────────────────────────────────
// 못 박아 두는 값
// ────────────────────────────────────────────────────────────────

/** 단추 둘. **셋째는 없다** — 화면이 다른 이름을 보내면 거절한다 */
export const AGAIN = Object.freeze({ SAME: "same", ROUTINE: "routine" });

/**
 * 「지난번 갯수·분량」을 세는 자리 둘.
 * ⚠️ `next`(예습)는 **다음 단원**을 가리키므로 여기 안 넣는다 — 넣으면 갯수가 부풀어
 *    지난번보다 더 많이 나간다. 뺄 항목을 셀 때만 `next` 를 같이 본다.
 */
export const LUMP_SLOTS = Object.freeze(["class", "home"]);

/** 왜 「반복」이 안 되나 — 화면이 이 까닭을 그대로 적는다 */
export const WHY = Object.freeze({
  OK: null,
  FIRST: "first",         // 지난 판이 아예 없다 (첫 회)
  NO_UNIT: "no_unit",     // 지난 판은 있는데 줄에 단원이 안 붙어 있다
  BOOK_OFF: "book_off",   // 교재멈춤 — 어느 단추도 안 낸다
});

// ── SQL — 앞머리 주석(/* again:… */)은 **가짜 DB 가 붙잡는 손잡이**다. 지우지 마라 ──────

/**
 * 그 아이 그 교재의 **가장 가까운 지난 판**의 줄들.
 * ⚠️ `s.date < $3` — **그날은 안 본다.** 오늘 것을 「지난번」이라 부르면 갯수가 자기를 베낀다.
 * ⚠️ 교재를 가리키는 길은 `unit_id` 하나뿐이다 — `day_item` 에 `book_id` 칸이 **없다**(실측).
 */
const SQL_LAST = `/* again:last */
select s.date::text as on_date, i.id, i.slot, i.item_id, i.unit_id,
       i.range_note, i.memo, i.sort, i.status,
       u.chapter, u.mid, u.sub, u.is_workbook, u.sort as unit_sort,
       u.page_start, u.page_end, u.q_count, u.q_range,
       v2.unit_label(u.id, true) as label
  from v2.day_item i
  join v2.day_sheet s on s.id = i.sheet_id
  join v2.units u on u.id = i.unit_id
 where s.student_id = $1::uuid and u.book_id = $2::uuid
   and s.date < $3::date and i.slot in ('class','home','next')
   and s.date = (select max(s2.date)
                   from v2.day_item i2
                   join v2.day_sheet s2 on s2.id = i2.sheet_id
                   join v2.units u2 on u2.id = i2.unit_id
                  where s2.student_id = $1::uuid and u2.book_id = $2::uuid
                    and s2.date < $3::date and i2.slot in ('class','home','next'))
 order by i.slot, i.sort, i.id`;

/**
 * 판은 있었나 — **단원이 안 붙은 줄까지 세는 자리**다.
 * ⚠️ 이게 없으면 「단원이 안 붙어 못 읽었다」를 **「첫 회다」로 잘못 말한다.**
 *    실측으로 지금 판의 `class`·`next` 줄은 단원이 하나도 안 붙어 있어, 이 구별이 없으면
 *    앱이 매일 「이 교재는 처음입니다」라고 지어낸다.
 */
const SQL_ANY_SHEET = `/* again:any */
select max(s.date)::text as on_date, count(*)::int as n,
       count(i.unit_id)::int as with_unit
  from v2.day_item i
  join v2.day_sheet s on s.id = i.sheet_id
 where s.student_id = $1::uuid and s.date < $2::date
   and i.slot in ('class','home','next')`;

/** 그날 판에서 **단원이 안 붙은 줄** — 어느 교재 것인지 몰라 「그대로」에서 빠진 줄이다 */
const SQL_ORPHAN = `/* again:orphan */
select i.slot, count(*)::int as n
  from v2.day_item i
  join v2.day_sheet s on s.id = i.sheet_id
 where s.student_id = $1::uuid and s.date = $2::date
   and i.slot in ('class','home','next') and i.unit_id is null
 group by i.slot
 order by i.slot`;

/**
 * 덩어리를 가를 때 쓰는 **걸러지기 전 줄 차례**(`seq`).
 * ⚠️ 안 넘기면 가운데 한 줄이 빠진 자리에서 다른 중단원의 같은 이름이 맞닿아 **다시 뭉쳐**
 *    갯수가 실제보다 **적게** 세어진다 — 「반복」이 지난번보다 적게 낸다(`lumpsOf` 주석 (가)).
 * ⚠️ 대단원을 넘겨 뭉치지 않도록 **지난 판에 나온 대단원만** 읽는다.
 */
const SQL_SEQ = `/* again:seq */
select u.id, u.chapter, u.mid, u.sub, u.is_workbook, u.sort,
       u.page_start, u.page_end, u.q_count, u.q_range
  from v2.units u
 where u.book_id = $1::uuid and u.state = 'active' and u.chapter = any($2::text[])
 order by u.sort`;

/** 멈춤 판단은 **DB 함수 한 곳**이다 (0065). 여기서 세 길(손·날짜·시험)을 다시 안 본다 */
const SQL_STOP = `/* again:stop */
select v2.book_stop($1::uuid, $2::uuid, $3::date) as stop_mode`;

// ────────────────────────────────────────────────────────────────
// ① 셈 — 순수 함수 (검사가 DB 없이 그대로 부른다)
// ────────────────────────────────────────────────────────────────

/**
 * 쪽 토막들이 덮는 쪽 수. **셈이지 판단이 아니다** — 겹친 것을 두 번 안 센다.
 * (p.35~40 은 5쪽이 아니라 **6쪽**이다 — `chunk.pageCount` 와 같은 자로 센다)
 */
export function spanPages(spans = []) {
  const s = spans
    .filter((x) => Array.isArray(x) && x.length === 2)
    .map(([a, b]) => [Number(a), Number(b)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let n = 0, end = -Infinity;
  for (const [a, b] of s) {
    const from = Math.max(a, end + 1);
    if (b >= from) { n += b - from + 1; end = b; }
  }
  return n;
}

/**
 * **지난 판 줄들에서 「갯수 · 분량 · 뺄 항목」을 세어 낸다.**
 *
 * @param rows   `lastGiven()` 이 준 줄들 (`class·home·next` 셋 다)
 * @param opt    { items, seq, orderBasis, chunkDepth }
 *   · `items` 그 영역 루틴 줄들 — **뺄 항목**은 이것과 견줘야 나온다
 *   · `seq`   걸러지기 전 줄 차례 — 없으면 덩어리가 뭉쳐 갯수가 적게 나온다
 * @returns { count, pages, drop, on, notes, kind, chapters, byMemo }
 *   · `count` 덩어리 갯수 (회차) · `pages` 분량(쪽). **`null` 이 「통째로」다**
 *   · `drop`  뺄 항목 id 목록 · `notes` 화면에 그대로 뜨는 말
 *
 * ⚠️ **`pages: 0` 을 돌려주지 않는다.** `routineNext` 는 0 을 「1쪽만」으로 읽는다 —
 *    실측으로 그 자리에서 김서은 교재가 **1쪽**만 나간 적이 있다. 모르면 `null`(통째)이다.
 */
export function sameFrom(rows = [], opt = {}) {
  const { items = [], seq = [], orderBasis = "sub", chunkDepth = "sub" } = opt;
  const notes = [];
  const on = rows[0]?.on_date ?? rows[0]?.on ?? null;

  // ── ㉠ 갯수 — 그날 **오늘 자리(class·home)** 에 나간 덩어리가 몇 개였나
  const mine = rows.filter((r) => LUMP_SLOTS.includes(r.slot));
  const seen = new Map();
  for (const r of mine) {
    const id = r.unit_id ?? r.unitId;
    if (!id || seen.has(id)) continue;
    seen.set(id, {
      id,
      chapter: r.chapter, mid: r.mid, sub: r.sub,
      is_workbook: r.is_workbook, sort: r.unit_sort ?? r.sort ?? 0,
      page_start: r.page_start, page_end: r.page_end, q_count: r.q_count, q_range: r.q_range,
      label: r.label ?? null,
    });
  }
  const units = [...seen.values()];
  const chapters = [...new Set(units.map((u) => u.chapter).filter(Boolean))];
  const lumps = units.length
    ? lumpsOf(units, { orderBasis, chunkDepth, seq: seq.length ? seq : units })
    : [];
  const count = lumps.length || null;
  if (chapters.length > 1) {
    notes.push(`지난 판이 대단원 ${chapters.length}개에 걸쳐 있습니다 — 갯수 ${count}개로 셌습니다`);
  }

  // ── ㉡ 분량 — 그날 적힌 「이번에 낼 번호·쪽」에서 센다. **안 적혔으면 통째로 낸 것이다**
  //    (`routine.layout` 은 다 덮을 때 `rangeNote` 를 안 적는다 — 비면 「다 덮었다」는 뜻이다)
  const noted = [...new Set(mine.map((r) => (r.range_note ?? r.rangeNote ?? "").trim()).filter(Boolean))];
  let pages = null, kind = "whole";
  if (noted.length) {
    const r = mergeRanges(noted);          // 범위 메모 읽기는 `progress.js` 한 곳이다
    if (r.kind === "page") {
      const p = spanPages(r.spans);
      if (p > 0) { pages = p; kind = "page"; }
    } else if (r.kind === "q" || r.kind === "num") {
      kind = "q";
      notes.push(`지난번 범위가 쪽이 아니라 문항입니다(${noted.join(" · ")}) — 분량은 통째로 냅니다`);
    } else {
      kind = "unknown";
      notes.push(`지난번 범위를 못 읽었습니다(${noted.join(" · ")}) — 분량은 통째로 냅니다`);
    }
  }

  // ── ㉢ 뺄 항목 — 루틴에 있는데 그날 판에 **없던** 항목
  //    ⚠️ 「없다」가 곧 「뺐다」는 아니다. 그 자리가 그날 통째로 안 나갔을 수도 있다
  //       (✕ 인 날은 예습이 통째로 안 나가고, 숙제멈춤이면 숙제·예습이 통째로 빈다).
  //       → **그 자리에 다른 루틴 항목이 하나라도 서 있을 때만** 「뺐다」로 읽는다.
  const byMemo = mine.some((r) => !(r.item_id ?? r.itemId) && (r.memo ?? null));
  const gave = new Set(rows.map((r) => String(r.item_id ?? r.itemId ?? "")).filter(Boolean));
  const liveSlot = new Set();
  for (const r of rows) if (r.item_id ?? r.itemId) liveSlot.add(r.slot);
  const drop = [], unsure = [];
  for (const it of items) {
    const id = String(it.item_id ?? it.itemId ?? "");
    if (!id || gave.has(id)) continue;
    const slots = slotsOf(it);
    if (slots.some((s) => liveSlot.has(s))) drop.push(id);
    else unsure.push(it.name ?? id);
  }
  if (byMemo) {
    notes.push("지난번은 **메모로 대신한 날**입니다 — 뺀 항목을 셀 수 없어 루틴 그대로 냅니다");
  }
  if (unsure.length) {
    notes.push(`지난 판에 「${unsure.join(" · ")}」 자리가 통째로 없었습니다 — `
      + "뺀 것인지 그날만 안 나간 것인지 몰라 **안 뺐습니다**");
  }

  return {
    on, count, pages, kind, chapters, byMemo,
    // ⚠️ 메모로 대신한 날은 뺄 항목을 못 센다 — 지어내지 않는다
    drop: byMemo ? [] : drop,
    units, lumps, notes,
  };
}

/**
 * 「반복」이 뜻이 있나 — **화면이 단추를 흐리게 하지 않도록 까닭을 글로 준다**(절 ㉑).
 * @returns { same:{on,why}, routine:{on,why} }
 */
export function buttonsFor(b = {}) {
  const stop = b.stopMode ?? STOP.RUNNING;
  if (stop === STOP.BOOK_OFF) {
    const why = `교재멈춤 — 이 교재는 오늘 낼 것이 없습니다 (${b.stopWhy ?? "풀 때까지"}). 풀면 이 자리에서 이어갑니다`;
    return { same: { on: false, why }, routine: { on: false, why } };
  }
  if (b.why === WHY.FIRST) {
    return {
      same: { on: false, why: "이 교재는 지난 판이 없습니다 — 「반복」할 것이 아직 없습니다. 「루틴」으로 첫 회를 냅니다" },
      routine: { on: true, why: null },
    };
  }
  if (b.why === WHY.NO_UNIT) {
    return {
      same: { on: false, why: `지난 판(${b.lastSheetOn ?? "날짜 모름"})의 줄에 **단원이 안 붙어** 있어 이 교재 것인지 알 수 없습니다 — 「반복」이 무엇을 베낄지 모릅니다` },
      routine: { on: true, why: null },
    };
  }
  return { same: { on: true, why: null }, routine: { on: true, why: null } };
}

// ────────────────────────────────────────────────────────────────
// ② DB 에 묻는 자리
// ────────────────────────────────────────────────────────────────

/**
 * 그 아이 그 교재의 **가장 가까운 지난 판**. **저장된 것을 읽을 뿐 아무것도 안 쓴다.**
 * @returns { on, rows, seq, why, lastSheetOn, orphans }
 */
export async function lastGiven(db, { studentId, bookId, before } = {}) {
  const { rows } = await db.query(SQL_LAST, [studentId, bookId, before]);
  if (!rows.length) {
    // 판이 아예 없었나, 아니면 **단원이 안 붙어** 못 읽었나 — 이 둘을 섞으면 앱이 지어낸다
    const a = (await db.query(SQL_ANY_SHEET, [studentId, before])).rows[0] ?? {};
    const had = Number(a.n) || 0;
    return {
      on: null, rows: [], seq: [], orphans: [],
      lastSheetOn: a.on_date ?? null,
      why: had ? WHY.NO_UNIT : WHY.FIRST,
    };
  }
  const on = rows[0].on_date;
  const chapters = [...new Set(rows.map((r) => r.chapter).filter(Boolean))];
  const seq = chapters.length
    ? (await db.query(SQL_SEQ, [bookId, chapters])).rows
    : [];
  const orphans = (await db.query(SQL_ORPHAN, [studentId, on])).rows;
  return { on, rows, seq, orphans, lastSheetOn: on, why: WHY.OK };
}

/**
 * 그 아이 그 교재가 **지금 멈춰 있나** — `v2.book_stop`(0065) 한 곳에만 묻는다.
 * ⚠️ 배정이 없으면 `null` 이 온다. 그때는 「돌아감」이라고 **지어내지 않는다.**
 */
export async function stopNow(db, { studentId, bookId, on } = {}) {
  const { rows } = await db.query(SQL_STOP, [studentId, bookId, on]);
  return rows[0]?.stop_mode ?? null;
}

// ────────────────────────────────────────────────────────────────
// ③ 단추 하나 = 이 함수 한 번 — 화면이 부르는 것은 이것 하나다
// ────────────────────────────────────────────────────────────────

/**
 * **단추를 눌렀을 때 차려지는 초안.**
 *
 * @param opt.studentId  아이
 * @param opt.on         날짜 (YYYY-MM-DD). 없으면 `v2.today()`
 * @param opt.mode       `AGAIN.SAME`(반복) · `AGAIN.ROUTINE`(루틴)
 * @param opt.bookIds    「반복」을 걸 교재. 없으면 **든 교재 전부**
 * @param opt.memo       교재마다 메모 — `routineNext` 에 그대로 넘긴다
 * @returns { ok, mode, plan, adjust, books, says, msg }
 *   · `plan`   `routineNext()` 가 준 판 그대로 (화면은 이걸 그린다)
 *   · `adjust` 이번에 얹은 조절 — **화면이 다시 만들지 않는다**
 *   · `books`  교재마다 { bookId, name, stopMode, why, count, pages, drop, buttons, notes }
 *
 * ⚠️ **「루틴」은 `routineNext()` 를 그냥 부른 것이다.** 조절을 한 톨도 안 얹는다.
 * ⚠️ **교재멈춤인 교재는 어느 단추도 안 낸다.** `routineNext` 도 막지만, 여기서 한 번 더
 *    비우고 **까닭을 적는다** — 두 판단이 어긋나면 그 사실 자체를 밝힌다.
 */
export async function againPlan(db, opt = {}) {
  const { studentId, mode, memo = {}, bookIds = null } = opt;
  if (mode !== AGAIN.SAME && mode !== AGAIN.ROUTINE) {
    throw new Error("단추는 둘뿐이다 — 'same'(반복) 또는 'routine'(루틴)");
  }
  if (!studentId) throw new Error("아이가 없다");

  const today = ymd((await db.query(`select v2.today() as d`, [])).rows[0]?.d);
  const on = ymd(opt.on ?? today);

  const books = await booksOf(db, studentId, on);
  const only = bookIds ? new Set(bookIds.map(String)) : null;
  const areas = [...new Set(books.map((b) => b.area).filter(Boolean))];
  const routines = mode === AGAIN.SAME ? await routineOf(db, studentId, areas) : new Map();

  const adjust = {};
  const out = [];
  const blocked = new Set();

  for (const b of books) {
    const card = {
      bookId: b.bookId, name: b.name, area: b.area ?? null,
      stopMode: b.stopMode, stopWhy: b.stopWhy ?? null,
      why: WHY.OK, lastOn: null, lastSheetOn: null,
      count: null, pages: null, drop: [], notes: [],
    };

    // ── ㉠ 멈춤이 먼저다 — **어느 단추도 안 낸다** (v2.book_stop 한 곳에만 묻는다)
    const stop = await stopNow(db, { studentId, bookId: b.bookId, on });
    if (stop && stop !== b.stopMode) {
      // ⚠️ 두 판단이 갈렸다 — 조용히 한쪽을 고르지 않는다(원칙 1 이 깨진 자리다)
      card.notes.push(`⚠️ 멈춤 판단이 갈립니다 — v2.book_stop 은 「${stop}」, 앱은 「${b.stopMode}」입니다. `
        + "**안전한 쪽(멈춤)으로 봅니다**");
    }
    const stopped = stop === STOP.BOOK_OFF || b.stopMode === STOP.BOOK_OFF;
    if (stopped) {
      card.stopMode = STOP.BOOK_OFF;
      card.why = WHY.BOOK_OFF;
      blocked.add(String(b.bookId));
      card.buttons = buttonsFor(card);
      card.notes.push(card.buttons.same.why);
      out.push(card);
      continue;
    }
    if (b.stopMode === STOP.HW_OFF) card.notes.push("이 교재는 수업만 합니다 — 숙제·예습이 안 나갑니다 (숙제멈춤)");

    // ── ㉡ 「루틴」은 여기서 끝이다. 조절을 한 톨도 안 얹는다
    if (mode === AGAIN.ROUTINE) {
      card.buttons = buttonsFor(card);
      out.push(card);
      continue;
    }

    // ── ㉢ 「반복」 — 지난 판에서 셋을 세어 온다
    if (only && !only.has(String(b.bookId))) {
      card.notes.push("이 교재에는 「반복」을 안 걸었습니다 — 루틴대로 나갑니다");
      card.buttons = buttonsFor(card);
      out.push(card);
      continue;
    }
    const last = await lastGiven(db, { studentId, bookId: b.bookId, before: on });
    card.lastSheetOn = last.lastSheetOn ?? null;
    if (last.why !== WHY.OK) {
      card.why = last.why;
      card.buttons = buttonsFor(card);
      // ⚠️ **조용히 루틴으로 갈아타지 않는다** — 무엇을 했는지 글로 남긴다
      card.notes.push(card.buttons.same.why + " — 이번에는 **루틴대로** 차렸습니다");
      out.push(card);
      continue;
    }

    const items = routines.get(b.area) ?? [];
    const same = sameFrom(last.rows, {
      items, seq: last.seq, orderBasis: b.orderBasis, chunkDepth: b.chunkDepth,
    });
    card.lastOn = same.on;
    card.count = same.count;
    card.pages = same.pages;
    card.drop = same.drop;
    card.notes.push(...same.notes);
    for (const o of last.orphans ?? []) {
      card.notes.push(`⚠️ 지난 판(${same.on})의 「${o.slot}」 ${o.n}줄에 단원이 안 붙어 있어 `
        + "어느 교재 것인지 모릅니다 — 그 줄은 「그대로」에서 빠졌습니다");
    }
    // ⚠️ **단원은 안 넘긴다.** 넘기면 같은 단원을 또 낸다 — 갯수·분량·뺄 항목만이다
    if (same.count) adjust[b.bookId] = { count: same.count, pages: same.pages, drop: same.drop };
    card.notes.push(`지난번(${same.on})과 같이 냅니다 — ${same.count ?? "?"}회차`
      + (same.pages ? ` · ${same.pages}쪽` : " · 통째로")
      + (same.drop.length ? ` · 뺀 항목 ${same.drop.length}개` : "")
      + ". **단원은 지금 자리**입니다");
    card.buttons = buttonsFor(card);
    out.push(card);
  }

  // ── ㉣ 차린다 — **`routineNext()` 를 부르는 것이 전부다** (다시 만들지 않는다)
  const plan = await routineNext(db, { studentId, on, adjust, memo });

  // ── ㉤ 멈춘 교재는 **한 줄도 안 낸다.** 비우고 까닭을 적는다
  let scrubbed = 0;
  for (const bk of plan.books ?? []) {
    if (!blocked.has(String(bk.bookId))) continue;
    const had = ["class", "home", "next"].reduce((s, k) => s + (bk[k]?.length ?? 0), 0);
    if (had) {
      scrubbed += had;
      bk.notes = [...(bk.notes ?? []), `⚠️ 교재멈춤인데 ${had}줄이 차려져 비웠습니다`];
    }
    bk.class = []; bk.home = []; bk.next = [];
    bk.empty = true;
    bk.why = bk.why ?? "교재멈춤 — 이 교재는 오늘 학습도 숙제도 없습니다";
  }
  if (scrubbed) {
    // 셈은 한 곳(`routine.js`)이다 — 비운 뒤 **다시 세게** 한다. 여기서 빼지 않는다
    plan.load = loadOf(plan);
    plan.says = saysOf(plan);
  }

  const says = [
    ...(plan.says ?? []),
    ...out.filter((b) => b.notes.length).flatMap((b) => b.notes.map((t) => `${b.name} — ${t}`)),
  ];
  const done = mode === AGAIN.SAME ? out.filter((b) => b.count).length : out.filter((b) => b.why === WHY.OK).length;
  return {
    ok: true, mode, on, asOf: today, plan, adjust, books: out, says,
    msg: mode === AGAIN.ROUTINE
      ? `루틴대로 다시 차렸습니다 — 교재 ${done}권`
      : `지난번에 낸 그대로 차렸습니다 — 교재 ${done}권 (단원은 지금 자리입니다)`,
  };
}
