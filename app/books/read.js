/**
 * 교재 화면이 **읽는** 자리. 여기엔 판단이 없다 — 묻고, 받은 것을 그대로 넘긴다.
 *
 * ── 판단은 전부 남의 것이다 (원칙 1). 여기서 다시 짜지 않는다:
 *    `v2.unit_label(단원, 전체)`   단원을 **뭐라고 부르나** — 이름을 여기서 다시 만들지 않는다 (0056)
 *    `v2.book_stop(학생,교재,날)`  교재가 지금 멈췄나 — 돌아감·숙제멈춤·교재멈춤 (⑬ · 0037/0062)
 *    `v2.books_without_area()`     영역이 안 붙은 교재 (0065)
 *    `v2.areas_without_routine()`  루틴이 없는 영역 (0065)
 *    `lib/routine.js`  STOP        멈춤 세 낱말의 **값**
 *    `lib/excel.js`    SHEETS · loadPicks   엑셀 표 목록 · **고르는 값 목록**
 *    `lib/todo.js`     STEPS · stepLabel    자료 종류의 걸음 이름
 *
 * ⚠️ **고르는 값을 화면에 두 벌로 적지 않는다** (계획 「실제로 난 사고 둘」 — 교시 설정이
 *    3교시인데 출결 화면만 1~10교시가 떴다). 영역·배정 겹·도는 차례·상태는 전부
 *    `loadPicks()` 가 **DB 의 CHECK 제약에서** 읽어 온다. 아래 `LABEL` 은 그 값을
 *    한글로 부르는 이름표일 뿐이고, **값을 더하지 않는다** —
 *    `scripts/check-screen-books.mjs` 가 진짜 DB 의 제약과 견주어 빠진 이름을 잡는다.
 *
 * ⚠️ **탭이 없다** (§속도 1). 한 번에 다 읽고 나머지는 접기로 줄인다 —
 *    접기(`<details>`)를 펴는 데는 조회가 **한 번도** 안 든다.
 *    탭 일곱이면 화면 전체 재조회가 일곱 번이다(지금 앱 발송이 그렇다).
 */
import { SHEETS, loadPicks } from "../../lib/excel.js";
import { STEPS, stepLabel } from "../../lib/todo.js";
import { LABEL, LABEL_FOR, PICK_TABLES, nameOf } from "./labels.js";
import { STOP } from "../../lib/routine.js";

/** 이 화면이 주인 노릇을 하는 엑셀 표 — 이름·주인은 `lib/excel.js` 것을 그대로 쓴다 */
export const SHEET_KEYS = Object.freeze(["books", "units", "learn_items", "area_routine", "material_type"]);
export const sheetTitle = (k) => SHEETS[k]?.title ?? k;
export const sheetOwner = (k) => SHEETS[k]?.owner ?? "?";

/** 걸음 이름은 `lib/todo.js` 한 벌을 그대로 부른다 */
export { STEPS, stepLabel };

/**
 * 이름표·고르는 값 표·`loadPicks` 가 받는 표 — **한 벌은 `./labels.js` 다.**
 * 누르는 쪽(`ui.js`)도 같은 파일을 본다. 여기서 다시 적지 않는다 (원칙 1).
 */
export { LABEL, LABEL_FOR, PICK_TABLES, nameOf };

/** 멈춤 세 낱말의 값 — `lib/routine.js` 것을 그대로 넘겨 준다 (⑬) */
export { STOP };

/* ══════════════════════════════════════════════════════════════════════
 * SQL — ⚠️ 전부 `export` 한다. 검사가 **진짜 스키마에** `prepare` 해 보고
 *        죽은 칸을 잡는다 (가짜 DB 로는 못 잡는 자리다).
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * **쓸 수 있나** — 규칙(RLS)이 열려 있어도 **권한(GRANT)이 없으면 아무것도 못 쓴다.**
 * 0005 가 그 함정을 적어 뒀다: 「규칙만 있고 권한이 없으면 아무도 못 본다 … **둘 다** 있어야 한다」.
 * ⚠️ 목록을 글자로 박아 두면 권한이 들어온 날 화면만 옛말을 한다 — 그래서 **매번 물어본다.**
 */
