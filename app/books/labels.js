/**
 * 값 → **한글 이름표**. 서버 쪽(`read.js`)과 누르는 쪽(`ui.js`)이 **같은 한 벌**을 본다 —
 * 두 곳에 각각 적으면 이름이 갈린다 (원칙 1).
 *
 * ⚠️⚠️ **여기는 값을 정하는 자리가 아니다.** 값은 DB 의 CHECK 제약이 정하고,
 *    화면은 `lib/excel.js` 의 `loadPicks()` 로 **DB 에서 읽어** 고르는 칸을 만든다.
 *    여기 있는 것은 그 값을 뭐라고 부를지뿐이다 —
 *    `scripts/check-screen-books.mjs` 가 **진짜 DB 제약과 견주어** 빠진 이름을 잡는다.
 *    (계획 「실제로 난 사고 둘」 — 교시 설정은 3교시인데 출결 화면만 1~10교시가 떴다.
 *     고르는 값을 화면에 두 벌로 적지 않는다.)
 *
 * ⚠️ 「대단원 기준 / 소단원 기준」은 계획 ㉙ 에서 원장님이 **확정한 이름**이다.
 *    앞서 쓰던 「묶어서 / 나란히」로 되돌리지 마라.
 */
import { STOP } from "../../lib/routine.js";

export const LABEL = Object.freeze({
  chunk_depth: Object.freeze({ chapter: "대단원", mid: "중단원", sub: "소단원" }),
  order_basis: Object.freeze({ chapter: "대단원 기준", sub: "소단원 기준" }),
  books_state: Object.freeze({ active: "쓰는 중", paused: "쉬는 중", stopped: "내림" }),
  units_state: Object.freeze({ active: "쓰는 중", hidden: "내림" }),
  learn_items_state: Object.freeze({ active: "쓰는 중", retired: "내림" }),
  material_type_state: Object.freeze({ active: "쓰는 중", retired: "내림" }),
  video_state: Object.freeze({ active: "쓰는 중", hidden: "내림" }),
  place: Object.freeze({ class: "학원", home: "숙제", both: "학원+숙제", next: "예습" }),
  // ⚠️ 멈춤 세 낱말의 **값**은 `lib/routine.js` 것이다. 여기서 글자를 새로 적지 않는다 (⑬)
  stop: Object.freeze({ [STOP.RUNNING]: "돌아감", [STOP.HW_OFF]: "숙제멈춤", [STOP.BOOK_OFF]: "교재멈춤" }),
});

/** 값을 이름으로 — **모르는 값은 지어내지 않고 값 그대로 보여 준다** (대전제 0) */
export const nameOf = (key, v) => LABEL[key]?.[String(v ?? "")] ?? String(v ?? "");

/** 어느 이름표가 어느 표·칸을 덮나 — 검사가 이 표를 들고 진짜 DB 제약과 견준다 */
export const LABEL_FOR = Object.freeze([
  ["books", "chunk_depth", "chunk_depth"],
  ["books", "order_basis", "order_basis"],
  ["books", "state", "books_state"],
  ["units", "state", "units_state"],
  ["learn_items", "state", "learn_items_state"],
  ["material_type", "state", "material_type_state"],
  ["video", "state", "video_state"],
  ["area_routine", "place", "place"],
  ["student_book", "stop_mode", "stop"],
]);

/** `lib/excel.js` 의 `loadPicks` 가 받는 표 — 흰 목록 밖(`video`)은 안 받는다 */
export const PICK_TABLES = Object.freeze(["books", "units", "learn_items", "area_routine", "material_type"]);
