"use client";
/** 카드 순서(확정-⑮ 「카드 순서를 사람마다 저장(끌기 + ▲▼)」 — 여기서는 ▲▼ · 4단계-6) — 아이 07 · 학부모 09 · 대시보드 17 이 같은 조각을 쓴다. 저장하면 화면을 새로 읽어 그 차례로 선다 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPrefAct } from "./pref-actions.js";
import { moveId } from "@/lib/pref-plan";
export default function CardOrder({ screen, cards }) {   // cards = [{ id, name }] — 지금 그려진 차례
  const router = useRouter(); const [open, setOpen] = useState(false); const [ord, setOrd] = useState(cards.map((c) => c.id)); const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const name = (id) => cards.find((c) => c.id === id)?.name ?? id;
  const save = () => start(async () => { setErr(""); const r = await setPrefAct(screen, { order: ord }); if (!r.ok) { setErr(r.msg); return; } setOpen(false); router.refresh(); });
  return (<div className="wv" style={{ margin: "4px 0 8px", justifyContent: "flex-end" }} data-g="card-order">
    <button type="button" className="btn sm gho" data-act="order-open" aria-pressed={open} onClick={() => { setOrd(cards.map((c) => c.id)); setOpen(!open); }}>⇅ 카드 순서</button>
    {open && <div className="card" style={{ width: "100%", margin: 0 }} data-g="order-panel">
      {ord.map((id, i) => <div className="li" key={id} data-g="order-row" data-id={id}><div><b>{name(id)}</b></div><span className="wv" style={{ gap: 2, marginBottom: 0 }}>
        <button type="button" className="btn sm gho" disabled={pending || i === 0} data-act="order-up" aria-label={`${name(id)} 위로`} onClick={() => setOrd(moveId(ord, id, "up"))}>▲</button>
        <button type="button" className="btn sm gho" disabled={pending || i === ord.length - 1} data-act="order-down" aria-label={`${name(id)} 아래로`} onClick={() => setOrd(moveId(ord, id, "down"))}>▼</button></span></div>)}
      <div className="wv" style={{ marginTop: 6, marginBottom: 0 }}><button type="button" className="btn pri sm" disabled={pending} data-act="order-save" onClick={save}>저장</button><button type="button" className="btn sm" onClick={() => setOpen(false)}>닫기</button>{err && <span className="note" role="alert" style={{ margin: 0, color: "var(--miss)" }}>{err}</span>}</div>
    </div>}
  </div>);
}
