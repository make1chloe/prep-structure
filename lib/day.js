/**
 * 판 굳히기 — **차려 준 초안을 그날 판에 줄로 세운다.**
 *
 * 지금까지 `insert into v2.day_item` 이 **저장소 어디에도 없었다**(실측 2026-09-02).
 * 그래서 오늘 화면이 차려 준 ②오늘 학습·③오늘 숙제가 **아무 데도 안 남고**,
 * 검사(○△✕)도 진도도 발송도 그 줄을 못 찾아 하루 동선이 거기서 끊겼다.
 * 이 파일이 그 한 자리다 — **판에 줄을 세우는 곳은 여기 하나뿐이다.**
 *
 * ── ⚠️ 여기서 **안 하는 것** (남의 몫이다 — 두 벌로 만들면 그날부터 어긋난다)
 *    · 무엇을 낼지 **정하는 것** → `lib/routine.js` 의 `routineNext()`.
 *      **초안을 다시 계산하지 않는다. 받아서 적기만 한다**(원칙 1).
 *      그래서 이 파일에는 커서도 회독도 덩어리도 분량도 없다 — 한 글자도 없다.
 *    · 그날 판(day_sheet)을 **세우는 것** → `lib/attend.js` 의 `attendanceWrite()`.
 *      직접 insert 하지 않는다. 「출결을 어디서 찍든 그날 판이 선다」가 그 한 벌이다.
 *      여기서는 **출결 칸을 안 만진다** — 판이 이미 서 있으면 그 판을 쓸 뿐이다.
 *    · 검사 ○△✕ → 진도 → `lib/progress.js` 의 `fromCheck()`. 여기는 `status` 를 안 쓴다
 *      (새로 서는 줄은 DB 기본값 'none' 으로 선다 — 그 값을 여기 또 적지 않는다).
 *    · 마감·가리기 → `lib/close.js`. 발송 → `lib/notify.js`.
 *    · **어제 낸 숙제를 오늘 `slot='check'` 로 옮겨 오는 일** → ⚠️ **확인 안 됨.**
 *      `routineNext` 는 `class·home·next` 셋만 차린다(그 파일 주석 — 「`check` 는 어제 낸 숙제다」).
 *      그 한 벌이 계획 어디에도 안 적혀 있어 **지어내지 않았다.** 여기는 초안이 준 셋만 굳힌다.
 *
 * ── 열쇠와 「두 번 눌러도 같은 결과」
 *    `day_item_one_per_slot` = UNIQUE **NULLS NOT DISTINCT** (sheet_id, slot, item_id, unit_id).
 *    NULLS NOT DISTINCT 라서 「항목 없는 메모 줄」끼리도 같은 줄로 본다 —
 *    그래서 `on conflict` 한 번으로 **두 번 눌러도 줄이 안 늘어난다.**
 *
 * ── ⚠️⚠️ **다시 굳힐 때 아이가 낸 것을 지우지 않는다**
 *    계획: 「아이가 낸 것은 배정 줄을 지웠다 다시 넣어도 절대 같이 지우지 않는다」.
 *    지키는 길 둘 —
 *      ① **줄을 지우지 않는다.** 이번 초안에 없는 줄도 그대로 둔다(대전제 6). `extra` 로 돌려준다.
 *         지우면 그 줄에 붙은 아이 사진(`v2.file_link.day_item_id`)이 같이 끊긴다.
 *      ② **이미 검사가 찍힌 줄(`status <> 'none'`)은 한 칸도 안 건드린다.**
 *         `on conflict … do update … where day_item.status = 'none' and day_item.said_done_at is null` 이 그 자리다.
 *         빠뜨리면 오후에 다시 굳히는 순간 오전에 찍은 ○△✕ 가 조용히 지워진다.
 *
 * ── ⚠️ **범위(단원)가 빈 숙제는 여기서 거절한다** (계획 「넷째 길목」)
 *    지금 앱은 판을 접었다 펴면 항목만 되살아나고 범위가 사라지는데 **서버가 안 막아
 *    범위 없는 숙제가 실제로 나갔다.** 아이는 「무엇을」 모르는 숙제를 받는다.
 *    → 한 줄이라도 그러면 **아무것도 안 쓴다.** 부분 저장이 더 나쁘다.
 *
 * ── ⚠️ **몇 줄이 실제로 바뀌었는지 본다. 0줄이면 실패다** (자동 검사 ⑪)
 *    다만 「바뀔 줄이 애초에 없었다」(전부 이미 검사가 찍혀 있다)와 「막혀서 0줄」은 **다르다.**
 *    앞의 것은 성공이고 뒤의 것은 실패다 — 섞으면 접근 규칙이 막았는데 화면이 「저장됨」이라 말한다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 를 받는 얕은 어댑터다 (pg 든 supabase 든).
 * ⚠️ SQL 안에 `${…}` 를 끼우지 않는다 — 끼우면 이 글자를 그대로 DB 에 물어볼 수가 없어
 *    `scripts/check-sql.mjs` 가 「칸 이름이 진짜 있나」를 못 본다. 값은 전부 $1·$2 로 넘긴다.
 */
