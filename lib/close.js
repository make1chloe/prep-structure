/**
 * 마감 — 「닫아도 되나 · 닫으면 무엇이 올라가나 · 닫기 전에는 무엇이 안 내려가나」.
 *
 * 판단은 **여기 한 곳**. 화면(`app/`)은 받아서 그리기만 한다.
 *
 * ⚠️ 마감은 **밖으로 새는 자리**다. 접근 규칙(`supabase/migrations/0016_rls_rest.sql`의
 *    `v2.sheet_visible()`)이 `closed_at is not null` 을 요구하므로,
 *    **마감을 누르는 그 순간 그 판이 학부모·학생 화면에 통째로 보인다.**
 *    옛 앱은 이 술어가 없어 만들자마자 다 보였다 — 사고 #7, **유일하게 밖으로 샌 사고**다.
 *
 * ⚠️ 옛 판 1,954줄 중 마감한 것은 **0줄**이다 (실측 2026-09-02 · 원장님 확정).
 *    그래서 「옛 앱에서는 이랬으니」로 기댈 실측이 하나도 없다. 새 앱부터 처음 도는 길이다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 만 받는 얕은 어댑터다 (검사가 가짜를 끼운다).
 *
 * ⚠️ **진도는 여기서 안 올린다.** 마감이 `v2.progress` 에 바로 쓰던 옆문(옛 `Q_PROG_UP`)을 닫고
 *    `lib/progress.js` 의 `fromMemo()` 를 부른다 — 예습 예외 · 덮음 판정 · 지난 완료 자물쇠 ·
 *    「그날 이미 ✕ 로 찍어 둔 줄은 안 뒤집는다」가 전부 그 파일에만 있다(원칙 1).
 */
import { fromMemo, day } from "./progress.js";

/** 마감 전 아이·학부모에게 보이는 글 (계획 절 ⑮-3 · 물음 T) */
export const PREPARING = "아직 정리 중이에요";
/** 마감 뒤 정말 아무것도 없는 날 — **마감해야 이 글로 굳는다** */
export const NOTHING = "없음";
/** 달력에서 마감 안 한 날 (계획 절 ⑯ 1번). 빈 칸이면 「수업이 없던 날」과 같아 보인다 */
export const DAY_OPEN = "수업함 · 정리 중";

/**
 * ⚠️ **원장만 보는 칸.** 화면에서 숨기는 것이 아니라 **값에 아예 안 싣는다.**
 *    까닭: 접근 규칙(RLS)은 **줄 단위**라 「이 줄은 보이되 이 칸만 빼기」가 안 된다.
 *    → 칸 가리기는 **여기서만** 한다.
 * ⚠️ 이 목록에서 한 줄을 빠뜨리면 그 칸이 학부모 화면에 그대로 뜬다 (사고 #7 과 같은 모양).
 *    달력에도 안 실린다 — `sheetForFamily()` 를 지나지 않고 판 줄을 그대로 내보내면 그때 샌다.
 */
export const STAFF_ONLY = Object.freeze({
  day_sheet: Object.freeze(["staff_note"]),
  // ⚠️ `day_item.memo` 는 여기 **넣지 않는다.** 그것은 원장 메모가 아니라
  //    「교재 없이 구두로 한 날의 그날 학습」이고 **아이 화면에 그대로 붙는다**(계획 ⑨-a 4번).
});

/** 물음 코드 — 화면이 글자가 아니라 이 코드로 판단한다 */
export const ASK = Object.freeze({
  LATE_UNSENT: "late_unsent",       // ⚠️ 유일하게 **반드시 묻는** 것 (계획 물음 Q)
  QUIZ_UNSCORED: "quiz_unscored",
  ITEM_UNCHECKED: "item_unchecked",
  ITEM_NO_RANGE: "item_no_range",
  NO_COMMENT: "no_comment",
  MEMO_STREAK: "memo_streak",
  NO_ROUND: "no_round",
});

// ── 판을 읽는 문 ────────────────────────────────────────────────
const Q_SHEET = `
  select id, student_id, class_id, date, attend, closed_at, closed_by, sent_at, comment, staff_note
    from v2.day_sheet where id = $1`;

