/** 카드 순서·접기(확정-⑮ 「카드 순서를 사람마다 · 끝낸 것은 접고 개수만」 · screen_pref.layout = { order: [카드 id …], folded: [카드 id …] } · 4단계-6 · (어2))
 *  순수 셈: 저장한 차례가 앞, 모르는 카드는 기본 차례 그대로 뒤에 · ▲▼ · 접기 뒤집기 · 양식 읽기(부분만 보내도 나머지는 그대로 — applyPatch) */
export const SCREENS = Object.freeze({ me: "아이 화면", parent: "학부모 화면", dash: "대시보드", today: "오늘 수업", student: "학생" });   // (어15) 01 판 · 14 학생도 — 표는 그대로(screen 은 글자 칸)
export function orderCards(cards = [], layout = null) {
  const saved = Array.isArray(layout?.order) ? layout.order : []; const idx = new Map(saved.map((id, i) => [id, i]));
  const key = (c, i) => (idx.has(c.id) ? idx.get(c.id) : saved.length + i);
  return cards.map((c, i) => ({ c, k: key(c, i) })).sort((a, b) => a.k - b.k).map((x) => x.c);
}
/** 끌어 놓기((어15) 원장님 9/14 「차례를 바꾸고 싶으면 드래그로 바꿀 수 있게」) — id 를 빼고 to 자리에 넣는다(to 는 「나머지 줄」 사이의 자리 · 끝을 넘으면 끝 · 모르는 id 면 그대로) */
export function reorder(order = [], id, to) { const a = order.filter((x) => x !== id); if (a.length === order.length) return [...order]; a.splice(Math.max(0, Math.min(Number(to) || 0, a.length)), 0, id); return a; }
/** 놓는 자리 — 잡은 줄을 뺀 나머지 줄들의 세로 가운데(mids · 위에서 아래)가 손가락(y)보다 위에 있는 줄 수. 줄 사이 어디에 놓든 흔들리지 않는다(잡은 줄 제 자리는 안 센다) */
export const dropIndex = (mids = [], y) => mids.filter((m) => m < y).length;
export function moveId(order = [], id, dir) { const a = [...order]; const i = a.indexOf(id); const j = i + (dir === "up" ? -1 : 1); if (i < 0 || j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }
const list = (a) => (Array.isArray(a) ? a.map((x) => String(x ?? "").trim()).filter((x, i, arr) => x && arr.indexOf(x) === i).slice(0, 40) : []);
export function parseLayout(f = {}) { return { order: list(f?.order), folded: list(f?.folded) }; }
/** 접힌 카드 — 화면이 물어보는 자리 한 곳 */
export const foldedOf = (layout) => new Set(list(layout?.folded));
/** 하나만 뒤집는다 — 접기 단추는 제 id 만 알면 된다(차례는 모른다) */
export function toggleFold(folded = [], id, on) { const s = new Set(list(folded)); if (on) s.add(String(id)); else s.delete(String(id)); return [...s]; }
/** 부분만 보내도 나머지는 그대로 — ⇅ 는 order 만, ▾ 는 fold 하나만 보낸다. 한쪽이 다른 쪽을 지우면 안 된다 */
export function applyPatch(prev = {}, patch = {}) {
  const base = parseLayout(prev);
  if (patch?.fold?.id) return { ...base, folded: toggleFold(base.folded, patch.fold.id, Boolean(patch.fold.on)) };
  return parseLayout({ order: Array.isArray(patch?.order) ? patch.order : base.order, folded: Array.isArray(patch?.folded) ? patch.folded : base.folded });
}
