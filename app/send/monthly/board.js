"use client";
/** 월간 리포트 판(4단계-2b) — 달 고르기 · 아이마다 숫자 줄(마감한 판만) · 덧붙일 한마디(손 떼면 저장 · 보낸 달은 잠김) · 📨 보내기(하나 · 안 보낸 아이 모두). 되돌릴 수 없는 보내기는 서버 답을 기다린다(속도-5) */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bodyAct, sendAct, scheduleAct } from "./actions.js";
import When, { customOf } from "../when.js";   // ⏰ 예약 때 고르기 — 발송 10 과 같은 부품((어))
import { whenLabel } from "@/lib/send-plan";
import { reportLines, reportSummary, sendable, sentText, ymLabel } from "@/lib/report-plan";
import { nextYm } from "@/lib/schedule-plan";
export default function Board({ d }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [when, setWhen] = useState("evening"); const [cDate, setCDate] = useState(d.today); const [cTime, setCTime] = useState("18:00");   // ⏰ 예약 때((어))
  const schedMsg = (r) => `예약했습니다 — ${r.n}명 · ${whenLabel(r.at, d.today)}`;
  const run = (fn, okMsg) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); router.refresh(); });
  const sinkText = (r) => (r.sink === "off" ? "🧪 리허설(off): 자취만 남고 실제로는 안 나갔습니다" : `보냄 ${r.sent} · 못 보냄 ${r.failed}`);
  const todo = sendable(d.rows), sentN = d.rows.filter((r) => r.report?.sent_at).length;
  return (<>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <Link prefetch={false} className="btn sm gho" href="/send">← 발송</Link>
      <Link prefetch={false} className="btn sm" href={`/send/monthly?m=${nextYm(d.ym, -1)}`} aria-label="지난 달">◂</Link><b style={{ fontSize: "var(--fs-5)" }} data-g="month">{ymLabel(d.ym)} 리포트</b><Link prefetch={false} className="btn sm" href={`/send/monthly?m=${nextYm(d.ym, 1)}`} aria-label="다음 달">▸</Link>
      <span className="pill" data-g="sent-count">보냄 {sentN}</span><span className={"pill" + (todo.length ? " warn" : "")} data-g="todo-count">안 보냄 {todo.length}</span>
      <span className="spacer" />
      <button type="button" className="btn sm pri" disabled={pending || !todo.length} data-act="send-all" onClick={() => run(() => sendAct(d.ym, null), (r) => `${r.n}명에게 월간 리포트 — ${sinkText(r)}`)}>📨 안 보낸 아이 모두 보내기</button>
      <button type="button" className="btn sm" disabled={pending || !todo.length} data-act="schedule-all" onClick={() => run(() => scheduleAct(d.ym, todo.map((r) => r.student_id), when, customOf(when, cDate, cTime)), schedMsg)}>⏰ 안 보낸 아이 모두 예약</button>
      <When rules={d.rules} date={d.today} when={when} setWhen={setWhen} cDate={cDate} setCDate={setCDate} cTime={cTime} setCTime={setCTime} />
    </div>
    <p className="note" style={{ margin: "0 0 8px" }}>숫자는 <b>마감한 판만</b> 셉니다 — 학부모 화면과 같은 숫자입니다. 보내면 그때 숫자를 굳혀 두어 나중에 판을 고쳐도 학부모가 본 숫자는 안 바뀝니다. 한마디는 손을 떼면 저장됩니다.</p>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {!d.rows.length && <div className="card"><p className="note">재원생이 없습니다</p></div>}
    {d.rows.map((r) => { const sent = Boolean(r.report?.sent_at), lines = reportLines(sent ? (r.report.frozen ?? r.numbers) : r.numbers); return (
      <div className="card" key={r.student_id} style={{ margin: "0 0 8px" }} data-g="report-row" data-student={r.student_id} data-state={sent ? "sent" : r.numbers?.closed_days ? "ready" : "empty"}>
        <div className="ctitle"><span className="cemo">🧑‍🎓</span>{r.name}{r.school || r.grade ? <span className="auto">{[r.school, r.grade ? `${r.grade}학년` : null].filter(Boolean).join(" · ")}</span> : null}
          <span className="spacer" /><span className="pill" data-g="summary">{reportSummary(sent ? (r.report.frozen ?? r.numbers) : r.numbers)}</span><span className={"pill" + (sent ? " hw" : r.numbers?.closed_days ? " warn" : "")} data-g="sent">{sentText(r)}</span></div>
        <div className="tags" style={{ margin: "6px 0" }} data-g="lines">{lines.map((l) => <span className="tag" key={l.key}>{l.text}</span>)}{!r.parents && <span className="tag act">학부모 계정 없음 — 알림이 ✕ 로 남습니다</span>}</div>
        <div className="wv" style={{ marginBottom: 0 }}>
          <textarea rows={2} defaultValue={r.report?.body ?? ""} placeholder="덧붙일 한마디 — 이 달 어땠나, 다음 달엔 무엇을(학부모에게 그대로 나갑니다)" aria-label={`${r.name} 한마디`} disabled={pending || sent} style={{ flex: "1 1 320px" }} onBlur={(e) => { if ((e.target.value ?? "").trim() !== (r.report?.body ?? "").trim()) run(() => bodyAct(r.student_id, d.ym, e.target.value), "한마디를 적었습니다"); }} />
          <button type="button" className="btn sm pri" disabled={pending || sent || !r.numbers?.closed_days} data-act="send-one" onClick={() => run(() => sendAct(d.ym, [r.student_id]), (r2) => `${r2.n}명에게 월간 리포트 — ${sinkText(r2)}`)}>📨 보내기</button>
          <button type="button" className="btn sm" disabled={pending || sent || !r.numbers?.closed_days} data-act="schedule-one" onClick={() => run(() => scheduleAct(d.ym, [r.student_id], when, customOf(when, cDate, cTime)), schedMsg)}>⏰ 예약</button>
        </div>
      </div>); })}
  </>);
}