// ⚠️ **교재는 저장돼 있지 않다.** day_item.book_id 는 0052 에서 지웠다 —
//    단원에서 세어 나오는 값이라 두면 unit_id 와 두 벌이 된다(원칙 1).
const Q_ITEMS = `
  select i.id, i.slot, i.item_id, u.book_id, i.unit_id, i.range_note, i.status, i.done_note, i.memo, i.sort,
         b.name as book_name, u.chapter as unit_chapter, u.sub as unit_sub, u.activity as unit_activity,
         v2.unit_label(i.unit_id) as unit_label
    from v2.day_item i
    left join v2.units u on u.id = i.unit_id
    left join v2.books b on b.id = u.book_id
   where i.sheet_id = $1
   order by i.sort`;

const Q_LATE = `
  select id, reason, until_at, sent_at from v2.late_stay where sheet_id = $1`;
// ⚠️ 실제 하원(옛 `left_at`)은 **여기 없다** — v2.arrival 걸음 4 하나뿐이다(0083, 원칙-1).
//    이 자리는 sent_at 만 본다(「안 보낸 늦귀가」). 하원을 보려면 arrival 을 읽어야 한다.

// 「이 판에서 **본** 시험」 — 낸 날과 본 날이 다르다 (0038)
// ⚠️ **맞은 개수는 저장하지 않는다.** 0039 에서 correct 를 지우고 wrong(틀린 개수)으로 바꿨다 —
//    「내신 대비 단어는 매번 갯수가 달라서 틀린 갯수·전체 갯수를 쓴다」(원장님).
const Q_QUIZ = `
  select id, kind, state, total, wrong, cut_pct from v2.quiz where taken_sheet_id = $1`;

// 회독은 **저장하지 않는 값이 아니다** — 배정 줄에 있다. 없으면 진도를 못 올린다
const Q_ROUND = `
  select book_id, round, from_date from v2.student_book
   where student_id = $1 and book_id = any($2::uuid[])
     and from_date <= $3 and (to_date is null or to_date >= $3)
   order by from_date desc`;

// 「이 교재, 3회 연속 메모로만 갔습니다」 — **앱이 센다**(대전제 3). 부르기만 하고 막지 않는다
const Q_STREAK = `
  select s.date, u.book_id, bool_and(coalesce(btrim(i.memo),'') <> '') as memo_only
    from v2.day_sheet s
    join v2.day_item i on i.sheet_id = s.id
    join v2.units u on u.id = i.unit_id
   where s.student_id = $1 and u.book_id = any($2::uuid[]) and s.date <= $3
   group by s.date, u.book_id
   order by s.date desc
   limit 60`;

// ── 판을 쓰는 문 ────────────────────────────────────────────────
// ⚠️⚠️ 여기 있던 `Q_PROG_UP` 은 **진도로 바로 들어가는 옆문**이었다 — 예습 예외도, 덮음 판정도,
//      지난 완료 자물쇠도, 「이미 ✕ 로 찍은 줄」도 안 지나고 `status='done'` 을 박았다.
//      → `lib/progress.js` 의 `fromMemo()` 로 갈아탔다. **여기에 진도 쓰는 SQL 을 다시 두지 마라.**
//      마감이 올릴 묶음은 「메모를 단 그 교재의, 예습이 아닌 줄」이다
const MEMO_SLOTS = ["class", "home", "check"];

// ⚠️ `and closed_at is null` — 폰과 PC 에서 같이 눌러도 **한 번만** 마감된다.
//    0줄로 돌아오면 실패다 (계획 자동 검사 ⑪ — 0줄인데 화면이 「성공」이라 말하면 안 된다)
const Q_CLOSE = `
  update v2.day_sheet set closed_at = coalesce($2::timestamptz, now()), closed_by = $3
   where id = $1 and closed_at is null
   returning id, closed_at`;

// ⚠️ **판을 지우지 않는다**(사고 #8 — 옛 앱은 되돌리면 판째로 지워 발송 자취가 같이 사라졌다).
//    `sent_at` 도 안 건드린다 — 지우면 「보냈나」를 영영 모른다 (사고 #21·#27 과 같은 병).
const Q_REOPEN = `
  update v2.day_sheet set closed_at = null, closed_by = null
   where id = $1 and closed_at is not null
   returning id, sent_at`;