const CAN_WRITE = `select json_object_agg(x, json_build_object(
        'ins', has_table_privilege('v2.'||x, 'insert'),
        'upd', has_table_privilege('v2.'||x, 'update'),
        'del', has_table_privilege('v2.'||x, 'delete'))) as j
     from unnest(array['books','units','learn_items','area_routine','student_routine',
                       'video','material_type','excel_run','excel_row']) x`;

/**
 * 교재 목록 — 영역 · 배정 겹 · **대단원 기준/소단원 기준** · 상태.
 *
 * ⚠️ **멈춤(⑬)은 교재가 아니라 「그 아이의 그 교재」에 붙는다.** 그래서 두 칸이 따로다 —
 *    `books.state`(이 교재를 아직 쓰나)와 **지금 배정된 아이들의 멈춤 갈래**.
 *    한 칸으로 뭉치면 「수업만 하는 교재」와 「안 쓰는 교재」가 같은 말이 된다.
 * ⚠️ 멈춤 판정을 JS 로 다시 세지 않는다 — `v2.book_stop()` 한 벌이 푸는 길 셋
 *    (손·날짜·시험)을 다 본다.
 * ⚠️ `state <> 'active'` 인 교재도 **안 지우고 그대로 보인다** (대전제 6).
 */
export const Q_BOOKS = `/* books:list */
with t as (select v2.today() as d),
     g as (${CAN_WRITE})
select to_char(t.d,'YYYY-MM-DD') as today, g.j as can_write,
       b.id, b.code, b.name, b.area, b.chunk_depth, b.order_basis, b.unit_test, b.state,
       coalesce(u.total,0)    as units_total,
       coalesce(u.wb,0)       as units_wb,
       coalesce(u.chapters,0) as chapters,
       coalesce(u.hidden,0)   as units_hidden,
       coalesce(sb.n,0)        as assigned,
       coalesce(sb.running,0)  as running,
       coalesce(sb.hw_off,0)   as hw_off,
       coalesce(sb.book_off,0) as book_off
  from t
  cross join g
  cross join v2.books b
  left join lateral (
    select count(*) filter (where x.state = 'active')::int as total,
           count(*) filter (where x.state = 'active' and x.is_workbook)::int as wb,
           count(distinct x.chapter) filter (where x.state = 'active')::int as chapters,
           count(*) filter (where x.state = 'hidden')::int as hidden
      from v2.units x where x.book_id = b.id) u on true
  left join lateral (
    select count(*)::int as n,
           count(*) filter (where s.st = '${STOP.RUNNING}')::int  as running,
           count(*) filter (where s.st = '${STOP.HW_OFF}')::int   as hw_off,
           count(*) filter (where s.st = '${STOP.BOOK_OFF}')::int as book_off
      from (select v2.book_stop(k.student_id, b.id, t.d) as st
              from v2.student_book k
             where k.book_id = b.id
               and k.from_date <= t.d and (k.to_date is null or k.to_date >= t.d)) s) sb on true
 order by b.area nulls last, b.name`;

/**
 * 한 교재의 단원 나무 — **대 › 중 › 소 세 겹 고정.**
 * ⚠️ 이름은 `v2.unit_label` 이 짓는다. **다시 만들지 마라** — 중단원이 겹칠 때만 붙이는 규칙,
 *    워크북 꼬리표, 소단원이 빈 줄의 「대단원 · 활동명」이 전부 그 함수 안에 있다.
 * ⚠️ 내린 줄(`state='hidden'`)도 **가져온다.** 지우지 않았다는 것을 화면이 보여야 한다 (대전제 6).
 */
export const Q_TREE = `/* books:tree */
select u.id, u.chapter, u.mid, u.sub, u.activity, u.is_workbook, u.sort,
       u.page_start, u.page_end, u.q_count, u.q_range, u.gist, u.state,
       v2.unit_label(u.id, false) as label
  from v2.units u
 where u.book_id = $1::uuid
 order by u.sort, u.id`;

/**
 * **기본루틴 — 모든 항목** (㉒: 「모든 걸 입력한 게 기본루틴」, **차례가 없다**).
 * ⚠️ `used` 는 **지난 기록이 이 항목을 가리키는 줄 수**다. 🗑 가 「지우기」가 아니라
 *    「안 씀으로 내리기」여야 하는 까닭이 이 숫자다 (㊷) — 진짜 지우면 그만큼의
 *    「그때 뭘 했더라」가 빈칸이 된다.
 */
