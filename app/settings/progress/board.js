"use client";
/** 진도 체크 열기 판(목업 08 「원장님 쪽 — 같은 자리에서 보입니다」) — 열기(학원 전체 · 아이마다) · 아이가 찍은 것 — 확인 안 함 N(한 번에 확인 · 줄마다 확인/되돌리기) · 아이가 단 ❗ — 안 본 것 N(아직 안 함으로 · 끝냄으로 · 그대로 둠). 세는 것은 lib/road-plan 한 벌 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { academyAct, studentEditAct, confirmAct, revertAct, confirmAllAct, flagAct } from "./actions.js";
import { pendingText, daysOpenText, staffFlagLine, EDIT_MODE, editModeName } from "@/lib/road-plan";
import { md } from "@/lib/dash-plan";
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date, edit = b.edit ?? {}, students = b.students ?? [], rows = b.pending ?? [], flags = (b.flags ?? []).map(staffFlagLine);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  const ptext = pendingText(students);
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head"><span className="pill" style={{ fontWeight: 700 }} data-g="open-pill">{edit.is_open ? `✎ 열림 · ${daysOpenText(edit.opened_on, today)}` : "✎ 닫힘"}</span><span className={"pill" + (rows.length ? " warn" : "")} data-g="pending-count">아이가 찍은 것 {rows.length}</span><span className={"pill" + (flags.length ? " warn" : "")} data-g="flag-count">❗ {flags.length}</span><span className="spacer" /><a className="btn sm" href="/settings">⚙️ 설정 ↗</a><a className="btn sm" href="/today">📋 오늘 수업(02b 진도 체크) ↗</a></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <div className="lf warn" data-g="pending-band"><span className="ln">{rows.length}</span><div><b>아이가 찍은 것 — 확인 안 함</b><small>{ptext || "없음"} — 아이 화면 08 에는 <b>노란 테두리</b>로 뜹니다 · 확인하면 굳고, 되돌리면 「아직」으로</small></div>
      <span className="lm">한 번에</span><button className="btn sm pri" type="button" disabled={pending || !rows.length} data-act="confirm-all" onClick={() => run(() => confirmAllAct(null), (r) => `확인했습니다 — ${r.confirmed}줄`)}>확인</button></div>
    {rows.length > 0 && <div className="left" data-g="pending-list">{rows.map((p) => <div className="lf" key={`${p.student_id}|${p.unit_id}|${p.round}`} data-g="pending-row" data-status={p.status}><span className="ln">{p.status === "done" ? "○" : p.status === "doing" ? "◐" : "·"}</span><div><b>{p.student} · {p.book} › {p.chapter} › {p.short}</b><small>{p.round}회독 · {md(p.marked_on)} 찍음 · {p.status === "done" ? "끝냄" : p.status === "doing" ? "하는 중" : "아직"}</small></div>
      <button className="btn sm pri" type="button" disabled={pending} data-act="confirm" onClick={() => run(() => confirmAct(p.student_id, p.unit_id, p.round), `${p.student} — 확인했습니다`)}>확인</button><button className="btn sm" type="button" disabled={pending} data-act="revert" onClick={() => run(() => revertAct(p.student_id, p.unit_id, p.round), `${p.student} — 되돌렸습니다(아직)`)}>되돌리기</button></div>)}</div>}
    <div className="exr" style={{ borderColor: "var(--amber)", marginTop: 8 }} data-g="flags">
      <div className="exh"><span className="ai">❗</span><b>아이가 단 ❗ — 안 본 것 {flags.length}</b><span className="spacer" /><span className="pill">진도는 <b>안 바뀝니다</b> — 원장님이 고르실 때만</span></div>
      <div className="left">{!flags.length && <p className="note" style={{ margin: 0 }}>없습니다</p>}
        {flags.map((f, i) => <div className="lf" key={f.id} data-g="flag-row"><span className="ln">{i + 1}</span><div><b>{f.title}</b><small><i className="ic">❗</i> {f.small}{f.said && f.action ? ` · 「${f.said}」` : ""}</small></div>
          {f.action && <button className="btn sm pri" type="button" disabled={pending} data-act="flag-change" onClick={() => run(() => flagAct(f.id, f.action.status), `${f.action.label} 바꿨습니다`)}>{f.action.label}</button>}
          <button className="btn sm" type="button" disabled={pending} data-act="flag-keep" onClick={() => run(() => flagAct(f.id, null), "그대로 두었습니다")}>그대로 둠</button></div>)}</div>
    </div>
    <div className="exr" style={{ marginTop: 8 }} data-g="edit">
      <div className="exh"><span className="ai">✎</span><b>진도 체크 열기</b>{edit.is_open && <span className="tag act" data-g="days-open">{daysOpenText(edit.opened_on, today)}</span>}<span className="spacer" /><span className="pill" data-g="opened-on">{edit.is_open && edit.opened_on ? `${md(edit.opened_on)}에 켬` : "닫혀 있음"}</span></div>
      <div className="left">
        <div className="lf ok" data-g="academy"><span className="ln">🏫</span><div><b>학원 전체</b><small>기본값 — 아래에서 안 고친 아이는 이걸 따라갑니다 · 날짜로 저절로 안 닫힙니다(원장님 9/2) — 「N일째」가 알려 줍니다</small></div>
          <div className="seg sm" data-g="academy-seg"><button type="button" aria-pressed={!edit.is_open} disabled={pending} onClick={() => edit.is_open && run(() => academyAct(false), "닫았습니다 — 아이가 못 찍습니다")}>끔</button><button type="button" aria-pressed={Boolean(edit.is_open)} disabled={pending} onClick={() => !edit.is_open && run(() => academyAct(true), "열었습니다 — 아이가 소단원마다 찍습니다(확인 기다리는 중으로)")}>켬</button></div></div>
        {students.map((s, i) => <div className="lf" key={s.id} data-g="student-edit" data-student={s.id} data-mode={s.progress_edit}><span className="ln">{i + 1}</span><div><b>{s.name}</b><small>{s.progress_edit === "follow" ? `학원 따라감 — ${edit.is_open ? "열림" : "닫힘"}` : s.progress_edit === "off" ? "이 아이만 껐습니다" : "이 아이만 켰습니다"}{s.pending ? ` · 확인 안 함 ${s.pending}` : ""}{s.flags ? ` · ❗ ${s.flags}` : ""}</small></div>
          <div className="seg sm" data-g="student-seg">{EDIT_MODE.map(([k]) => <button key={k} type="button" aria-pressed={s.progress_edit === k} disabled={pending} onClick={() => s.progress_edit !== k && run(() => studentEditAct(s.id, k), `${s.name} — ${editModeName(k)}`)}>{editModeName(k)}</button>)}</div></div>)}
      </div>
    </div>
  </>;
}
