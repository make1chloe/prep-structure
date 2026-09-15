/** 고르기 판단(순수 · (어28) · 대전제-20 · 원장님 2026-09-15 「모든 목록은 전체, 일부선택 ->선택후 일괄액션 가능해야함」).
 *  목록마다 줄 앞 네모 · 머리 「전체」 · 고르면 아래 띠에 「고른 N」과 한 번에 할 단추. 화면(app/_shell/pick.js)은 이 셈만 쓴다.
 *  고른 것은 화면 안에만 산다(새로고침하면 사라진다 · 저장 안 함) · 목록에 없는 아이디는 세지 않는다(줄이 사라지면 고른 것도 빠진다) */
export function togglePick(sel, id) { const n = new Set(sel ?? []); if (n.has(id)) n.delete(id); else n.add(id); return n; }
export const pickAll = (ids = [], on = true) => new Set(on ? ids : []);
/** 지금 목록(ids) 기준으로 센다 · 고른 것 중 목록에 있는 것만 · 전부인가 · 하나라도인가 */
export function pickState(sel, ids = []) {
  const on = (ids ?? []).filter((i) => sel?.has(i));
  return { ids: on, count: on.length, all: ids.length > 0 && on.length === ids.length, some: on.length > 0 && on.length < ids.length };
}
export const pickedText = (n, unit = "줄") => (n > 0 ? `고른 ${n}${unit}` : "");
/** 한 올린 기록(반 등)만 넣거나 뺀다((어31) · 원장님 2026-09-15 「반별 선택도 가능하게」) · 다른 고른 것은 그대로 · 원본은 안 건드린다 */
export function pickMany(sel, ids = [], on = true) { const n = new Set(sel ?? []); for (const id of ids ?? []) { if (on) n.add(id); else n.delete(id); } return n; }