export const Q_ITEMS = `/* books:items */
select li.id, li.name, li.method, li.tool, li.checks, li.state, li.sort,
       (select count(*)::int from v2.area_routine r    where r.item_id = li.id) as in_area,
       (select count(*)::int from v2.student_routine r where r.item_id = li.id) as in_student,
       (select count(*)::int from v2.day_item d        where d.item_id = li.id) as used
  from v2.learn_items li
 order by li.state, li.sort, li.name`;

/** 영역 루틴 — 영역마다 차례가 있다 (㉚: 「영역 루틴이 기본이다」) */
export const Q_AREA_ROUTINE = `/* books:area-routine */
select r.id, r.area, r.item_id, r.place, r.required, r.sort,
       li.name, li.state as item_state
  from v2.area_routine r
  join v2.learn_items li on li.id = r.item_id
 order by r.area, r.sort, li.name`;

/** 학생 루틴 — 기본루틴에서 **고르고 · 차례를 짜고 · 뺀 것** (㉒) */
export const Q_STUDENT_ROUTINE = `/* books:student-routine */
select r.id, r.student_id, st.name as student_name, r.area, r.item_id,
       li.name, r.place, r.sort, r.gate_prev, r.count_n
  from v2.student_routine r
  join v2.learn_items li on li.id = r.item_id
  join v2.students st on st.id = r.student_id
 order by st.name, r.area, r.sort`;

/** 내신 대비 — **루틴은 교재가 아니라 자료 종류에 붙는다** (2026-08-19 확정) */
export const Q_MATERIAL_TYPE = `/* books:material-type */
select t.id, t.name, t.steps, t.state, t.sort,
       (select count(*)::int from v2.material m where m.type_id = t.id) as made
  from v2.material_type t
 order by t.sort, t.name`;

/**
 * 영상 — 목록과 **셀 수 있는 사실**만 읽는다.
 * ⚠️ 「몇 % 봤나」를 여기서 세지 않는다. 그 판단(`video_view.spans` 의 겹치는 구간을 합쳐
 *    길이로 나누기)이 `lib/` 에 **아직 없고**, 화면이 만들면 그날부터 규칙이 두 벌이 된다
 *    (원칙 1). 지금 셀 수 있는 것은 **줄 수**뿐이라 그것만 센다 — 화면이 그렇게 밝힌다.
 */
export const Q_VIDEO = `/* books:video */
select v.id, v.title, v.url, v.folder, v.seconds, v.state,
       (select count(*)::int from v2.video_view w where w.video_id = v.id) as viewers,
       (select count(*)::int from v2.video_view w where w.video_id = v.id and w.done_at is not null) as done_n,
       (select count(*)::int from v2.video_view w where w.video_id = v.id and w.done_at is null
                                                   and coalesce(w.last_pos,0) > 0) as partial_n
  from v2.video v
 order by v.folder nulls last, v.title`;

/** **무엇이 없어서 비었나** (대전제 0) — 화면이 이 숫자를 그대로 띄운다 */
export const Q_EMPTY = `/* books:empty */
select
  (select coalesce(json_agg(json_build_object('id', book_id, 'name', name, 'why', why)), '[]'::json)
     from v2.books_without_area())                                          as no_area,
  (select coalesce(json_agg(json_build_object('area', area, 'books', books)), '[]'::json)
     from v2.areas_without_routine())                                       as no_routine,
  (select count(*)::int from v2.books b
    where b.state <> 'stopped'
      and not exists (select 1 from v2.units u
                       where u.book_id = b.id and u.state = 'active'))      as books_no_units,
  (select count(*)::int from v2.units where state = 'hidden')               as units_hidden,
  (select count(*)::int from v2.learn_items where state = 'retired')        as items_retired,
  (select count(*)::int from v2.student_routine)                            as student_routine_rows,
  (select count(*)::int from v2.students where state = 'active')            as students_active,
  (select count(*)::int from v2.day_item where item_id is null)             as day_item_no_item`;

