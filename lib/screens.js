/**
 * **카드 차례 — 판단 한 벌** (계획 ⑮ 1 · `v2.screen_pref`).
 *
 * 원장님 확정: 「모든 화면에서 카드를 끌어 순서를 바꾸고 그 순서가 유지되게.」
 * **학생 · 학부모 · 원장 세 화면에 같이 건다.**
 *
 * ── 왜 lib 인가
 *    같은 판단이 화면마다 따로 적혀 있었다(원칙 1) — `app/me/derive.js` 에 한 벌,
 *    `app/_home/parts.js` 안에 또 한 벌. 그리고 **둘이 달랐다.**
 *    대시보드 쪽은 저장값에서 **모르는 이름을 안 버려서**, 카드를 하나 없앤 날
 *    죽은 이름이 차례에 남아 `indexOf` 가 밀리고 맨 끝 카드의 ▼ 가 계속 눌린다.
 *    → 판단은 여기 한 벌. 화면은 받아 그리기만 한다.
 *
 * ── ⚠️ **나르는 길은 화면마다 다르다** — 여기 SQL 을 두지 않는다.
 *    대시보드는 서버 SQL(`writeAs`), `/me`·`/parent` 는 supabase-js 를 쓴다.
 *    한 벌로 묶어야 하는 것은 **판단**이지 붙는 방식이 아니다.
 *
 * ── ⚠️ **대가**(계획 ⑮ 1) — 차례가 집집마다 다르므로 안내 글에서
 *    「세 번째 칸을 보세요」를 **못 쓴다.** 이름으로 가리켜야 한다.
 *
 * ── ⚠️⚠️ **여기는 「차례」만 본다 — 「열림」은 `lib/perm.js` 의 `visibleCards()` 다.**
 *    (원장님 2026-09-03: 역할마다 어느 카드를 여는지는 원장님이 화면에서 정하신다.)
 *    두 가지는 **다른 일**이고 **섞지 않는다.** 부르는 차례도 정해져 있다 —
 *    **`applyOrder()` 를 먼저 입히고, 그다음 `visibleCards()` 로 거른다.**
 *    거꾸로 하면 무엇이 터지나: 꺼진 카드가 차례 목록에서 빠진 채로 저장되어,
 *    원장님이 다시 켜신 날 그 카드가 **맨 뒤로 밀린다**(applyOrder 가 빠진 이름을 뒤에 붙이므로).
 *    한 함수에 섞으면 「차례를 저장했는데 꺼진 카드가 되살아난다」도 같이 생긴다.
 */

/** 화면 이름 = `v2.screen_pref.screen` 의 값. 화면이 이 글자를 따로 적지 않는다 */
export const SCREENS = Object.freeze({ home: "home", me: "me", parent: "parent" });

/**
 * 화면마다 **있는 카드 전부**. 저장값은 이 목록으로 걸러진다.
 * ⚠️ 카드를 더하거나 없앨 때 **여기만** 고친다. 화면에 목록을 다시 적으면 두 벌이다.
 */
export const CARDS = Object.freeze({
  // 대시보드 — app/page.js 의 `ids`
  home:   Object.freeze(["waiting", "sheets", "sessions", "books", "fee", "todos"]),
  // 학생 — app/me/derive.js 의 `카드들`
  // ⚠️ 등원·하원이 맨 위다 — 학원에 와서 **가장 먼저** 누르는 것이다 (0083)
  me:     Object.freeze(["arrival", "today", "books", "flags"]),
  // 학부모 — app/parent/view.js 의 <Card> 여덟
  parent: Object.freeze(["intro", "recent", "homework", "next", "files", "word", "reports", "sent"]),
});

/** 그 화면에 있는 카드 목록 — 모르는 화면이면 빈 목록(카드를 지어내지 않는다) */
export const cardsOf = (screen) => CARDS[screen] ?? [];

/**
 * 저장해 둔 차례를 입힌다.
 *
 * ⚠️ **저장값을 믿지 않는다.** 카드를 하나 더 만든 날 저장값에는 그 이름이 없고,
 *    하나 없앤 날에는 죽은 이름이 남아 있다.
 *    → 모르는 이름은 **버리고**, 빠진 이름은 기본 차례로 **뒤에 붙인다.**
 *    그래야 카드가 사라지지도, 죽은 자리가 생기지도 않는다.
 */
export function applyOrder(saved, cards = []) {
  const 기본 = [...cards];
  const 목록 = Array.isArray(saved) ? saved.map(String) : [];
  const 살아있는 = 목록.filter((k) => 기본.includes(k));
  const 남은 = 기본.filter((k) => !살아있는.includes(k));
  return [...new Set([...살아있는, ...남은])];
}

/**
 * ▲▼ 한 칸 옮기기.
 * ⚠️ 끝에서 더 밀면 **그대로 둔다** — 고리처럼 돌면 카드가 어디로 갔는지 못 찾는다.
 */
export function moveOne(order = [], key, dir) {
  const i = order.indexOf(key);
  const j = i + (dir === "up" ? -1 : 1);
  if (i < 0 || j < 0 || j >= order.length) return order;
  const 새 = [...order];
  새[i] = 새[j];
  새[j] = key;
  return 새;
}

/** 끌어다 놓기 — `from` 을 빼서 `to` 자리에 끼운다 */
export function moveTo(order = [], from, to) {
  const i = order.indexOf(from), j = order.indexOf(to);
  if (i < 0 || j < 0 || i === j) return order;
  const 새 = [...order];
  새.splice(i, 1);
  새.splice(j, 0, from);
  return 새;
}

/** ▲ 가 눌리나 (맨 위면 안 눌린다) */
export const canUp = (order = [], key) => order.indexOf(key) > 0;
/** ▼ 가 눌리나 — ⚠️ **`order` 길이로 본다.** 카드 목록 길이로 보면 죽은 이름이 섞였을 때 어긋난다 */
export const canDown = (order = [], key) => {
  const i = order.indexOf(key);
  return i >= 0 && i < order.length - 1;
};

/**
 * 저장하기 전에 거른다. **빈 차례는 저장하지 않는다** —
 * 저장해 버리면 그 사람 화면이 다음에 열릴 때 기본 차례로 돌아가 「바뀐 줄 알았는데」가 된다.
 * @returns { ok:true, order } | { ok:false, why }
 */
export function orderToSave(order, screen) {
  const 기본 = cardsOf(screen);
  if (!기본.length) return { ok: false, why: `모르는 화면이다 — ${screen}` };
  // ⚠️ **들어온 것**을 먼저 본다. applyOrder 가 빠진 것을 채워 주므로,
  //    뒤에서 보면 빈 차례가 기본 차례로 채워져 **그냥 통과한다** — 부른 쪽의 잘못이 숨는다.
  if (!Array.isArray(order) || !order.length) return { ok: false, why: "⚠️ 빈 차례는 저장하지 않는다" };
  const 새 = applyOrder(order, 기본);
  if (!새.length) return { ok: false, why: "⚠️ 아는 카드가 하나도 없다 — 저장하지 않는다" };
  return { ok: true, order: 새 };
}

/** `v2.screen_pref.layout` 에서 차례를 꺼낸다. 꼴이 다르면 **빈 것으로 본다**(터지지 않는다) */
export const orderInLayout = (layout) =>
  Array.isArray(layout?.order) ? layout.order.map(String) : [];