// ── 마감 전 가리기 ──────────────────────────────────────────────

const has = (v) => String(v ?? "").trim() !== "";

/** 칸을 통째로 뺀다 — `null` 로 두지 않고 **키 자체를 없앤다**. 있으면 언젠가 그려진다 */
function drop(row, cols) {
  const out = {};
  for (const k of Object.keys(row)) if (!cols.includes(k)) out[k] = row[k];
  return out;
}

/**
 * 아이·학부모에게 내려보낼 판 값. **이 문을 안 지나면 새는 것으로 본다.**
 *
 * @param sheet  v2.day_sheet 한 줄
 * @param role   'staff' | 'parent' | 'student'
 * @returns 원장이면 그대로. 아이·학부모면 마감 전에는 **내용 칸이 아예 없는** 값
 */
export function sheetForFamily(sheet, { role = "parent" } = {}) {
  if (!sheet) return null;
  if (role === "staff") return sheet;                   // 원장은 마감 전에도 다 본다

  // ⚠️ 마감 전 — 내용(`comment`)을 **싣지 않는다.** null 로도 안 싣는다.
  //    달력이 「수업함 · 정리 중」을 그리는 데 필요한 최소값(날짜·출결)만 남긴다(절 ⑯ 1번).
  if (!sheet.closed_at) {
    return {
      id: sheet.id, student_id: sheet.student_id, date: sheet.date, attend: sheet.attend,
      closed_at: null, visible: false, state: "preparing", label: PREPARING, dayLabel: DAY_OPEN,
    };
  }
  // 마감 뒤 — 원장 메모만 뺀다
  const out = drop(sheet, STAFF_ONLY.day_sheet);
  return { ...out, visible: true, state: "closed", label: null, dayLabel: null };
}

/**
 * 아이·학부모에게 내려보낼 판 안의 줄.
 * ⚠️ 마감 전에는 **빈 배열**이다 — 「숨긴 것」이 아니라 값에 안 실린 것이다.
 */
export function itemsForFamily(items, sheet, { role = "parent" } = {}) {
  if (role === "staff") return items ?? [];
  if (!sheet?.closed_at) return [];
  return items ?? [];
}

/** 그날 카드에 붙일 글 — 마감 전 「아직 정리 중이에요」 · 마감 뒤 빈 날 「없음」 */
export function familyDayLabel(sheet, { hasContent = false } = {}) {
  if (!sheet?.closed_at) return PREPARING;
  return hasContent ? null : NOTHING;
}

/**
 * 빈 카드를 숨기나 — **아이·학부모 화면에서만** 숨긴다 (계획 물음 T).
 * ⚠️ 원장 화면에서는 빈 것도 그대로 보인다. 「이 아이 오늘 숙제 0개」가 남아 있어야
 *    **빠뜨린 것**을 잡는다. 원장 화면에서 숨기면 빠뜨린 날과 없는 날이 같아 보인다.
 */
export function hideEmptyCards(role) {
  return role !== "staff";
}

// ── 마감할 수 있나 ──────────────────────────────────────────────

const ask = (code, what, why, must = false, extra = {}) => ({ code, what, why, must, ...extra });

function unitLabel(it) {
  const t = [it.unit_chapter, it.unit_sub].filter(has).join(" › ");
  return has(it.unit_activity) ? (t ? `${t} · ${it.unit_activity}` : it.unit_activity) : t;
}

/**
 * 마감 조건 — **막지 않는다. 묻는다.**
 * 조건이 안 찬 것을 목록으로 내고, 그중 `must:true` 인 것만 마감이 확인을 요구한다.
 *
 * @returns { ok, sheet, asks:[{code,what,why,must,...}], mustAsk:[코드], preview }
 */
