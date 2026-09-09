"use client";
/** (처) 대시보드 💬 「답하기」 — 남기실 말에 한 줄 답(request.answer · answered_at · state answered — lib/request.js answerRequest 한 벌). 아이 07 · 학부모 09 의 남기실 말 카드가 「답 — …」 로 보인다 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerAct } from "./answer-actions.js";
export default function Answer({ id }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [text, setText] = useState(""); const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const save = () => start(async () => { setErr(""); const r = await answerAct(id, text); if (!r.ok) { setErr(r.msg); return; } setOpen(false); router.refresh(); });
  return (<span className="wv" style={{ margin: 0, gap: 4 }} data-g="answer">
    <button type="button" className={"btn sm" + (open ? "" : " pri")} data-act="answer-open" aria-pressed={open} onClick={() => setOpen(!open)}>답하기</button>
    {open && <><input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="한 줄 답 (500자 안)" aria-label="답" name="answer" style={{ width: 220 }} />
      <button type="button" className="btn sm pri" disabled={pending || !text.trim()} data-act="answer-save" onClick={save}>보내기</button>
      {err && <span className="note" style={{ margin: 0, color: "var(--miss)" }}>{err}</span>}</>}
  </span>);
}
