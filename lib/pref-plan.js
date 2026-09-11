/** 카드 순서·접기(확정-⑮ 「카드 순서를 사람마다 · 끝낸 것은 접고 개수만」 · screen_pref.layout = { order: [카드 id …], folded: [카드 id …] } · 4단계-6 · (어2))
 *  순수 셈: 저장한 차례가 앞, 모르는 카드는 기본 차례 그대로 뒤에 · ▲▼ · 접기 뒤집기 · 양식 읽기(부분만 보내도 나머지는 그대로 — applyPatch) */
export const SCREENS = Object.freeze({ me: "아이 화면", parent: "학부모 화면", dash: "대시보드" });
export function orderCards(cards = [], layout = null) {
  const saved = Array.isArray(layout?.order) ? layout.order : []; const idx = new Map(saved.map((id, i) => [id, i]));
  const key = (c, i) => (idx.has(c.id) ? idx.get(c.id) : saved.length + i);
  return cards.map((c, i) => ({ c, k: key(c, i) })).sort((a, b) => a.k - b.k).map((x) => x.c);
}
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