export async function closeGate(db, sheetId) {
  const sheet = (await db.query(Q_SHEET, [sheetId])).rows[0];
  if (!sheet) return { ok: false, why: "no_sheet", sheet: null, asks: [], mustAsk: [], preview: null };

  const items = (await db.query(Q_ITEMS, [sheetId])).rows;
  const late = (await db.query(Q_LATE, [sheetId])).rows;
  const quiz = (await db.query(Q_QUIZ, [sheetId])).rows;

  const asks = [];

  // ⚠️ ① 늦귀가를 **안 보낸 채로 마감하려 하면 한 번 묻는다** (계획 ⑭ · 물음 Q).
  //    안 물으면 배정만 하고 안 보낸 채 판이 닫히고, **학부모는 모른 채 기다린다.**
  const lateUnsent = late.filter((l) => !l.sent_at);
  if (lateUnsent.length)
    asks.push(ask(ASK.LATE_UNSENT, `늦귀가 ${lateUnsent.length}건을 아직 안 보냈습니다`,
      "안 보내고 마감하면 학부모는 모른 채 기다립니다", true,
      { n: lateUnsent.length, ids: lateUnsent.map((l) => l.id) }));

  // ② 이 판에서 본 시험인데 채점이 안 됐다
  // ⚠️ 여기가 `q.correct == null` 이었다. 그 칸은 **없으므로 늘 undefined** 라
  //    완벽히 채점된 시험도 「채점 안 함」으로 떴다. 오류도 안 나고 물음만 늘었다.
  //    채점됐다 = **틀린 개수와 전체 개수가 둘 다 있다** (없으면 리포트에도 안 나간다 · 원장님 확정)
  const unscored = quiz.filter((q) => q.state !== "skipped" && (q.wrong == null || q.total == null));
  if (unscored.length)
    asks.push(ask(ASK.QUIZ_UNSCORED, `채점 안 한 시험 ${unscored.length}건`,
      "마감하면 이 판이 학부모·아이에게 보입니다 — 점수 없이 보입니다", false,
      { n: unscored.length, ids: unscored.map((q) => q.id) }));

  // ③ 검사(집에서 해온 것)를 안 찍은 줄
  const unchecked = items.filter((i) => i.slot === "check" && (i.status == null || i.status === "none"));
  if (unchecked.length)
    asks.push(ask(ASK.ITEM_UNCHECKED, `안 찍은 검사 ${unchecked.length}줄`,
      "○△✕ 가 비면 진도도 안 올라갑니다", false, { n: unchecked.length }));

  // ④ 범위 없는 숙제 — 단원도 범위 메모도 없으면 아이는 무엇을 할지 모른다
  const noRange = items.filter((i) => (i.slot === "home" || i.slot === "next")
    && !i.unit_id && !has(i.range_note) && !has(i.memo));
  if (noRange.length)
    asks.push(ask(ASK.ITEM_NO_RANGE, `범위 없는 숙제 ${noRange.length}줄`,
      "아이 화면에 제목만 뜨고 무엇을 할지 안 보입니다", false, { n: noRange.length }));

  // ⑤ 부모님께 나갈 글이 비었다 — 마감하면 「그날 수업 내용 전문」이 그 자리다
  if (!has(sheet.comment))
    asks.push(ask(ASK.NO_COMMENT, "부모님께 나갈 글이 비었습니다",
      "마감하면 학부모 화면에 그 자리가 빈 채로 뜹니다", false));

  const preview = await previewClose(db, sheet, items, asks);

  const mustAsk = asks.filter((a) => a.must).map((a) => a.code);
  return { ok: true, sheet, asks, mustAsk, preview };
}

/**
 * 마감하면 무엇이 올라가나 — **누르기 전에** 보여준다 (계획 ㊳).
 * 마감은 되돌릴 수 없는 자리라 낙관적 갱신을 안 쓰는 셋 중 하나다.
 */
