"use client";
/** 고르기 조각 한 벌((어28) · 대전제-20) · 모든 목록이 같은 것을 쓴다: 줄 앞 네모(PickBox) · 머리 「전체」(PickAll) · 고르면 아래 띠(PickBar · 「고른 N」 + 한 번에 할 단추 + 비우기).
 *  셈은 lib/pick-plan(순수). 네모는 늘 보인다(대전제-16 · 「고르기」 단추 뒤에 숨기지 않는다) · 줄을 누르면 여는 목록에서는 네모 클릭이 줄 클릭으로 번지지 않는다 */
import { useMemo, useState } from "react";
import { togglePick, pickAll, pickMany, pickState, pickedText } from "@/lib/pick-plan";
export function usePick(ids = [], initial = []) {   // initial: 처음부터 고른 채 시작하는 것(10 발송의 마감한 판 · (어28)-⑤)
  const [sel, setSel] = useState(() => new Set(initial));
  const st = useMemo(() => pickState(sel, ids), [sel, ids]);
  return { ...st, has: (id) => sel.has(id), toggle: (id) => setSel((s) => togglePick(s, id)), setAll: (on) => setSel(pickAll(ids, on)), only: (id) => setSel(new Set([id])), clear: () => setSel(new Set()),
    setMany: (list, on) => setSel((s) => pickMany(s, list, on)), allOf: (list = []) => list.length > 0 && list.every((id) => sel.has(id)), someOf: (list = []) => list.some((id) => sel.has(id)) };   // 올린 기록(반 등) 하나만 넣고 빼기((어31))
}
const stop = (e) => e.stopPropagation();
export function PickAll({ pick, label = "전체", disabled = false }) {
  return <label className="ckl" onClick={stop}><input type="checkbox" className="ck all" data-g="pick-all" checked={pick.all} disabled={disabled} onChange={(e) => pick.setAll(e.target.checked)} />{label}</label>;
}
export function PickBox({ pick, id, label = "고르기", disabled = false }) {   // disabled: 마감·닫힌 줄 · 자리는 두되 못 고른다(줄이 안 밀린다)
  return <label className="ckl" onClick={stop}><input type="checkbox" className="ck" data-g="pick" checked={!disabled && pick.has(id)} disabled={disabled} aria-label={label} onChange={() => pick.toggle(id)} /></label>;
}
/** 올린 기록 머리의 네모(반 등 · (어31) · 원장님 「반별 선택도 가능하게」) · 그 올린 기록의 줄(ids)만 넣고 뺀다 · 다른 올린 기록에서 고른 것은 그대로 · 띠는 같은 띠 */
export function PickGroup({ pick, ids = [], label = "전체", disabled = false }) {
  return <label className="ckl" onClick={stop}><input type="checkbox" className="ck all" data-g="pick-group" checked={pick.allOf(ids)} disabled={disabled || !ids.length} onChange={(e) => pick.setMany(ids, e.target.checked)} />{label}</label>;
}
/** 띠 · 고른 것이 있을 때만. children 이 한 번에 할 단추들 */
export function PickBar({ pick, unit = "줄", children }) {
  if (!pick.count) return null;
  return <div className="savebar pickbar" data-g="pickbar" data-count={pick.count}><b data-g="picked">{pickedText(pick.count, unit)}</b>{children}<span className="spacer" /><button type="button" className="btn sm gho" data-act="pick-clear" onClick={pick.clear}>비우기</button></div>;
}
