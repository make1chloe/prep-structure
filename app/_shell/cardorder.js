"use client";
/** 카드 순서(확정-⑮ 「카드 순서를 사람마다 저장(끌기 + ▲▼)」 · 4단계-6 · (어15) 끌기) — 아이 07 · 학부모 09 · 대시보드 17 · 오늘 01 · 학생 14 가 같은 조각을 쓴다. 저장하면 화면을 새로 읽어 그 차례로 선다.
 *  끌기는 pointer 이벤트 한 벌(마우스·손가락 같은 손 — HTML5 draggable 은 폰에서 안 된다 · 원장님 2026-09-14 「차례를 바꾸고 싶으면 드래그로 바꿀 수 있게」) — 손잡이 ⠿ 를 잡으면 setPointerCapture 로 줄 밖으로 나가도 따라오고,
 *  놓는 자리는 나머지 줄들의 세로 가운데로 잰다(lib/pref-plan dropIndex · reorder — 조각은 자리만 재고 셈은 순수) · 끌면 판이 그 자리에서 바뀌고 「저장」 이 적는다 · ▲▼ 는 그대로(키보드·정밀) */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPrefAct } from "./pref-actions.js";
import { moveId, reorder, dropIndex } from "@/lib/pref-plan";
export default function CardOrder({ screen, cards }) {   // cards = [{ id, name }] — 지금 그려진 차례
  const router = useRouter(); const [open, setOpen] = useState(false); const [ord, setOrd] = useState(cards.map((c) => c.id)); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [drag, setDrag] = useState(null);
  const name = (id) => cards.find((c) => c.id === id)?.name ?? id;
  const save = () => start(async () => { setErr(""); const r = await setPrefAct(screen, { order: ord }); if (!r.ok) { setErr(r.msg); return; } setOpen(false); router.refresh(); });
  const grab = (e, id) => { if (pending) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(id); };
  const follow = (e) => { if (!drag) return; const rows = [...e.currentTarget.closest("[data-g=order-panel]").querySelectorAll("[data-g=order-row]")].filter((r) => r.dataset.id !== drag); const mids = rows.map((r) => { const b = r.getBoundingClientRect(); return (b.top + b.bottom) / 2; }); const to = dropIndex(mids, e.clientY); setOrd((o) => reorder(o, drag, to)); };
  const drop = () => setDrag(null);
  return (<div className="wv" style={{ margin: "4px 0 8px", justifyContent: "flex-end" }} data-g="card-order">
    <button type="button" className="btn sm gho" data-act="order-open" aria-pressed={open} onClick={() => { setOrd(cards.map((c) => c.id)); setOpen(!open); }}>⇅ 카드 순서</button>
    {open && <div className="card" style={{ width: "100%", margin: 0 }} data-g="order-panel">
      {ord.map((id, i) => <div className="li" key={id} data-g="order-row" data-id={id} data-drag={drag === id ? "1" : "0"}>
        <span className="grip" data-g="order-grip" aria-hidden="true" onPointerDown={(e) => grab(e, id)} onPointerMove={follow} onPointerUp={drop} onPointerCancel={drop}>⠿</span>
        <div><b>{name(id)}</b></div><span className="wv" style={{ gap: 2, marginBottom: 0 }}>
        <button type="button" className="btn sm gho" disabled={pending || i === 0} data-act="order-up" aria-label={`${name(id)} 위로`} onClick={() => setOrd(moveId(ord, id, "up"))}>▲</button>
        <button type="button" className="btn sm gho" disabled={pending || i === ord.length - 1} data-act="order-down" aria-label={`${name(id)} 아래로`} onClick={() => setOrd(moveId(ord, id, "down"))}>▼</button></span></div>)}
      <div className="wv" style={{ marginTop: 6, marginBottom: 0 }}><button type="button" className="btn pri sm" disabled={pending} data-act="order-save" onClick={save}>저장</button><button type="button" className="btn sm" onClick={() => setOpen(false)}>닫기</button>{err && <span className="note" role="alert" style={{ margin: 0, color: "var(--miss)" }}>{err}</span>}</div>
    </div>}
  </div>);
}
