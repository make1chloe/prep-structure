"use client";
/** ▾ 카드 접기(목업 07 「오늘 접기」 · 확정-⑮ 「끝낸 것은 접고 개수만」 · (어2)) — 아이 07 · 학부모 09 · 대시보드 17 이 같은 조각을 쓴다.
 *  **접기는 다시 조회하지 않는다**(속도-1) — 누른 그 자리에서 카드에 data-folded 를 찍고(겉은 목업 CSS 가 감춘다), 저장은 뒤에서 조용히.
 *  실패해도 화면은 접힌 채 둔다 — 되돌리기 싼 것이고, 다음에 열면 저장된 대로 선다(대전제-6 「지우지 않는다」와 같은 결) */
import { useState, useTransition } from "react";
import { setPrefAct } from "./pref-actions.js";
export default function Fold({ screen, id, folded = false }) {
  const [on, setOn] = useState(folded); const [, start] = useTransition();
  const flip = (e) => {
    const next = !on; setOn(next);
    e.currentTarget.closest("[data-card]")?.setAttribute("data-folded", next ? "1" : "0");
    start(async () => { await setPrefAct(screen, { fold: { id, on: next } }); });
  };
  return <button type="button" className="btn sm gho fold" data-act="fold" data-card-id={id} aria-pressed={on} aria-label={on ? `${id} 펴기` : `${id} 접기`} title={on ? "펴기" : "접기"} onClick={flip}>{on ? "▸" : "▾"}</button>;
}