import { SLOTS as DRAFT_SLOTS } from "./routine.js";
import { dayView, attendanceWrite, keyOf } from "./attend.js";

/**
 * `v2.day_item.slot` 이 받는 넷 (0011).
 * ⚠️ 셋(`class·home·next`)은 **`lib/routine.js` 의 목록을 그대로 쓴다** — 여기 다시 안 적는다(원칙 1).
 *    `check` 만 여기 것이다 — 초안이 안 차리는 자리라 저 목록에 없다.
 */
export const DAY_SLOTS = Object.freeze(["check", ...DRAFT_SLOTS]);

/** 「숙제」인 자리 — 집에서 하는 것. **범위(단원)가 없으면 거절하는 자리**가 이 둘이다 */
export const HW_SLOTS = Object.freeze(["home", "next"]);

/**
 * 판 위에서 한 줄을 가리키는 열쇠. **`day_item_one_per_slot` 과 같은 넷**이다
 * (sheet_id 는 판마다 하나라 여기서는 뺀다).
 * ⚠️ 이 셈을 화면에서 또 만들지 마라 — 열쇠가 두 벌이 되면 「새로 섰나 그대로였나」가 갈린다.
 */
export const rowKey = (r = {}) =>
  [r.slot, r.itemId ?? r.item_id ?? "", r.unitId ?? r.unit_id ?? ""].join("|");

// ── SQL — 앞머리 주석(/* day:… */)은 **가짜 DB 가 붙잡는 손잡이**다. 지우지 마라 ──────────

const SQL_EXIST = `/* day:exist */
select id, slot, item_id, unit_id, range_note, memo, status, sort
  from v2.day_item
 where sheet_id = $1::uuid
 order by slot, sort, id`;

/**
 * 굳히는 단 한 문.
 *
 * ⚠️ `coalesce(excluded.…, day_item.…)` — **비운 값으로 덮지 않는다**(대전제 6).
 *    초안은 「통째로 낼 때」 범위를 안 적는다(`rangeNote = null`). 그것으로 덮으면
 *    원장님이 손으로 적어 둔 「17번만」이 다시 굳히는 순간 사라진다.
 * ⚠️ `where day_item.status = 'none' and said_done_at is null` — **이미 찍힌 줄과
 *    아이가 「다 했어요」로 누른 줄은 안 건드린다.** 뒤엣것을 안 넣으면, 아이가 「1-10쪽 다 했어요」를
 *    누른 뒤 오후에 다시 굳힐 때 그 줄의 범위가 「11-20쪽」으로 바뀐다 — **아이는 안 한 것을
 *    했다고 말한 꼴**이 되고 아무도 못 알아챈다 (계획 「아이가 낸 것은 … 절대 같이 지우지 않는다」).
 *    걸린 줄은 오류 없이 그냥 안 바뀌고 `returning` 에도 안 온다 — 그래서 세면 「그대로 둔 줄」이 나온다.
 * ⚠️ `updated_at` 을 안 적는다 — `day_item_touch` 트리거가 이미 넣는다(0011). 두 벌로 적지 않는다.
 * ⚠️ `status` 를 안 적는다 — 새 줄은 DB 기본값 'none' 으로 선다(0052).
 */
const SQL_FREEZE = `/* day:freeze */
insert into v2.day_item (sheet_id, slot, item_id, unit_id, range_note, memo, sort)
select $1::uuid, x.slot, x.item_id, x.unit_id, x.range_note, x.memo, x.sort
  from unnest($2::text[], $3::uuid[], $4::uuid[], $5::text[], $6::text[], $7::int[])
    as x(slot, item_id, unit_id, range_note, memo, sort)
on conflict on constraint day_item_one_per_slot do update
   set range_note = coalesce(excluded.range_note, day_item.range_note),
       memo       = coalesce(excluded.memo, day_item.memo),
       sort       = excluded.sort
 where day_item.status = 'none' and day_item.said_done_at is null
returning id, slot, item_id, unit_id, range_note, memo, sort, status`;

