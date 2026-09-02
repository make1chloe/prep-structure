"use server";
/**
 * 교재 화면이 **쓰는** 자리. 여기에도 판단은 없다 — 값을 담고, `lib/` 을 부르고, 답을 돌려준다.
 *
 * ── 지키는 것
 *    ⚠️ **역할을 스스로 본다.** 문지기는 첫 화면만 고르고 역할로 화면을 안 지킨다.
 *       그래서 서버 동작 **하나하나**가 `run()` 을 지나 원장·강사인지 다시 본다 —
 *       화면만 막으면 서버 동작 주소는 그대로 열려 있다.
 *    ⚠️ **0줄이면 실패다** (자동 검사 ⑪). 접근 규칙이 막았는데 「저장됨」이라 말하지 않는다.
 *    ⚠️ **지우지 않는다** (대전제 6). `delete` 가 이 파일에 한 줄도 없다 —
 *       내리는 것은 늘 **상태 칸**을 바꾸는 것이고, 되살릴 수 있다 (㊷).
 *    ⚠️ **고르는 값을 여기 적지 않는다** (원칙 1). 받은 값이 옳은지는 `loadPicks()` 가
 *       **DB 의 CHECK 제약**에서 읽어 판정한다. 여기 목록을 적으면 DB 를 고친 날 두 벌이 어긋난다.
 *    ⚠️ `revalidatePath` 를 안 부른다 — 한 번 누를 때마다 화면 전체(조회 13번)가 다시 돌면
 *       루틴 열 줄 차례를 바꾸는 데 130번을 문다. **누른 그 줄만** 화면에서 바꾼다 (§속도 5).
 *
 * ── 여기 **없는** 것과 그 까닭 (지어내지 않는다)
 *    ① **단원 한 줄을 손으로 더하는 단추가 없다.** 확정 ⑤ — 한 교재의 단원은 **한 곳에서만**
 *       들어온다(이관 **또는** 엑셀). 화면이 세 번째 입구가 되면 한 교재에 단원 나무가
 *       두 벌 서고, 진도율 분모가 두 배로 읽혀 **「곧 끝나는 교재」가 영영 안 걸린다.**
 *       → 단원은 엑셀 왕복으로만 들어온다. 화면에서는 **내리고 되살릴** 뿐이다.
 *    ② **영상 시청률(몇 %)을 셈하지 않는다.** 그 판단이 `lib/` 에 아직 없다 (원칙 1).
 */
import { openAs } from "./db.js";
import { staffOnly } from "./who.js";
import {
  SHEETS, loadPicks, splitDots, readWorkbook, preview, previewLines,
  compareOnly, apply, undo, needsYears,
} from "../../lib/excel.js";
import { SHEET_KEYS } from "./read.js";

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const txt = (v, max = 400) => { const s = String(v ?? "").trim(); return s === "" ? null : s.slice(0, max); };
const num = (v) => { const n = Number(String(v ?? "").trim()); return Number.isFinite(n) ? Math.trunc(n) : null; };

/** 문을 열고 → 하고 → 반드시 닫는다 */
async function run(fn) {
  const me = await staffOnly();
  if (!me.ok) return { ok: false, why: me.why, msg: me.msg };
  const c = await openAs(me.profileId);
  if (!c.ok) return { ok: false, why: "no-db", msg: c.why };
  try {
    return await fn(c.db, me);
  } catch (e) {
    return { ok: false, why: "threw", msg: String(e?.message ?? e).slice(0, 400) };
  } finally {
    await c.end();
  }
}

/**
 * 고르는 값인가 — **DB 에 물어서** 판정한다 (엑셀 규칙 6 · 원칙 1).
 * @returns null 이면 괜찮고, 글자면 「왜 안 되는지」다
 */
async function badPick(db, table, col, value) {
  const picks = await loadPicks(db, table);
  const list = picks[col];
  if (!list) return `\`v2.${table}.${col}\` 에 고르는 값 제약이 없습니다 — 아무 값이나 들어갑니다. 먼저 DB 에 제약을 걸어야 합니다`;
  if (!list.includes(value)) return `「${value}」는 못 쓰는 값입니다. DB 가 받는 값: ${list.join(" · ")}`;
  return null;
}

/** 한 줄도 안 바뀌었으면 **실패다** */
const wrote = (r) => (r.rowCount ?? (r.rows ? r.rows.length : 0)) > 0;
const NOROW = { ok: false, why: "no_rows", msg: "한 줄도 안 바뀌었습니다 — 접근 규칙이 막았거나 그 줄이 없습니다" };