async function previewClose(db, sheet, items, asks) {
  // ⚠️⚠️ **여기가 새면 그날 판의 모든 교재가 통째로 ○ 가 된다.**
  //    오류도 안 나고 진도율은 오히려 좋아 보여 아무도 못 알아챈다 (계획 자동 검사 ⑭).
  //    → 메모가 달린 **그 교재**만 고른다. `book_id` 로 묶는 이 한 줄이 방벽이다.
  const memoBooks = [...new Set(items.filter((i) => i.book_id && has(i.memo)).map((i) => i.book_id))];

  const byBook = [];
  let round = new Map();
  if (memoBooks.length) {
    const rows = (await db.query(Q_ROUND, [sheet.student_id, memoBooks, sheet.date])).rows;
    for (const r of rows) if (!round.has(r.book_id)) round.set(r.book_id, r.round);  // from_date 내림차순 → 첫 줄이 지금 것
  }

  for (const b of memoBooks) {
    // ⚠️ `slot='next'`(예습)는 완료로 안 올린다 — 안 그러면 **수업 안 한 단원이 완료로 찍힌다**
    //    (0011 `day_item.slot` 주석 · 계획 자동 검사 ⑭).
    const rows = items.filter((i) => i.book_id === b && i.unit_id && i.slot !== "next");
    const units = [...new Map(rows.map((i) => [i.unit_id, { unit_id: i.unit_id, label: unitLabel(i) }])).values()];
    const memo = items.find((i) => i.book_id === b && has(i.memo))?.memo ?? null;
    const name = items.find((i) => i.book_id === b)?.book_name ?? null;
    const r = round.get(b) ?? null;

    // ⚠️ 회독을 모르면 **진도를 안 올린다.** 1 로 지어내면 2회독 아이의 1회독이 통째로 ○ 가 된다
    if (r == null && units.length)
      asks.push(ask(ASK.NO_ROUND, `${name ?? "교재"} — 배정 줄이 없어 회독을 모릅니다`,
        "회독을 모르면 진도를 안 올립니다 (지어내면 엉뚱한 회독이 ○ 가 됩니다)", false, { book_id: b }));

    byBook.push({ book_id: b, book_name: name, memo, round: r, units, willRaise: r != null && units.length > 0 });
  }

  // 3회 연속 메모로만 갔나 — **부르기만 하고 막지 않는다.** 정말 그런 달이 있다
  if (memoBooks.length) {
    const rows = (await db.query(Q_STREAK, [sheet.student_id, memoBooks, sheet.date])).rows;
    for (const b of memoBooks) {
      let n = 0;
      for (const r of rows.filter((x) => x.book_id === b)) { if (r.memo_only) n++; else break; }
      if (n >= 3) {
        const name = byBook.find((x) => x.book_id === b)?.book_name ?? "이 교재";
        asks.push(ask(ASK.MEMO_STREAK, `${name}, ${n}회 연속 메모로만 갔습니다`,
          "메모가 습관이 되면 진도가 실제보다 앞섭니다 — 막지는 않습니다", false, { book_id: b, n }));
      }
    }
  }

  const raise = byBook.filter((x) => x.willRaise);
  return {
    // 「이대로 마감하면 PSS 1-4 · 1-5 가 ○ 로 올라갑니다」
    autoDone: raise,
    unitCount: raise.reduce((s, x) => s + x.units.length, 0),
    // ⚠️ 마감하는 순간 접근 규칙이 열린다 — 이것도 누르기 전에 보여준다
    reachesFamily: ["그날 수업 내용 전문", "숙제·예습 줄", "이 판에서 본 시험", "늦귀가"],
    stamp: stampOf(raise),
  };
}

/** 미리보기 지문 — 보여준 것과 실제로 올릴 것이 같은지 대조한다 */
function stampOf(byBook) {
  return byBook
    .map((b) => `${b.book_id}@${b.round}:${b.units.map((u) => u.unit_id).sort().join(",")}`)
    .sort().join("|");
}

// ── 마감한다 ────────────────────────────────────────────────────

/**
 * 마감. **되돌릴 수 없는 자리라 서버 답을 기다린다** (낙관적 갱신을 안 쓴다).
 *
 * @param opts.by       마감한 사람 profile id
 * @param opts.confirm  물음 코드 배열. `must` 인 물음은 여기 들어와야 마감한다
 * @param opts.expect   `closeGate().preview.stamp` — 보여준 뒤 판이 바뀌었으면 멈춘다
 * @param opts.tx       기본 true. ⚠️ 어댑터가 트랜잭션을 못 하면 false 로 부르되,
 *                      그때는 **마감과 진도가 따로 간다** (한쪽만 되는 창이 생긴다)
 */