// ── ① 초안 → 굳힐 줄 (순수 함수 — 검사가 DB 없이 그대로 부른다) ──────────────────────

/**
 * 초안(`routineNext()` 가 준 것)을 **판에 세울 줄 목록**으로 편다.
 * **여기서 무엇을 낼지 다시 정하지 않는다** — 카드가 이미 정해 준 것을 옮겨 적을 뿐이다.
 *
 * @returns { rows, merged, empty, bad }
 *   · `rows`   굳힐 줄 (열쇠가 겹친 것은 접었다)
 *   · `merged` 열쇠가 같아 접은 줄 — **조용히 접지 않고 세어서 돌려준다**
 *   · `empty`  한 줄도 안 나온 교재 + 카드가 적어 준 까닭(`why`)
 *   · `bad`    ⚠️ 범위(단원)가 빈 숙제 — 하나라도 있으면 **아무것도 안 쓴다**
 *
 * ⚠️ `sort` 는 **묶음마다 0부터** 센다(`day_item` 색인이 (sheet_id, slot, sort)다).
 *    교재 차례 → 카드 안 차례 그대로라, **두 번 눌러도 같은 숫자**가 나온다.
 */
export function rowsOf(plan = {}) {
  const rows = [], merged = [], empty = [], bad = [];
  const seen = new Map();
  const n = Object.fromEntries(DAY_SLOTS.map((s) => [s, 0]));

  for (const b of plan.books ?? []) {
    let mine = 0;
    for (const slot of DRAFT_SLOTS) {
      for (const d of b[slot] ?? []) {
       // ⚠️⚠️ **한 줄이 단원 여럿을 덮는다.** 갯수를 3개로 올리면 `unitIds` 에 셋이 온다.
       //    `unitId`(첫 하나)만 적으면 **둘째부터가 판에 한 줄도 안 남고 조용히 사라진다** —
       //    아이는 그 단원 숙제를 못 받고, 진도도 안 올라가며, 오류도 안 난다.
       //    진도는 **소단원마다** 붙으므로 단원마다 한 줄이 맞다(열쇠에 unit_id 가 들어 있다).
       const units = (Array.isArray(d.unitIds) && d.unitIds.length) ? d.unitIds
                   : (d.unitId ? [d.unitId] : [null]);
       for (const u of units) {
        const one = {
          slot,
          itemId: d.itemId ?? null,
          unitId: u ?? null,
          rangeNote: d.rangeNote ?? null,
          memo: d.memo ?? null,
          // 아래 넷은 **저장하지 않는다** — 화면에 「무엇이 섰나」를 보여주려고 들고 갈 뿐이다.
          // (교재·이름·단원 이름은 unit_id 에서 세어 나온다 — 원칙 5)
          bookId: b.bookId ?? null,
          bookName: b.name ?? null,
          name: d.name ?? null,
          label: d.label ?? null,
          byMemo: d.byMemo === true,
        };

        // ⚠️ **넷째 길목** — 범위(단원)가 빈 숙제는 여기서 걸러 낸다.
        //    막지 않으면 아이가 「무엇을」 모르는 숙제를 받고, 오류는 안 난다.
        if (HW_SLOTS.includes(slot) && !one.unitId) { bad.push(one); continue; }

        const k = rowKey(one);
        if (seen.has(k)) { merged.push({ ...one, sameAs: seen.get(k) }); continue; }
        one.sort = n[slot]++;
        seen.set(k, one);
        rows.push(one);
        mine++;
       }               // ← 단원 목록 한 바퀴
      }
    }
    // ⚠️ **조용히 0줄로 비우지 않는다** — 왜 비었는지는 카드가 이미 적어 뒀다(`b.why`)
    if (!mine) empty.push({ bookId: b.bookId ?? null, name: b.name ?? null, why: b.why ?? null });
  }
  return { rows, merged, empty, bad };
}

// ── ② 굳히는 단 한 벌 ────────────────────────────────────────────────────────────

