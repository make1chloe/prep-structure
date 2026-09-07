/** 카드 순서(확정-⑮ 「카드 순서를 사람마다」 · screen_pref.layout = { order: [카드 id …] } · 4단계-6) — 순수 셈: 저장한 차례가 앞, 모르는 카드는 기본 차례 그대로 뒤에 · ▲▼ · 양식 읽기 */
export const SCREENS = Object.freeze({ me: "아이 화면", parent: "학부모 화면", dash: "대시보드" });
export function orderCards(cards = [], layout = null) {
  const saved = Array.isArray(layout?.order) ? layout.order : []; const idx = new Map(saved.map((id, i) => [id, i]));
  const key = (c, i) => (idx.has(c.id) ? idx.get(c.id) : saved.length + i);
  return cards.map((c, i) => ({ c, k: key(c, i) })).sort((a, b) => a.k - b.k).map((x) => x.c);
}
export function moveId(order = [], id, dir) { const a = [...order]; const i = a.indexOf(id); const j = i + (dir === "up" ? -1 : 1); if (i < 0 || j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }
export function parseLayout(f = {}) { const order = Array.isArray(f?.order) ? f.order.map((x) => String(x ?? "").trim()).filter((x, i, arr) => x && arr.indexOf(x) === i).slice(0, 40) : []; return { order }; }