/* ══════════════════════════════════════════════════════════════════════
 * ① 교재 — 영역 · 배정 겹 · 대단원 기준/소단원 기준 · 상태
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ **`order_basis`(대단원 기준 / 소단원 기준)는 워크북이 있는 교재에서만 뜻이 있다** (㉙).
 *    워크북이 0줄인 책에서는 무엇을 고르든 배정이 똑같다 — 화면이 그렇게 밝힌다.
 *    여기서 막지는 않는다. 워크북을 나중에 넣는 책이 있기 때문이다.
 */
export async function saveBook({ bookId, area, chunkDepth, orderBasis, unitTest, state }) {
  if (!UUID.test(String(bookId ?? ""))) return { ok: false, msg: "어느 교재인지 모릅니다" };
  return run(async (db) => {
    const picks = await loadPicks(db, "books");
    const set = [], vals = [bookId];
    const put = (col, v) => { vals.push(v); set.push(`${col} = $${vals.length}`); };

    if (area !== undefined) {
      const a = txt(area, 40);
      // ⚠️ 영역은 **비울 수 있다** — 아직 안 정한 교재가 8권 있다(`v2.books_without_area()`)
      if (a !== null && !(picks.area ?? []).includes(a))
        return { ok: false, msg: `「${a}」는 못 쓰는 영역입니다. DB 가 받는 값: ${(picks.area ?? []).join(" · ")}` };
      put("area", a);
    }
    for (const [key, col, v] of [["chunkDepth", "chunk_depth", chunkDepth],
                                 ["orderBasis", "order_basis", orderBasis],
                                 ["state", "state", state]]) {
      if (v === undefined) continue;
      const bad = await badPick(db, "books", col, String(v));
      if (bad) return { ok: false, msg: `${key} — ${bad}` };
      put(col, String(v));
    }
    if (unitTest !== undefined) put("unit_test", unitTest === true || unitTest === "true");
    if (!set.length) return { ok: false, msg: "바꿀 것이 없습니다" };

    const r = await db.query(
      `/* books:save-book */ update v2.books set ${set.join(", ")}
        where id = $1::uuid returning id, area, chunk_depth, order_basis, unit_test, state`, vals);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: r.rows[0] };
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * ② 단원 — **내리고 되살린다.** 지우지 않는다 (대전제 6)
 * ══════════════════════════════════════════════════════════════════════ */

export async function setUnitState({ unitId, state }) {
  if (!UUID.test(String(unitId ?? ""))) return { ok: false, msg: "어느 단원인지 모릅니다" };
  return run(async (db) => {
    const bad = await badPick(db, "units", "state", String(state));
    if (bad) return { ok: false, msg: bad };
    const r = await db.query(
      `/* books:unit-state */ update v2.units set state = $2
        where id = $1::uuid returning id, state`, [unitId, String(state)]);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: r.rows[0] };
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * ③ 기본루틴 — 모든 항목 (㉒). **차례가 없다**
 * ══════════════════════════════════════════════════════════════════════ */

/** 체크리스트 한 칸 → 목록. ⚠️ 가르는 법은 `lib/excel.js` 한 벌을 그대로 쓴다 (원칙 1) */
const checksOf = (s) => splitDots(String(s ?? ""));

export async function addItem({ name, method, tool, checks }) {
  const n = txt(name, 120);
  if (!n) return { ok: false, msg: "항목 이름이 없습니다 — 이름 없이 만들지 않습니다" };
  return run(async (db) => {
    // ⚠️ 이름이 겹치면 **새로 만들지 않는다** (엑셀 규칙 3 과 같은 손씨).
    //    조용히 하나 더 만들면 지난 기록이 두 이름으로 갈린다
    const dup = await db.query(`/* books:item-dup */ select id, state from v2.learn_items where name = $1`, [n]);
    if (dup.rows.length)
      return { ok: false, why: "dup", itemId: dup.rows[0].id, state: dup.rows[0].state,
               msg: `「${n}」은 이미 있습니다${dup.rows[0].state === "retired" ? " (내려둔 항목입니다 — 되살리면 됩니다)" : ""}` };
    const r = await db.query(
      `/* books:item-add */ insert into v2.learn_items(name, method, tool, checks)
       values ($1,$2,$3,$4) returning id, name, method, tool, checks, state, sort`,
      [n, txt(method, 500), txt(tool, 200), checksOf(checks)]);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: { ...r.rows[0], in_area: 0, in_student: 0, used: 0 } };
  });
}

export async function saveItem({ itemId, name, method, tool, checks }) {
  if (!UUID.test(String(itemId ?? ""))) return { ok: false, msg: "어느 항목인지 모릅니다" };
  const n = txt(name, 120);
  if (!n) return { ok: false, msg: "항목 이름을 비울 수 없습니다" };
  return run(async (db) => {
    const r = await db.query(
      `/* books:item-save */ update v2.learn_items
          set name = $2, method = $3, tool = $4, checks = $5
        where id = $1::uuid returning id, name, method, tool, checks, state, sort`,
      [itemId, n, txt(method, 500), txt(tool, 200), checksOf(checks)]);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: r.rows[0] };
  });
}

/**
 * 🗑 **내리기 — 지우는 것이 아니다** (㊷ · 대전제 6).
 *
 * ⚠️ 지난 기록이 이 항목을 가리키고 있다. 실측 2026-09-02 — 내려둔 항목 「문법」 한 개를
 *    `v2.day_item` **803줄**이 가리킨다. 진짜로 지우면 그 803줄의 「그때 뭘 했더라」가
 *    통째로 빈칸이 된다. 그래서 상태만 `retired` 로 바꾸고, **되살릴 수 있다.**
 * ⚠️ 내린 항목은 새 루틴에 안 뜬다 — `lib/routine.js` 의 `routineOf` 가 `li.state='active'`
 *    로 거른다. 그 거르개가 이 단추의 **뒷면**이다.
 */
export async function setItemState({ itemId, state }) {
  if (!UUID.test(String(itemId ?? ""))) return { ok: false, msg: "어느 항목인지 모릅니다" };
  return run(async (db) => {
    const bad = await badPick(db, "learn_items", "state", String(state));
    if (bad) return { ok: false, msg: bad };
    const r = await db.query(
      `/* books:item-state */ update v2.learn_items set state = $2
        where id = $1::uuid returning id, state`, [itemId, String(state)]);
    if (!wrote(r)) return NOROW;
    // 이 항목이 지금 걸려 있는 루틴 줄 — 내리면 그 줄들이 오늘부터 안 뜬다. **말해 준다**
    const n = await db.query(
      `/* books:item-inuse */ select
         (select count(*)::int from v2.area_routine    r where r.item_id = $1::uuid) as in_area,
         (select count(*)::int from v2.student_routine r where r.item_id = $1::uuid) as in_student,
         (select count(*)::int from v2.day_item        d where d.item_id = $1::uuid) as used`,
      [itemId]);
    const c = n.rows[0] ?? {};
    return {
      ok: true, row: r.rows[0], counts: c,
      msg: String(state) === "retired"
        ? `내렸습니다 — 새 루틴에는 안 뜹니다. 지난 기록 ${c.used ?? 0}줄은 **그대로 남습니다**` +
          (c.in_area ? ` (영역 루틴 ${c.in_area}줄이 이 항목을 걸고 있어 그 줄도 오늘부터 안 뜹니다)` : "")
        : "되살렸습니다 — 다시 루틴에 뜹니다",
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * ④ 영역 루틴 — ▲▼ 차례 · ✎ 고치기 · + 항목 (㊷)
 * ══════════════════════════════════════════════════════════════════════ */

export async function addAreaRoutine({ area, itemId, place, required }) {
  if (!UUID.test(String(itemId ?? ""))) return { ok: false, msg: "어느 항목인지 모릅니다" };
  return run(async (db) => {
    for (const [col, v] of [["area", String(area ?? "")], ["place", String(place ?? "")]]) {
      const bad = await badPick(db, "area_routine", col, v);
      if (bad) return { ok: false, msg: bad };
    }
    const r = await db.query(
      `/* books:ar-add */ insert into v2.area_routine(area, item_id, place, required, sort)
       select $1, $2::uuid, $3, $4,
              coalesce((select max(sort) from v2.area_routine where area = $1), 0) + 1
        on conflict (area, item_id, place) do nothing
       returning id, area, item_id, place, required, sort`,
      [String(area), itemId, String(place), required === true || required === "true"]);
    if (!wrote(r))
      return { ok: false, why: "dup", msg: "그 영역에 같은 항목·같은 자리가 이미 있습니다 — 하나 더 만들지 않습니다" };
    const nm = await db.query(`/* books:ar-name */ select name, state from v2.learn_items where id = $1::uuid`, [itemId]);
    return { ok: true, row: { ...r.rows[0], name: nm.rows[0]?.name ?? "", item_state: nm.rows[0]?.state ?? null } };
  });
}

export async function saveAreaRoutine({ rowId, place, required }) {
  if (!UUID.test(String(rowId ?? ""))) return { ok: false, msg: "어느 줄인지 모릅니다" };
  return run(async (db) => {
    const bad = await badPick(db, "area_routine", "place", String(place));
    if (bad) return { ok: false, msg: bad };
    const r = await db.query(
      `/* books:ar-save */ update v2.area_routine set place = $2, required = $3
        where id = $1::uuid returning id, area, item_id, place, required, sort`,
      [rowId, String(place), required === true || required === "true"]);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: r.rows[0] };
  });
}

/**
 * ▲▼ — **같은 영역 안 이웃과 차례를 맞바꾼다.**
 * ⚠️ 「몇 번째」를 다시 매기지 않는다. 두 줄만 건드리므로 다른 줄이 조용히 안 움직인다.
 */
export async function moveAreaRoutine({ rowId, dir }) {
  if (!UUID.test(String(rowId ?? ""))) return { ok: false, msg: "어느 줄인지 모릅니다" };
  const up = String(dir) === "up";
  if (!up && String(dir) !== "down") return { ok: false, msg: `모르는 방향 「${dir}」` };
  return run(async (db) => {
    const me = (await db.query(
      `/* books:ar-one */ select id, area, sort from v2.area_routine where id = $1::uuid`, [rowId])).rows[0];
    if (!me) return { ok: false, msg: "그 줄이 없습니다 (접근 규칙이 막았을 수도 있습니다)" };
    const nb = (await db.query(
      `/* books:ar-nb */ select id, sort from v2.area_routine
        where area = $1 and id <> $2::uuid
          and case when $3::boolean then sort < $4 else sort > $4 end
        order by case when $3::boolean then -sort else sort end
        limit 1`,
      [me.area, me.id, up, me.sort])).rows[0];
    if (!nb) {
      // ⚠️ 「맨 끝」인지 **「차례가 겹쳐 위아래가 없는지」**를 가른다. 뭉뚱그리면
      //    겹친 줄이 영영 안 움직이는데 화면은 「맨 위입니다」라고만 말한다
      const tie = (await db.query(
        `/* books:ar-tie */ select count(*)::int n from v2.area_routine
          where area = $1 and id <> $2::uuid and sort = $3`, [me.area, me.id, me.sort])).rows[0]?.n ?? 0;
      if (tie) return { ok: false, why: "same",
        msg: `차례가 ${me.sort} 인 줄이 ${tie + 1}개라 위아래가 없습니다 — 엑셀에서 차례를 갈라 올려야 합니다` };
      return { ok: false, why: "edge", msg: up ? "맨 위입니다" : "맨 아래입니다" };
    }
    const a = await db.query(`/* books:ar-swap1 */ update v2.area_routine set sort = $2 where id = $1::uuid returning id`, [me.id, nb.sort]);
    const b = await db.query(`/* books:ar-swap2 */ update v2.area_routine set sort = $2 where id = $1::uuid returning id`, [nb.id, me.sort]);
    if (!wrote(a) || !wrote(b)) return NOROW;
    return { ok: true, moved: [{ id: me.id, sort: nb.sort }, { id: nb.id, sort: me.sort }] };
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑤ 내신 대비 — **루틴은 교재가 아니라 자료 종류에 붙는다** (2026-08-19 확정)
 * ══════════════════════════════════════════════════════════════════════ */

export async function addMaterialType({ name, steps }) {
  const n = txt(name, 80);
  if (!n) return { ok: false, msg: "자료 종류 이름이 없습니다" };
  const list = splitDots(String(steps ?? ""));
  if (!list.length) return { ok: false, msg: "걸음이 비었습니다 — 걸음을 지어내지 않습니다 (`lib/todo.js` 가 「걸음이 안 적혀 있습니다」로 세웁니다)" };
  return run(async (db) => {
    const r = await db.query(
      `/* books:mt-add */ insert into v2.material_type(name, steps, sort)
       select $1, $2, coalesce((select max(sort) from v2.material_type), 0) + 1
        on conflict (name) do nothing
       returning id, name, steps, state, sort`, [n, list]);
    if (!wrote(r)) return { ok: false, why: "dup", msg: `「${n}」 는 이미 있습니다` };
    return { ok: true, row: { ...r.rows[0], made: 0 } };
  });
}

export async function setMaterialTypeState({ typeId, state }) {
  if (!UUID.test(String(typeId ?? ""))) return { ok: false, msg: "어느 종류인지 모릅니다" };
  return run(async (db) => {
    const bad = await badPick(db, "material_type", "state", String(state));
    if (bad) return { ok: false, msg: bad };
    const r = await db.query(
      `/* books:mt-state */ update v2.material_type set state = $2 where id = $1::uuid returning id, state`,
      [typeId, String(state)]);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: r.rows[0] };
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑥ 영상 — 앱 안에서 본다. **실제로 지나간 구간**은 아이가 볼 때 앱이 적는다
 * ══════════════════════════════════════════════════════════════════════ */

export async function addVideo({ title, url, folder, seconds }) {
  const t = txt(title, 200), u = txt(url, 500);
  if (!t) return { ok: false, msg: "영상 제목이 없습니다" };
  if (!u) return { ok: false, msg: "영상 주소가 없습니다" };
  return run(async (db) => {
    const r = await db.query(
      `/* books:video-add */ insert into v2.video(title, url, folder, seconds)
       values ($1,$2,$3,$4) returning id, title, url, folder, seconds, state`,
      [t, u, txt(folder, 80), num(seconds)]);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: { ...r.rows[0], viewers: 0, done_n: 0, partial_n: 0 } };
  });
}

export async function saveVideo({ videoId, title, url, folder, seconds, state }) {
  if (!UUID.test(String(videoId ?? ""))) return { ok: false, msg: "어느 영상인지 모릅니다" };
  // ⚠️ `video` 는 엑셀 표가 아니라 `loadPicks` 가 **안 받는다**(흰 목록 밖). 그래서 상태 값은
  //    여기서 목록을 적어 막지 않고 **DB 의 CHECK 제약이 막게 둔다** — 막힌 까닭을 그대로 올린다.
  //    (`scripts/check-screen-books.mjs` 가 이름표와 진짜 제약을 매번 견준다)
  return run(async (db) => {
    const r = await db.query(
      `/* books:video-save */ update v2.video
          set title = coalesce($2, title), url = coalesce($3, url), folder = $4,
              seconds = $5, state = coalesce($6, state)
        where id = $1::uuid returning id, title, url, folder, seconds, state`,
      [videoId, txt(title, 200), txt(url, 500), txt(folder, 80), num(seconds),
       state === undefined ? null : String(state)]);
    if (!wrote(r)) return NOROW;
    return { ok: true, row: r.rows[0] };
  });
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑦ 엑셀 왕복 — `lib/excel.js` 한 벌을 부른다. **미리보기가 핵심이다**
 * ══════════════════════════════════════════════════════════════════════ */

/** 이 화면이 다루는 표인가 — 남의 표를 여기서 올리지 않는다 */
function sheetOk(key) {
  if (!SHEET_KEYS.includes(key)) return `이 화면이 다루는 표가 아닙니다 — ${SHEET_KEYS.join(" · ")} 만 받습니다`;
  if (!SHEETS[key]) return `\`lib/excel.js\` 가 모르는 표입니다 — ${key}`;
  return null;
}

async function fileOf(form) {
  const f = form?.get?.("file");
  if (!f || typeof f.arrayBuffer !== "function") return { ok: false, msg: "파일이 안 왔습니다" };
  const size = Number(f.size ?? 0);
  if (!size) return { ok: false, msg: "빈 파일입니다" };
  if (size > 8 * 1024 * 1024) return { ok: false, msg: `파일이 큽니다 (${Math.round(size / 1024 / 1024)}MB) — 8MB 까지만 받습니다` };
  return { ok: true, buf: Buffer.from(await f.arrayBuffer()), name: String(f.name ?? "") };
}

/**
 * **미리보기 — 바로 저장하지 않는다** (엑셀 규칙 4).
 * ⚠️ 「파일에 없는 기존 줄 N개 — 손대지 않음」은 `previewLines()` 가 **늘 한 줄로** 넣는다
 *    (규칙 9). 원장님이 「엑셀에서 지웠으니 없어졌겠지」를 저장 전에 바로잡는 유일한 자리다.
 */
export async function excelPreview(form) {
  const key = String(form?.get?.("sheet") ?? "");
  const bad = sheetOk(key);
  if (bad) return { ok: false, msg: bad };
  const f = await fileOf(form);
  if (!f.ok) return f;
  return run(async (db) => {
    let file;
    try { file = readWorkbook(f.buf, String(form.get("sheetName") ?? "") || undefined); }
    catch (e) { return { ok: false, msg: `엑셀을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 200)}` }; }
    const p = await preview(db, key, file, {});
    return {
      ok: true, fileName: f.name, sheet: key, title: SHEETS[key].title, owner: SHEETS[key].owner,
      ask: p.ask, counts: p.counts, missing: p.missing, lines: p.lines ?? previewLines(p),
      needsYears: needsYears(key),
    };
  });
}

/**
 * **대조만** — 이관이 주인인 교재의 단원표는 「적재가 아니라 대조 기준」이다 (확정 ⑤).
 * 짝이 없는 줄을 목록으로 뽑아 **옛 앱에서 먼저 고친다.** 새 앱에 줄을 만들지 않는다.
 */
export async function excelCompare(form) {
  const key = String(form?.get?.("sheet") ?? "");
  const bad = sheetOk(key);
  if (bad) return { ok: false, msg: bad };
  const f = await fileOf(form);
  if (!f.ok) return f;
  return run(async (db) => {
    let file;
    try { file = readWorkbook(f.buf, String(form.get("sheetName") ?? "") || undefined); }
    catch (e) { return { ok: false, msg: `엑셀을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 200)}` }; }
    const c = await compareOnly(db, key, file, {});
    return { ok: true, ...c };
  });
}

/**
 * 저장 — **미리보기를 다시 돌려 견준 뒤에** 넣는다.
 *
 * ⚠️ 미리보기 결과를 화면에 들고 있다가 그대로 저장하면, 그 사이 DB 가 바뀌어도 모른다.
 *    그래서 **여기서 다시 세고**, 화면이 본 숫자와 다르면 **안 넣고 되돌려 준다.**
 * ⚠️ `create` 는 원장님이 「만들자」를 누른 것이다 (규칙 3). 기본은 안 만든다.
 * ⚠️ `ownerOk` 는 「주인이 다른데 그래도 올릴까요」에 답한 것이다 (확정 ⑤).
 */
export async function excelApply(form) {
  const key = String(form?.get?.("sheet") ?? "");
  const bad = sheetOk(key);
  if (bad) return { ok: false, msg: bad };
  const f = await fileOf(form);
  if (!f.ok) return f;
  const create = String(form.get("create") ?? "") === "1";
  const ownerOk = String(form.get("ownerOk") ?? "") === "1";
  const seen = {
    add: Number(form.get("seenAdd") ?? -1), change: Number(form.get("seenChange") ?? -1),
    hold: Number(form.get("seenHold") ?? -1), missing: Number(form.get("seenMissing") ?? -1),
  };
  return run(async (db, me) => {
    let file;
    try { file = readWorkbook(f.buf, String(form.get("sheetName") ?? "") || undefined); }
    catch (e) { return { ok: false, msg: `엑셀을 못 읽었습니다 — ${String(e?.message ?? e).slice(0, 200)}` }; }
    const p = await preview(db, key, file, {});
    if (p.counts.add !== seen.add || p.counts.change !== seen.change ||
        p.counts.hold !== seen.hold || p.missing !== seen.missing) {
      return {
        ok: false, why: "moved",
        msg: "미리보기 뒤에 DB 가 바뀌었습니다 — 안 넣었습니다. 미리보기를 다시 보세요",
        lines: p.lines ?? previewLines(p),
      };
    }
    if (p.ask && !ownerOk) return { ok: false, why: "ask", ask: p.ask, msg: p.ask };
    const r = await apply(db, key, p, { create, ownerOk, batch: "excel", who: me.profileId,
                                        note: `화면 /books · ${f.name}` });
    if (r.ok === false) return { ok: false, msg: r.why ?? "안 넣었습니다", ask: r.ask ?? null };
    return { ok: true, ...r };
  });
}

/** 묶음 통째로 되돌리기 (규칙 8). ⚠️ **지우지 않는다 — 상태로 내린다** */
export async function excelUndo({ runId }) {
  const id = num(runId);
  if (id === null) return { ok: false, msg: "어느 묶음인지 모릅니다" };
  return run(async (db) => {
    const r = await undo(db, id);
    return { ok: true, ...r };
  });
}