export async function closeSheet(db, sheetId, { by = null, confirm = [], expect = null, now = null, tx = true } = {}) {
  const gate = await closeGate(db, sheetId);
  if (!gate.ok) return { ok: false, why: gate.why, gate };
  if (gate.sheet.closed_at) return { ok: false, why: "already_closed", gate };

  // ⚠️ 안 물으면 여기서 멈춘다. 늦귀가가 그 자리다
  const need = gate.mustAsk.filter((c) => !confirm.includes(c));
  if (need.length) return { ok: false, why: "ask", need, gate };

  // ⚠️ 누르기 전에 보여준 것과 지금이 다르면 멈춘다 —
  //    다른 창에서 회차를 고쳐 두면 **엉뚱한 단원이 ○ 로 굳는다**
  if (expect != null && expect !== gate.preview.stamp)
    return { ok: false, why: "changed", expect, now: gate.preview.stamp, gate };

  if (tx) await db.query("begin");
  try {
    // ① 마감 먼저. 0줄이면 누가 먼저 눌렀다는 뜻이라 **진도를 안 올린다**
    const closed = (await db.query(Q_CLOSE, [sheetId, now, by])).rows;
    if (closed.length !== 1) {
      if (tx) await db.query("rollback");
      return { ok: false, why: "no_rows", gate };   // 계획 자동 검사 ⑪ — 0줄은 실패다
    }

    // ② 메모 자동완료 — **그 교재만**, 교재마다 그 아이의 그 회독으로.
    // ⚠️ 올리는 판단은 전부 `lib/progress.js` 가 한다. 여기서는 부르고 받아 적기만 한다
    const done = [];
    for (const b of gate.preview.autoDone) {
      const r = await fromMemo(db,
        { studentId: gate.sheet.student_id, on: day(gate.sheet.date), bookId: b.book_id, by: "staff" },
        { tx: false, slots: MEMO_SLOTS });
      if (r.ok !== true) {   // 화면이 바뀐 뒤였다·날짜가 없다 같은 진짜 실패 — 마감째 되돌린다
        if (tx) await db.query("rollback");
        return { ok: false, why: "progress_failed", book_id: b.book_id, said: r.why, gate };
      }
      // ⚠️ 미리보기와 실제가 갈릴 수 있다 — 덜 덮은 배정은 ◐ 에서 서고, 이미 ✕ 로 찍은 줄은
      //    안 뒤집는다. **막지 않고 그대로 돌려준다**(원장님이 마감 뒤 화면에서 본다)
      done.push({ book_id: b.book_id, book_name: b.book_name, round: b.round, units: b.units,
                  raised: r.applied, kept: r.kept ?? [], skipped: r.skipped ?? [] });
    }
    if (tx) await db.query("commit");
    return { ok: true, closedAt: closed[0].closed_at, autoDone: done, asked: gate.asks };
  } catch (e) {
    if (tx) await db.query("rollback");
    throw e;
  }
}

/**
 * 마감 되돌리기.
 * ⚠️ **판을 지우지 않는다** (사고 #8). `closed_at` 만 내린다 —
 *    지우면 그 판에 매달린 발송 자취·아이가 낸 것이 같이 사라진다.
 * ⚠️ `sent_at` 도 안 건드린다 — 「보냈나」를 영영 모르게 된다.
 * ⚠️ 메모 자동완료로 올라간 진도는 **자동으로 안 내린다.** 진도판에서 ◐·✕ 로 내린다(㊳).
 *    자동으로 내리면 그 사이 원장님이 손으로 고친 진도까지 같이 지운다.
 */
export async function reopenSheet(db, sheetId, { by = null } = {}) {
  const r = (await db.query(Q_REOPEN, [sheetId])).rows;
  if (r.length !== 1) return { ok: false, why: "not_closed" };   // 0줄은 실패다 (자동 검사 ⑪)
  return { ok: true, id: r[0].id, sentAt: r[0].sent_at, keptRow: true, by };
}