/**
 * **초안을 판으로 굳힌다.**
 *
 * @param plan  `routineNext()` 가 준 그대로. **여기서 다시 부르지 않는다**(원칙 1).
 * @param opts  { classId(널 허용, **생략 금지**), attend?, tx?, dryRun? }
 * @returns { ok, why, msg, sheetId, key, sheetMade,
 *            planned, expected, changed,
 *            stood, again, kept, extra, merged, empty, bad, notes, warn }
 *
 *   · `stood` **이번에 새로 선 줄** · `again` 이미 있던 줄을 다시 적은 것
 *   · `kept`  ⚠️ **검사가 찍혀 있어 안 건드린 줄** · `extra` 판에 있는데 이번 초안엔 없는 줄(**안 지운다**)
 *
 * ⚠️ `classId` 를 빼먹으면 `keyOf` 가 거절한다 — 반이 없으면 `classId: null` 이라고 **적어라.**
 *    빠뜨린 채로 두면 특강 판이 정규 판을 덮는다(`lib/attend.js` 에 이미 난 사고로 적혀 있다).
 * ⚠️ `opts.tx !== true` 면 **되돌리지 못한다.** 되돌린 척은 안 한다 — `warn` 에 적어 돌려준다.
 */
export async function freezeDay(db, plan = {}, opts = {}) {
  if (!plan || typeof plan !== "object") throw new Error("굳힐 초안이 없다");
  if (!plan.studentId) {
    throw new Error("초안에 학생이 없다 — `routineNext()` 가 준 것을 그대로 넘겨라 (여기서 다시 차리지 않는다)");
  }
  // ⚠️ 날짜·반 확인은 `lib/attend.js` 의 `keyOf` 한 곳에 있다. 여기서 또 세지 않는다
  const one = { studentId: plan.studentId, date: plan.date };
  if ("classId" in opts) one.classId = opts.classId;
  const key = keyOf(one);

  const { rows, merged, empty, bad } = rowsOf(plan);
  const notes = [];
  if (plan.stale) {
    notes.push(`⚠️ 지난 날짜(${plan.date}) 초안입니다 — 「지금 어디」는 오늘(${plan.asOf}) 기준이라 ` +
      "그날 것과 다를 수 있습니다");
  }
  if (merged.length) {
    notes.push(`같은 자리에 겹친 줄 ${merged.length}개를 하나로 접었습니다 — ` +
      "같은 묶음·같은 항목·같은 단원은 판에서 한 줄입니다");
  }
  for (const e of empty) if (e.why) notes.push(`${e.name ?? "교재"} — ${e.why}`);

  const base = { key, planned: rows.length, merged, empty, bad, notes,
                 stood: [], again: [], kept: [], extra: [], expected: 0, changed: 0,
                 sheetId: null, sheetMade: false };

  // ── ⚠️ 넷째 길목 — 범위(단원)가 빈 숙제. **한 줄도 안 쓰고 여기서 되돌린다**
  if (bad.length) {
    return { ...base, ok: false, why: "no_range",
      msg: `숙제 ${bad.length}줄에 **범위(단원)가 없습니다** — 판을 접었다 펴면 항목만 되살아나고 ` +
        "범위가 사라집니다. 범위 없는 숙제는 아이가 「무엇을」 모른 채 받으므로 저장하지 않았습니다 " +
        "(한 줄도 안 썼습니다). 단원을 다시 고르고 눌러 주세요" };
  }
  // ⚠️ 굳힐 줄이 없으면 **판도 안 세운다** — 세우면 출결이 안 찍힌 아이가 왔다고 서 버린다
  if (!rows.length) {
    return { ...base, ok: false, why: "empty",
      msg: "굳힐 줄이 하나도 없습니다 — 판을 세우지 않았습니다. 왜 비었는지는 아래에 적었습니다" };
  }

  const tx = opts.tx === true;
  const undo = async () => { if (tx) await db.query("rollback"); };
  const noUndo = tx ? null
    : "⚠️ 되돌리지 못했다 — `opts.tx` 가 아니라 **앞줄은 이미 들어갔다.** 부르는 쪽이 되돌려야 한다";

  if (tx) await db.query("begin");
  try {
    // ── ⓐ 판이 없으면 **먼저 세운다** — 직접 insert 하지 않는다
    let sheetId = null, sheetMade = false;
    const view = await dayView(db, { studentId: key.studentId, date: key.date });
    const there = (view.rows ?? []).find((r) => (r.classId ?? null) === key.classId) ?? null;

    if (there) {
      // ⚠️ 마감한 판에는 줄을 안 세운다 — **학부모가 이미 본 것**이다(`closeGate` 가 되무는 자리다)
      if (there.closedAt) {
        await undo();
        return { ...base, ok: false, why: "closed", sheetId: there.sheetId,
          msg: "이미 마감한 판입니다 — 학부모가 본 뒤라 줄을 안 세웁니다. 마감을 먼저 무르세요" };
      }
      sheetId = there.sheetId;
    } else if (opts.dryRun === true) {
      // ⚠️ **미리보기는 아무것도 안 만든다.** 판을 세우는 것은 「왔다」를 찍는 일이라
      //    되돌릴 수 없는 자리다(`opts.tx` 가 아니면 더더욱). 세우면 어떻게 되는지만 말한다
      await undo();
      return { ...base, ok: true, dryRun: true, changed: 0, expected: rows.length,
        stood: rows, sheetId: null, sheetMade: false,
        msg: `그날 판이 아직 없습니다 — 굳히면 판을 먼저 세우고 ${rows.length}줄이 섭니다` };
    } else {
      const w = await attendanceWrite(db, {
        via: "sheet",                       // 「판 저장 — 그날 판을 저장할 때 같이」 (attend.js WRITE_PATHS)
        studentId: key.studentId, date: key.date, classId: key.classId,
        attend: opts.attend ?? "present",
      });
      if (!w.ok) {
        await undo();
        return { ...base, ok: false, why: "no_sheet",
          // ⚠️ 여기서는 `noUndo` 를 안 붙인다 — 판이 안 섰으니 **되돌릴 것이 애초에 없다.**
          //    아무 데나 붙이면 원장님이 「뭔가 반쯤 들어갔나」로 읽는다
          msg: `그날 판을 못 세웠습니다 — ${w.msg ?? w.why}` };
      }
      sheetId = w.sheetId; sheetMade = true;
      notes.push("그날 판이 없어 **먼저 세웠습니다** (출결 '" + (opts.attend ?? "present") + "')");
    }

    // ── ⓑ 판에 이미 선 줄 — 「새로 섰나 · 그대로였나 · 안 건드렸나」를 여기서 가른다
    const beforeRows = (await db.query(SQL_EXIST, [sheetId])).rows ?? [];
    const before = new Map(beforeRows.map((r) => [rowKey(r), r]));
    const mineKeys = new Set(rows.map(rowKey));

    // ⚠️ 바뀔 것으로 **미리 세어 둔다.** 이게 없으면 「막혀서 0줄」과
    //    「애초에 바뀔 줄이 없어서 0줄」을 못 가른다 — 섞으면 화면이 거짓말을 한다
    let expected = 0;
    const kept = [];
    for (const r of rows) {
      const b = before.get(rowKey(r));
      if (!b) { expected++; continue; }
      if (b.status === "none") { expected++; continue; }
      kept.push({ ...r, id: b.id, status: b.status });   // ⚠️ 아이가 낸 것·찍은 것 — 안 건드린다
    }
    // 이번 초안에 없는 줄 — **안 지운다**(대전제 6). 아이 사진이 그 줄에 붙어 있다
    const extra = beforeRows
      .filter((b) => !mineKeys.has(rowKey(b)))
      .map((b) => ({ id: b.id, slot: b.slot, itemId: b.item_id, unitId: b.unit_id,
                     rangeNote: b.range_note, status: b.status, sort: b.sort }));

    const mid = { ...base, sheetId, sheetMade, expected, kept, extra };

    if (opts.dryRun === true) {
      await undo();
      const willStand = rows.filter((r) => !before.has(rowKey(r)));
      const willAgain = rows.filter((r) => before.get(rowKey(r))?.status === "none");
      return { ...mid, ok: true, dryRun: true, changed: 0,
        stood: willStand, again: willAgain,
        msg: `이대로 굳히면 ${willStand.length}줄이 새로 섭니다` +
             (kept.length ? ` · 이미 찍힌 ${kept.length}줄은 안 건드립니다` : "") +
             (extra.length ? ` · 초안에 없는 ${extra.length}줄은 그대로 둡니다` : "") };
    }

    // ── ⓒ 굳힌다 — **한 문**이다
    const w = await db.query(SQL_FREEZE, [
      sheetId,
      rows.map((r) => r.slot),
      rows.map((r) => r.itemId),
      rows.map((r) => r.unitId),
      rows.map((r) => r.rangeNote),
      rows.map((r) => r.memo),
      rows.map((r) => r.sort),
    ]);
    const got = w.rows ?? [];
    const changed = got.length;

    // ⚠️ **0줄이면 실패로 되돌린다**(자동 검사 ⑪) — 단 「바뀔 줄이 애초에 없었다」는 실패가 아니다
    if (expected > 0 && changed === 0) {
      await undo();
      return { ...mid, ok: false, why: "no_rows", changed: 0, warn: noUndo,
        msg: `${expected}줄이 바뀌어야 하는데 **한 줄도 안 바뀌었습니다** — 접근 규칙이 막았거나 ` +
          "그 사이 누가 먼저 찍었습니다. 「저장됨」이라 말하지 않습니다" };
    }

    const byKey = new Map(got.map((g) => [rowKey(g), g]));
    const stood = [], again = [];
    for (const r of rows) {
      const g = byKey.get(rowKey(r));
      if (!g) continue;                                   // 안 바뀐 줄 — kept 가 이미 세었다
      (before.has(rowKey(r)) ? again : stood).push({ ...r, id: g.id });
    }
    if (tx) await db.query("commit");

    // ⚠️ 미리 센 것과 실제가 다르면 **밝힌다.** 그 사이 누가 한 줄을 찍었다는 뜻이다
    if (changed !== expected) {
      notes.push(`⚠️ ${expected}줄이 바뀔 것으로 봤는데 ${changed}줄이 바뀌었습니다 — ` +
        "그 사이 누가 그 줄을 찍은 것 같습니다 (찍힌 줄은 안 건드립니다)");
    }
    if (kept.length) {
      notes.push(`이미 검사가 찍힌 ${kept.length}줄은 **그대로 뒀습니다** — 아이가 낸 것을 안 지웁니다`);
    }
    if (extra.length) {
      notes.push(`이번 초안에 없는 ${extra.length}줄이 판에 그대로 있습니다 — **안 지웁니다**(대전제 6). ` +
        "빼려면 그 줄에서 직접 빼 주세요");
    }

    // ⚠️ 잘된 자리에는 `noUndo` 를 안 붙인다 — 되돌릴 일이 없는데 「되돌리지 못했다」가 뜨면
    //    원장님이 매번 「뭐가 잘못됐나」를 확인하러 판을 다시 연다(대전제 3 반대)
    return { ...mid, ok: true, changed, stood, again, notes,
      msg: stood.length || again.length
        ? `${stood.length}줄이 새로 섰습니다` + (again.length ? ` · ${again.length}줄은 다시 적었습니다` : "")
        : "판이 이미 그대로입니다 — 바뀐 것이 없습니다" };
  } catch (e) {
    await undo();
    throw e;
  }
}

