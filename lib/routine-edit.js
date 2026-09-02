/**
 * **학생루틴을 고치는 한 벌** — ㊷ (▲▼ 차례 · ✎ 고치기 · 🗑 내리기 · ＋ 항목).
 *
 * ── 여기 말고 다른 데서 `v2.student_routine` 을 쓰지 않는다
 *    읽기는 `lib/routine.js` 의 `routineOf`, 쓰기는 **이 파일뿐**이다(원칙 1).
 *
 * ── ⚠️⚠️ **첫 손질이 통째로 옮겨 심는다. 이것을 빠뜨리면 항목이 조용히 사라진다.**
 *    `pickRoutine` 의 규칙은 「그 영역에 학생 줄이 **하나라도** 있으면 **그 영역은 학생 것만**」이다.
 *    그래서 영역 루틴 6줄을 쓰는 아이에게 항목 하나를 더하려고 학생 줄 **한 줄**만 넣으면,
 *    그 순간 영역 루틴 6줄이 통째로 밀려나고 **그 아이의 그 영역 숙제가 1줄이 된다.**
 *    오류가 안 난다 — 숙제가 나가긴 나가고, 다만 다섯 줄이 없다.
 *    → 손질하는 모든 길이 **`openRoutine` 을 먼저 지난다.** 영역 루틴을 그대로 베껴 심고 나서 고친다.
 *
 * ── ⚠️ **지우지 않는다** (대전제 6). 🗑 는 `state='retired'` 다.
 *    지난 판·검사 줄이 그 항목을 가리키고 있어서, 진짜로 지우면 「그때 뭘 했더라」가 빈칸이 된다.
 *    되살리는 길(`reviveItem`)을 같은 파일에 둔다 — 내릴 수만 있고 못 되살리면 실수를 못 무른다.
 *
 * ── ⚠️ **몇 줄이 바뀌었는지 보고 0줄이면 실패다** (자동 검사 ⑪).
 *    접근 규칙이 막았는데 화면이 「저장됨」이라 말하는 자리를 막는다.
 *    다만 「이미 그 값이었다」와 「막혀서 0줄」은 다르다 — 앞엣것은 미리 세어 보고 가른다.
 *
 * ── 차례(`sort`)는 **영역 안에서만** 센다. 0부터 빈틈없이 다시 매긴다 —
 *    끌어놓기와 ▲▼ 가 같은 표를 고치므로, 번호에 틈이 있으면 ▲▼ 가 한 칸을 건너뛴다.
 *
 * DB 는 `{ query(sql, params) -> { rows } }` 를 받는 얕은 어댑터다.
 * ⚠️ SQL 안에 `${…}` 를 끼우지 않는다 — 끼우면 `scripts/check-sql.mjs` 가 칸 이름을 못 본다.
 */

/** `v2.student_routine.place` 가 받는 넷 (표 그대로). 화면이 이 목록을 다시 적지 않는다 */
export const PLACES = ["class", "home", "both", "next"];

const 있는가 = (p) => PLACES.includes(p);

/**
 * **영역 루틴을 학생 것으로 옮겨 심는다.** 이미 학생 줄이 있으면 아무것도 안 한다.
 * @returns { seeded:number, already:boolean }
 */
export async function openRoutine(db, { studentId, area }) {
  if (!studentId || !area) throw new Error("openRoutine: studentId·area 가 있어야 한다");
  const have = await db.query(
    `select count(*)::int as n from v2.student_routine
      where student_id = $1::uuid and area = $2::v2.area_name`, [studentId, area]);
  if ((have.rows?.[0]?.n ?? 0) > 0) return { seeded: 0, already: true };

  // ⚠️ 영역 줄이 0개일 수도 있다 — 그 영역에 기본루틴이 아직 없는 경우다.
  //    그때는 심을 것이 없고, 그것은 실패가 아니다(빈 채로 시작해 ＋로 채운다).
  const r = await db.query(
    `insert into v2.student_routine (student_id, area, item_id, place, sort)
     select $1::uuid, a.area, a.item_id, a.place,
            row_number() over (order by a.sort, a.item_id) - 1
       from v2.area_routine a
      where a.area = $2::v2.area_name and a.state = 'active'
     on conflict on constraint student_routine_slot_key do nothing
     returning id`, [studentId, area]);
  return { seeded: r.rows.length, already: false };
}

/** ＋ 항목 — 맨 뒤에 붙인다. 이미 (아이·영역·항목·자리)가 있으면 **되살린다** */
export async function addItem(db, { studentId, area, itemId, place = "home" }) {
  if (!있는가(place)) throw new Error(`addItem: place 는 ${PLACES.join("·")} 중 하나다 — ${place}`);
  await openRoutine(db, { studentId, area });
  const r = await db.query(
    `insert into v2.student_routine (student_id, area, item_id, place, sort)
     select $1::uuid, $2::v2.area_name, $3::uuid, $4,
            coalesce(max(sort), -1) + 1 from v2.student_routine
      where student_id = $1::uuid and area = $2::v2.area_name
     on conflict on constraint student_routine_slot_key do update
        set state = 'active'
      returning id, sort, state`, [studentId, area, itemId, place]);
  if (!r.rows.length) throw new Error("addItem: 한 줄도 안 들어갔다 (접근 규칙이 막았을 수 있다)");
  return r.rows[0];
}

