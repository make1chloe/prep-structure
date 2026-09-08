"use client";
/** 한 번 더 묻기 — alert/confirm 대신 화면 안에서(대전제-10 · 검사-④ · 목업 01 의 「그대로 보낼까요?」 줄과 같은 꼴 .lf.warn). 첫 누름은 물음 줄을 펴고, 그 줄의 「예」가 진짜 실행 · 「아니요」는 접는다.
 *  막지 않는다 — 저장 중에도 「아니요」는 산다(대전제-10 「저장 중이라고 닫기를 잠그지 않는다」). 이 부품 하나(원칙-1) — check-dom 이 data-act="sure-yes" 가 여기뿐인지 잰다 */
import { useState } from "react";
export function useSure() { const [key, setKey] = useState(null); return { is: (k) => key === k, ask: (k) => setKey(k), off: () => setKey(null) }; }
export default function Sure({ on, text, yes = "예", pending = false, onYes, onNo, style }) {
  if (!on) return null;
  return <div className="lf warn" data-g="sure" role="status" style={{ margin: "8px 0 0", ...(style ?? {}) }}><span className="ln">?</span><div><b>{text}</b></div>
    <button className="btn sm pri" type="button" data-act="sure-yes" disabled={pending} onClick={onYes}>{yes}</button>
    <button className="btn sm" type="button" data-act="sure-no" onClick={onNo}>아니요</button></div>;
}
