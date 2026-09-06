"use client";
/** 💬 남기실 말 — 아이·학부모가 같은 카드. 보내는 손(서버 액션)만 다르다 */
import { useState, useTransition } from "react";
export default function AskCard({ asks = [], send, title = "선생님께 남기실 말", placeholder = "예: 다음 주 수요일 병원이라 늦어요", note = null }) {
  const [text, setText] = useState(""); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const go = () => start(async () => { setErr(""); const r = await send(text); if (r.ok) setText(""); else setErr(r.msg); });
  return (
    <div className="task" data-card="ask">
      <div className="h"><b><span className="cemo">💬</span>{title}</b><span className="spacer" />{asks.length > 0 && <span className="pill">{asks.length}</span>}</div>
      {note && <p className="note k" style={{ margin: "4px 0 8px" }}>{note}</p>}
      <textarea name="ask" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} style={{ marginTop: 8 }} />
      <div className="wv" style={{ marginTop: 4, marginBottom: 0 }}><button type="button" className="btn sm pri" data-act="ask" disabled={pending || !text.trim()} onClick={go}>보내기</button><span className="note" style={{ margin: 0 }}>원장님 대시보드 「답할 것」에 뜹니다</span></div>
      {asks.map((a) => <div className="li" key={a.id}><div><b>{a.body}</b><small>{a.answered_at ? `답 — ${a.answer ?? ""}` : "답 기다리는 중"}</small></div>{!a.answered_at && <span className="tag">보냄</span>}</div>)}
      {err && <div className="lf warn" role="alert" style={{ marginTop: 8 }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
    </div>
  );
}