/* ────────────────────────────────────────────────────────────────
 * 영역 메모 — 단어·독해·문법·영작 **한 줄씩** (목업 31 · 0079)
 *
 * ⚠️ **교재 메모(`day_item.memo`)와 다른 것이다.** 교재 메모는 「그 교재 그 회차」에 붙고
 *    영역 메모는 **그날 그 아이의 총평**이다(⑨-a). 둘을 한 자리에 합치면
 *    교재를 두 권 쓰는 아이의 문법 한 마디가 어느 교재 것인지 정할 수 없어진다.
 *
 * ⚠️ **이 줄은 아이·학부모에게 그대로 나간다.** 원장님만 볼 말은 `day_sheet.staff_note` 다.
 *    가리는 것은 접근 규칙이 한다(`own_read_dam` → `v2.sheet_visible` = 마감해야 보인다) —
 *    여기서 마감을 다시 판단하지 않는다(원칙 1, 옛 앱 사고 #7 이 그 술어가 없어서 났다).
 * ──────────────────────────────────────────────────────────────── */

/** 적은 것이 없는 칸 */
const 빈줄 = (v) => v == null || String(v).trim() === "";

/**
 * ⚠️⚠️ **비운 줄을 지우지 않는다 — 빈 값으로 내린다** (대전제-6).
 *
 * 처음에는 `delete` 로 썼다. **두 가지가 동시에 틀렸다.**
 *   ① `authenticated` 가 DELETE 권한을 가진 v2 표는 **0개**다(0079 가 회수했다. 전수 확인).
 *      화면은 `authenticated` 로 도므로 **첫 저장에서 permission denied 로 터진다.**
 *      lib·app 통틀어 `delete from v2.` 는 그 한 줄뿐이었다.
 *   ② 대전제-6 은 「지우지 않는다. 상태로 내린다」다. 「안 적은 메모는 사실이 아니다」로
 *      예외를 적어 뒀었는데, **줄을 남기면 「그날 이 영역을 한 번 적었다 지웠다」가 남는다.**
 *
 * → 빈 값(`''`)으로 내리고, **읽는 쪽이 빈 것을 안 준다.** 화면에서는 지운 것과 같아 보인다.
 */
