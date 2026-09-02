/**
 * **한 번에 읽는 자리** — 교재 한 권마다 따로 묻던 것을 한 판에 묻는다. (계획 「속도」 절)
 *
 * ── 왜 있나 (실측 2026-09-02, 진짜 DB · `scripts/check-fast.mjs` 가 매번 다시 잰다)
 *    장원우(교재 6권) 한 명을 열면 `routineNext` 하나가 **조회 27번 · 821ms** 를 썼다.
 *    `/today` 통째로는 **조회 30번 · 30단.** 상한은 **조회 20 · 4단**이고 합격선은 **0.5초**다.
 *    27번의 정체는 교재마다 따로 묻는 넷이다 —
 *      커서 6 · 그 대단원 줄 6 · 다음 자리 3 · 조각 8   (+ 고정 넷: 오늘·교재·루틴·검사)
 *    이 파일은 그 넷을 **교재 전부를 한 판에** 물어 두고, `routineNext` 가 물으러 오면
 *    **DB 대신 그 자리에서 답한다.** → 조회 **13**(고정 7 + 교재 한 권마다 1) · 직렬 **2단**.
 *    ⚠️ 이 숫자를 여기 믿고 두지 마라 — `scripts/check-fast.mjs` 가 **돌 때마다 다시 재고**,
 *       상한을 넘으면 그 자리에서 빨개진다. 여기 적힌 것은 2026-09-02 실측이다.
 *
 * ── ⚠️⚠️ **「직렬 2단」을 빨라진 것으로 읽지 마라** (실측 2026-09-02)
 *    `app/today/db.js` 는 요청마다 `pg.Client` **하나**를 연다. node-postgres 는 한 문에서
 *    조회를 **줄 세워** 보내므로 `Promise.all` 로 묶어도 왕복은 차례차례다 —
 *    0.05초짜리 셋을 같이 불러도 차례로 부른 것과 **같은 시간**이 걸렸다.
 *    → 지금 체감을 줄이는 것은 **조회 수**(27→13)이고, 직렬 단은 문을 여럿 열었을 때 비로소 붙는다.
 *      `check-fast.mjs` ⑤-a 가 그것도 **재서 띄운다.**
 *    ⚠️ 다음 자리(`afterUnits`)만은 교재마다 따로 묻는다 — 그 문의 차례가 곧 커서 차례라
 *       옮겨 적으면 **두 벌**이 되기 때문이다(아래 ㊻). 대신 **같은 단**에서 한꺼번에 묻는다.
 *
 * ── ⚠️⚠️ **판단을 새로 만들지 않는다** (원칙 1 · 계획 ㊻)
 *    · 커서 차례(대단원 차례 → 갈래 → 줄 차례)를 **여기서 다시 짜지 않는다.**
 *      한 판에 묻는 SQL 도 `v2.cursor_of` 를 **부르기만** 한다 — 하나만 빠져도
 *      오류 없이 **조용히 틀린 차례**로 나간다.
 *    · 받은 줄을 `{ round, chapter, … }` 로 옮기는 것도 `lib/routine.js` 의 `cursorOf`
 *      **그 함수를 그대로 불러서** 한다. 여기서 옮겨 적으면 두 벌이 된다.
 *    · 교재 목록·검사 줄·루틴도 `booksOf`·`checksOf`·`routineOf` **그 함수**를 부른다.
 *    · 그러므로 옛 길과 **글자까지 같은 답**이 나와야 한다.
 *      `scripts/check-fast.mjs` 가 **진짜 DB 로 옛 길과 새 길을 맞대** 확인한다. 다르면 실패다.
 *
 * ── 못 알아보면 **옛 길로 간다** (앱이 멈추지 않는다)
 *    `routineNext` 의 SQL 이 바뀌면 여기 표시가 안 맞아 **그냥 DB 로 넘어간다** —
 *    느려질 뿐 답은 옛 길 그대로다. 대신 조회 수가 도로 늘어 **검사가 빨개진다.**
 *
 * ── ⚠️ 아직 DB 에 없는 것 — `v2.cursors_of(학생, 날짜)`
 * ✅ **DB 함수가 섰다 (0071)** — `v2.cursors_of(학생, 날짜)` 를 부른다.
 *    ⚠️ 그 함수도 차례를 **다시 짜지 않고** `v2.cursor_of` 를 부르기만 한다(㊻).
 *    ⚠️ **날짜를 넘긴다** — 옛 길은 `v2.today()` 로만 읽어 지난 날짜 판이 거짓말을 했다.
 *    보고의 `needsDb` 에 그 SQL 을 **DB 함수로 옮긴 것**을 냈다 — 그게 서면 이 파일은
 *    `select … from v2.cursors_of($1,$2)` 한 줄로 바뀐다(왕복 수는 지금도 하나라 같다).
 *    ⚠️ **없는 함수를 미리 적어 두지 않는다** — `scripts/check-sql.mjs` 가 진짜 스키마에
 *      물어보므로 그 자리에서 빨개진다. 대신 **함수가 생긴 날** `check-fast.mjs` 가
 *      「DB 에는 있는데 lib 이 아직 안 쓴다」로 빨개져서 갈아 끼우는 것을 잊을 수가 없다.
 *
 * ── ⚠️ 쓰는 법
 *    ```js
 *    const plan = await planFast(db, { studentId, on });        // routineNext 자리에 그대로
 *    // 또는 화면이 db 를 여러 군데로 넘길 때
 *    const fdb = await fastDb(db, { studentId, on });
 *    const plan = await routineNext(fdb, { studentId, on });
 *    ```
 *    ⚠️ **한 번 그리는 동안만 쓴다.** 읽은 것을 기억하고 있으므로, 저장한 뒤에는
 *       새로 만들어야 바뀐 값을 본다. 저장하는 길에는 쓰지 않는다.
 *    ⚠️ `on` 을 주면 **직렬 2단**이다. 안 주면 오늘이 언제인지 먼저 묻느라 3단이 된다.
 */