/** 🗑 내리기 — **지우지 않는다.** 이미 내려가 있으면 그렇다고 알린다 */
export async function retireItem(db, { studentId, area, itemId, place }) {
  const r = await db.query(
    `update v2.student_routine set state = 'retired'
      where student_id = $1::uuid and area = $2::v2.area_name and item_id = $3::uuid
        and place = $4 and state = 'active'
      returning id`, [studentId, area, itemId, place]);
  if (r.rows.length) return { retired: 1, already: false };
  const 있나 = await db.query(
    `select state from v2.student_routine
      where student_id = $1::uuid and area = $2::v2.area_name and item_id = $3::uuid and place = $4`,
    [studentId, area, itemId, place]);
  if (!있나.rows.length) throw new Error("retireItem: 그런 루틴 줄이 없다");
  return { retired: 0, already: true };            // 이미 내려가 있었다 — 실패가 아니다
}

/** 되살리기 — 내린 것을 무른다 */
export async function reviveItem(db, { studentId, area, itemId, place }) {
  const r = await db.query(
    `update v2.student_routine set state = 'active'
      where student_id = $1::uuid and area = $2::v2.area_name and item_id = $3::uuid
        and place = $4 and state = 'retired'
      returning id`, [studentId, area, itemId, place]);
  return { revived: r.rows.length };
}

/** ✎ 고치기 — 잠금(앞엣것을 끝내야 다음)과 갯수. 안 준 것은 안 건드린다 */
export async function editItem(db, { studentId, area, itemId, place, gatePrev, countN }) {
  const r = await db.query(
    `update v2.student_routine
        set gate_prev = coalesce($5::boolean, gate_prev),
            count_n   = case when $6::text = 'keep' then count_n else $7::smallint end
      where student_id = $1::uuid and area = $2::v2.area_name and item_id = $3::uuid and place = $4
      returning id, gate_prev, count_n`,
    [studentId, area, itemId, place,
     gatePrev === undefined ? null : !!gatePrev,
     countN === undefined ? "keep" : "set",          // ⚠️ null 로 **지우는 것**과 안 건드리는 것을 가른다
     countN === undefined ? null : countN]);
  if (!r.rows.length) throw new Error("editItem: 그런 루틴 줄이 없다 (0줄 — 막혔을 수 있다)");
  return r.rows[0];
}

/**
 * ▲▼ 차례 — 그 줄을 `to` 번째로 옮기고 **영역 전체를 0부터 다시 매긴다.**
 * 살아 있는 줄만 센다 — 내린 줄이 번호를 먹으면 ▲▼ 가 한 칸을 건너뛴다.
 */
export async function moveItem(db, { studentId, area, itemId, place, to }) {
  const cur = await db.query(
    `select item_id, place from v2.student_routine
      where student_id = $1::uuid and area = $2::v2.area_name and state = 'active'
      order by sort, item_id`, [studentId, area]);
  const list = cur.rows.map((r) => `${r.item_id}|${r.place}`);
  const key = `${itemId}|${place}`;
  const from = list.indexOf(key);
  if (from < 0) throw new Error("moveItem: 그 줄이 살아 있는 루틴에 없다");
  const n = Math.max(0, Math.min(list.length - 1, Number(to)));
  list.splice(n, 0, ...list.splice(from, 1));

  const r = await db.query(
    `update v2.student_routine s set sort = x.i
       from unnest($3::text[], $4::text[], $5::int[]) as x(item_id, place, i)
      where s.student_id = $1::uuid and s.area = $2::v2.area_name
        and s.item_id = x.item_id::uuid and s.place = x.place
        and s.sort is distinct from x.i
      returning s.id`,
    [studentId, area,
     list.map((k) => k.split("|")[0]), list.map((k) => k.split("|")[1]),
     list.map((_, i) => i)]);
  return { moved: from !== n, renumbered: r.rows.length, order: list.map((k) => k.split("|")[0]) };
}

/** 화면이 그릴 목록 — **내린 것도 준다**(되살리려면 보여야 한다). 차례는 살아 있는 것 기준 */
export async function routineRows(db, { studentId, area }) {
  const { rows } = await db.query(
    `select r.item_id, li.name, r.place, r.sort, r.gate_prev, r.count_n, r.state
       from v2.student_routine r
       join v2.learn_items li on li.id = r.item_id
      where r.student_id = $1::uuid and r.area = $2::v2.area_name
      order by (r.state = 'retired'), r.sort, li.name`, [studentId, area]);
  return rows;
}