const SQL_AREA_MEMO_READ = `
select area, memo, updated_at
  from v2.day_area_memo where sheet_id = $1::uuid and memo <> '' order by area`;

const SQL_AREA_MEMO_PUT = `
insert into v2.day_area_memo (sheet_id, area, memo, updated_at)
select $1::uuid, x.area, x.memo, now()
  from unnest($2::text[], $3::text[]) as x(area, memo)
on conflict (sheet_id, area) do update
   set memo = excluded.memo, updated_at = now()
 where v2.day_area_memo.memo is distinct from excluded.memo
returning area`;

// ⚠️ **지우지 않는다.** 이미 비어 있는 줄은 안 건드린다(`memo <> ''`) — 안 그러면
//    아무 일도 안 하면서 「내렸다」로 세어 「같은 값이라 안 바뀜」과 뒤섞인다
const SQL_AREA_MEMO_CLEAR = `
update v2.day_area_memo set memo = '', updated_at = now()
 where sheet_id = $1::uuid and area = any($2::text[]) and memo <> ''
returning area`;

/** 그 판의 영역 메모 — `{ 영역: 한 줄 }` */
export async function areaMemos(db, sheetId) {
  if (!sheetId) throw new Error("areaMemos: 판이 없다");
  const { rows } = await db.query(SQL_AREA_MEMO_READ, [sheetId]);
  return Object.fromEntries(rows.map((r) => [r.area, r.memo]));
}