import { booksOf, cursorOf, routineOf, checksOf, afterUnits, routineNext, STOP } from "./routine.js";
/** ⚠️ 날짜를 여기서 다시 만들지 않는다 — `lib/session.js` 의 것을 부른다(원칙 1) */
import { ymd } from "./session.js";

/** 빈칸을 지운 SQL — 줄바꿈만 다른 같은 문을 같은 것으로 본다 */
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const memoKey = (sql, params) => JSON.stringify([norm(sql), params ?? []]);

/**
 * **어느 조회인가를 알아보는 표시.** SQL 을 여기 옮겨 적지 않는다(두 벌 금지) —
 * 그 문에만 있는 **짧은 표시** 하나로 가른다. 못 알아보면 옛 길로 간다.
 */
const MARK = {
  today: (s) => /select\s+v2\.today\(\)\s+as\s+d/i.test(s),
  cursor: (s) => /v2\.cursor_of\(\s*\$1::uuid\s*,\s*\$2::uuid\s*\)/i.test(s),
  chapter: (s) => /from\s+v2\.units\s+u\b/i.test(s) && /u\.chapter\s*=\s*\$4::text/i.test(s),
  parts: (s) => /from\s+v2\.progress_part\b/i.test(s),
};

// ────────────────────────────────────────────────────────────────
// 한 판에 묻는 SQL — ⚠️ 차례·거르는 조건은 옛 길과 **글자 그대로** 같아야 한다
// ────────────────────────────────────────────────────────────────

/**
 * 커서를 교재 전부 한 판에. **`v2.cursor_of` 를 부르기만 한다**(㊻ — 차례를 다시 짜지 않는다).
 * ✅ **DB 함수 `v2.cursors_of(학생, 날짜)` 로 갈아 끼웠다 (0071).**
 *    그 함수도 차례를 다시 짜지 않고 `v2.cursor_of` 를 부르기만 한다(㊻).
 * ⚠️ **날짜를 넘긴다** — 옛 길은 `v2.today()` 로만 읽어 지난 날짜 판을 열면
 *    교재가 전부 「다 끝냈다」로 떴다.
 */
const Q_CURSORS = `/* fast:cursors */
  select book_id, round, chapter, is_workbook, left_in_chapter
    from v2.cursors_of($1::uuid, $2::date)`;

/** 그 대단원의 줄 — 교재마다 따로 묻던 것을 (교재, 회독, 대단원) 짝 전부로 한 판에 */
const Q_CHAPTER = `select u.id, u.chapter, u.mid, u.sub, u.activity, u.is_workbook, u.sort,
          u.page_start, u.page_end, u.q_count, u.q_range,
          v2.unit_label(u.id, true) as label,
          p.status as prog,
          t.i as i
     from unnest($2::uuid[], $3::smallint[], $4::text[]) with ordinality as t(book_id, round, chapter, i)
     join v2.units u
       on u.book_id = t.book_id and u.state = 'active' and u.chapter = t.chapter
     left join v2.progress p
       on p.student_id = $1::uuid and p.unit_id = u.id and p.round = t.round
    order by t.i, u.sort`;