export const SQL = Object.freeze({
  books: Q_BOOKS, tree: Q_TREE, items: Q_ITEMS, areaRoutine: Q_AREA_ROUTINE,
  studentRoutine: Q_STUDENT_ROUTINE, materialType: Q_MATERIAL_TYPE, video: Q_VIDEO, empty: Q_EMPTY,
});

/* ══════════════════════════════════════════════════════════════════════
 * 읽기 — 한 번에 다 읽는다 (접기는 다시 조회하지 않는다)
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 이 화면이 그리는 것 전부.
 *
 * @param bookId 고른 교재 (없으면 단원 나무만 안 읽는다 — 조회가 하나 준다)
 * @returns 모든 목록 + `picks`(DB 가 정한 고르는 값) + `can`(쓸 수 있나)
 */
export async function loadAll(db, { bookId = null } = {}) {
  const books = (await db.query(Q_BOOKS, [])).rows;
  const tree = bookId ? (await db.query(Q_TREE, [bookId])).rows : [];
  const items = (await db.query(Q_ITEMS, [])).rows;
  const areaRoutine = (await db.query(Q_AREA_ROUTINE, [])).rows;
  const studentRoutine = (await db.query(Q_STUDENT_ROUTINE, [])).rows;
  const materialType = (await db.query(Q_MATERIAL_TYPE, [])).rows;
  const video = (await db.query(Q_VIDEO, [])).rows;
  const empty = (await db.query(Q_EMPTY, [])).rows[0] ?? {};

  // ⚠️ 고르는 값은 **DB 에서** 읽는다 (엑셀 규칙 6 · 원칙 1). 표마다 한 번씩 묻는다
  const picks = {};
  for (const t of PICK_TABLES) picks[t] = await loadPicks(db, t);
  // ⚠️ `video` 는 엑셀 표가 아니라 `loadPicks` 가 **안 받는다**(흰 목록 밖이라 던진다).
  //    그래서 이 한 칸만 이름표 목록을 그대로 쓴다 — 대신 `scripts/check-screen-books.mjs` 가
  //    **진짜 DB 의 CHECK 제약과 매번 견준다.** 갈리면 그날 검사가 빨개진다.
  picks.video = { state: Object.keys(LABEL.video_state) };

  return {
    today: books[0]?.today ?? null,
    can: books[0]?.can_write ?? {},
    books, tree, items, areaRoutine, studentRoutine, materialType, video, empty, picks,
  };
}

/**
 * 단원 줄들 → **대 › 중 › 소 세 겹.**
 * ⚠️ 중단원이 비어도 **겹을 없애지 않는다** — 세 겹 고정이라, 빈 자리는 「중단원 없음」으로 선다.
 *    겹을 지우면 어떤 교재는 두 겹, 어떤 교재는 세 겹이 되어 화면이 책마다 달라진다.
 * ⚠️ **이름을 여기서 짓지 않는다.** 줄 이름은 `v2.unit_label` 이 준 `label` 을 그대로 쓴다.
 */
export function treeOf(rows = []) {
  const out = [];
  for (const r of rows) {
    const chName = String(r.chapter ?? "");
    let ch = out[out.length - 1];
    if (!ch || ch.name !== chName) { ch = { name: chName, mids: [], n: 0, wb: 0, hidden: 0 }; out.push(ch); }
    const midName = String(r.mid ?? "").trim();
    let mid = ch.mids[ch.mids.length - 1];
    if (!mid || mid.raw !== midName) {
      mid = { raw: midName, name: midName || "중단원 없음", empty: !midName, subs: [] };
      ch.mids.push(mid);
    }
    mid.subs.push(r);
    ch.n++;
    if (r.is_workbook === true) ch.wb++;
    if (r.state === "hidden") ch.hidden++;
  }
  return out;
}

/** 영역마다 묶는다 — 루틴은 영역에 붙는다 (㉚) */
export function byArea(rows = []) {
  const m = new Map();
  for (const r of rows) {
    const k = r.area ?? "";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()];
}

/** 학생마다 묶는다 — 학생 루틴은 학생 × 영역이다 (㉒) */
export function byStudent(rows = []) {
  const m = new Map();
  for (const r of rows) {
    const k = r.student_id;
    if (!m.has(k)) m.set(k, { name: r.student_name, rows: [] });
    m.get(k).rows.push(r);
  }
  return [...m.values()];
}