/**
 * 영역 메모를 적는다. `{ 문법: "간접의문문 어순", 독해: "" }` — **빈 줄은 내린다**(안 지운다).
 *
 * ⚠️ **준 영역만 건드린다.** 안 준 영역은 그대로 둔다 —
 *    화면이 문법 칸만 고쳤는데 독해 메모가 사라지면 원장님은 그것을 못 알아챈다.
 * ⚠️ **몇 줄이 바뀌었는지 돌려준다** (자동 검사 ⑪). 다만 「같은 값이라 안 바뀜」과
 *    「막혀서 0줄」은 다르다 — 앞엣것은 성공이므로 `same` 으로 따로 센다.
 */
export async function putAreaMemos(db, sheetId, memos = {}) {
  if (!sheetId) throw new Error("putAreaMemos: 판이 없다");
  const 들어온 = Object.entries(memos);
  if (!들어온.length) return { wrote: 0, removed: 0, same: 0 };

  const 내릴것 = 들어온.filter(([, v]) => 빈줄(v)).map(([k]) => k);
  const 적을것 = 들어온.filter(([, v]) => !빈줄(v));

  let removed = 0, wrote = 0;
  if (내릴것.length) removed = (await db.query(SQL_AREA_MEMO_CLEAR, [sheetId, 내릴것])).rows.length;
  if (적을것.length) {
    const r = await db.query(SQL_AREA_MEMO_PUT,
      [sheetId, 적을것.map(([k]) => k), 적을것.map(([, v]) => String(v).trim())]);
    wrote = r.rows.length;
    // 0줄인데 지운 것도 없으면 **막힌 것일 수 있다** — 진짜로 있는지 세어 가른다
    if (wrote === 0) {
      const 있나 = await db.query(
        `select count(*)::int as n from v2.day_area_memo
          where sheet_id = $1::uuid and area = any($2::text[])`,
        [sheetId, 적을것.map(([k]) => k)]);
      if ((있나.rows?.[0]?.n ?? 0) !== 적을것.length)
        throw new Error("putAreaMemos: 한 줄도 안 들어갔다 (접근 규칙이 막았을 수 있다)");
    }
  }
  return { wrote, removed, same: 적을것.length - wrote };
}