/**
 * ⚠️⚠️ **다음 자리(`afterUnits`)는 여기서 SQL 을 안 쓴다.**
 *    그 문의 차례가 곧 커서 차례(대단원 차례 → 갈래 → 줄 차례)라, 옮겨 적는 순간 **두 벌**이 된다 —
 *    `scripts/check-routine2.mjs` ⑪ 이 그것을 막고 있고(실제로 내가 걸렸다),
 *    계획 ㊻ 이 「하나만 빠져도 조용히 틀린 차례」라고 못 박은 자리다.
 *    → 대신 **`lib/routine.js` 의 `afterUnits` 그 함수를** 교재마다 부르되 **한꺼번에(같은 단에)** 부른다.
 *      왕복은 교재 수만큼 늘지만 **직렬은 한 단**이고, 차례를 아는 곳은 여전히 한 곳뿐이다.
 */

/** 조각 — 이 아이의 그 회독 것을 통째로. 어느 줄 것인지는 여기 JS 가 고른다 */
const Q_PARTS = `select unit_id, q_from, q_to, page_from, page_to, note, done_on, round as r
     from v2.progress_part
    where student_id = $1::uuid and round = any($2::smallint[])`;

/** ⚠️ 검사가 「DB 에 함수가 생겼는데 lib 이 아직 안 쓴다」를 잡는 자리 */
export const CURSORS_FN = "v2.cursors_of(uuid,date)";

/**
 * 한 판에 읽어 두고, `routineNext` 가 물으러 오면 그 자리에서 답하는 **db 흉내**.
 *
 * @param db   { query(sql, params) }
 * @param opt  { studentId, on, checks }
 * @returns    `db` 와 같은 모양 — `routineNext` 에 그대로 넘긴다
 */
export async function fastDb(db, opt = {}) {
  const studentId = opt.studentId ?? null;
  const memo = new Map();
  const seed = { today: null, cursor: null, chapter: null, parts: null };

  /** 한 판에 읽어 둔 것에서 답한다. 못 알아보면 `null` — 그러면 옛 길(DB)로 간다 */
  const serve = (sql, params = []) => {
    const s = norm(sql);
    if (seed.today && MARK.today(s)) return seed.today;
    if (seed.cursor && MARK.cursor(s)) {
      if (params[0] !== studentId) return null;
      return seed.cursor.get(String(params[1])) ?? null;
    }
    if (seed.chapter && MARK.chapter(s)) {
      if (params[0] !== studentId) return null;
      return seed.chapter.get(chKey(params[2], params[1], params[3])) ?? null;
    }
    if (seed.parts && MARK.parts(s)) {
      if (params[0] !== studentId) return null;
      const bag = seed.parts.get(String(params[1]));
      if (!bag) return null;
      const want = new Set((params[2] ?? []).map(String));
      // ⚠️ 차례는 옛 길에도 없다(`order by` 가 없는 문이다) — 쓰는 쪽이 쪽 집합으로만 본다
      return { rows: bag.filter((r) => want.has(String(r.unit_id))) };
    }
    return null;
  };

  const wrap = {
    /** 한 번 그리는 동안 **같은 문 같은 값**은 다시 안 묻는다 (그 사이 저장이 없다) */
    async query(sql, params = []) {
      const hit = serve(sql, params);
      if (hit) return hit;
      const k = memoKey(sql, params);
      if (memo.has(k)) return memo.get(k);
      const r = await db.query(sql, params);
      memo.set(k, r);
      return r;
    },
  };
  if (!studentId) return wrap;                       // 누구인지 모르면 그냥 옛 길이다

  // ── 1단 · 서로 안 기다리는 것을 **같이** 묻는다 (오늘 · 커서 · 교재 · 검사)
  const todayQ = db.query(`select v2.today() as d`, []);
  // ⚠️ `routineNext` 가 쓰는 날짜와 **글자까지 같아야** 다시 안 묻는다 — 그래서 `ymd` 를 지난다
  const on = ymd(opt.on) ?? ymd((await todayQ).rows[0]?.d);   // ⚠️ `on` 을 안 주면 여기서 한 단 는다
  const [today0, cur0, books] = await Promise.all([
    todayQ,
    db.query(Q_CURSORS, [studentId, on]),
    // ⚠️ 교재·검사는 **`lib/routine.js` 의 그 함수를 그대로 불러** 읽는다. `wrap` 을 넘기므로
    //    `routineNext` 가 같은 것을 물을 때 다시 안 묻는다 (SQL 을 여기 옮겨 적지 않는다)
    booksOf(wrap, studentId, on),
    opt.checks ? null : checksOf(wrap, studentId, on),
  ]);
  seed.today = today0;

  seed.cursor = new Map();
  for (const r of cur0.rows) {
    const { book_id, ...rest } = r;
    if (!seed.cursor.has(String(book_id))) seed.cursor.set(String(book_id), { rows: [rest] });
  }

  // ── 커서를 **`cursorOf` 그 함수로** 옮긴다 (여기서 다시 옮겨 적지 않는다). 조회는 0이다
  const asks = [];
  for (const b of books) {
    const cur = await cursorOf(wrap, studentId, b.bookId);
    asks.push({ bookId: b.bookId, cur, round: cur.round ?? b.round, byChapter: b.orderBasis === "chapter", stop: b.stopMode });
  }

  // ── 물어볼 짝을 **겹치지 않게** 모은다 (같은 교재가 두 배정으로 두 번 오는 자리가 있다)
  const chAsk = uniqBy(
    asks.filter((a) => a.cur.chapter != null && a.stop !== STOP.BOOK_OFF),
    (a) => chKey(a.bookId, a.round, a.cur.chapter));
  const rounds = [...new Set(asks.map((a) => a.round).filter((r) => r != null))];
  const areas = [...new Set(books.map((b) => b.area).filter(Boolean))];
  // ⚠️ 다음 자리는 **교재마다 따로** 물어야 한다(차례를 옮겨 적지 않으려고) — 대신 **같은 단**에서 다 묻는다.
  //    그 조회의 값은 `(학생, 교재, 회독, 대단원기준)` 넷뿐이라 **대단원을 안 본다** — 어느 자리에서
  //    물어도 같은 조회다. 그래서 `routineNext` 가 나중에 부를 때 기억해 둔 것이 그대로 쓰인다.
  //    ⚠️ 어느 자리를 예습으로 삼을지는 `afterUnits` 안의 JS 가 대단원을 보고 정한다 — 여기서 안 정한다.
  const afAsk = uniqBy(
    asks.filter((a) => a.cur.chapter != null && a.stop !== STOP.BOOK_OFF),
    (a) => afKey(a.bookId, a.round, a.byChapter));

  // ── 2단 · 서로 안 기다리는 것을 **한꺼번에** 묻는다
  const [chRes, ptRes] = await Promise.all([
    chAsk.length
      ? db.query(Q_CHAPTER, [studentId, chAsk.map((a) => a.bookId), chAsk.map((a) => a.round), chAsk.map((a) => a.cur.chapter)])
      : { rows: [] },
    rounds.length ? db.query(Q_PARTS, [studentId, rounds]) : { rows: [] },
    // 루틴도 같은 단에 — 영역이 다르게 나오면 못 맞히고, 그때는 `routineNext` 가 스스로 묻는다
    areas.length ? routineOf(wrap, studentId, areas) : null,
    // 다음 자리 — **`lib/routine.js` 의 그 함수**를 부른다. 차례를 아는 곳은 여전히 한 곳뿐이다
    ...afAsk.map((a) => afterUnits(wrap, {
      studentId, bookId: a.bookId, round: a.round,
      chapter: a.cur.chapter, isWorkbook: a.cur.isWorkbook,
      orderBasis: a.byChapter ? "chapter" : "sub",
    })),
  ]);

  seed.chapter = bucket(chAsk, chRes.rows, (a) => chKey(a.bookId, a.round, a.cur.chapter));

  seed.parts = new Map(rounds.map((r) => [String(r), []]));
  for (const r of ptRes.rows) {
    const bag = seed.parts.get(String(r.r));
    delete r.r;
    if (bag) bag.push(r);
  }

  return wrap;
}

/** `routineNext` 자리에 그대로 — 한 판에 읽고 나서 옛 길 그대로 차린다 */
export async function planFast(db, opt = {}) {
  return routineNext(await fastDb(db, opt), opt);
}

// ────────────────────────────────────────────────────────────────
// 잔손질
// ────────────────────────────────────────────────────────────────

const chKey = (bookId, round, chapter) => `${bookId}|${round}|${chapter}`;
const afKey = (bookId, round, byChapter) => `${bookId}|${round}|${byChapter === true}`;

function uniqBy(list, keyOf) {
  const seen = new Set(), out = [];
  for (const x of list) { const k = keyOf(x); if (seen.has(k)) continue; seen.add(k); out.push(x); }
  return out;
}

/** 한 판에 받은 줄을 물어본 차례(`i`)대로 나눠 담는다. ⚠️ `i` 는 지워야 옛 길과 같은 줄이 된다 */
function bucket(asks, rows, keyOf) {
  const out = new Map(asks.map((a) => [keyOf(a), { rows: [] }]));
  for (const r of rows) {
    const a = asks[Number(r.i) - 1];
    delete r.i;
    if (a) out.get(keyOf(a)).rows.push(r);
  }
  return out;
}



