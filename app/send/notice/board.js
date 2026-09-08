"use client";
/** 📢 공지 판(4단계-6) — 새 공지(제목 · 본문 · 받는 쪽 · 반 · 학교) → 📎 자료함에서 붙이기(보내기 전만 — 보낸 뒤에 붙이면 먼저 본 집은 못 본다, 목업 20) → 보내기(받는 쪽대로 기기 · 자취 notify_log) · 보낸 것은 읽음 a/b. 세는 것은 lib/notice-plan */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAct, attachAct, sendAct } from "./actions.js";
import { TO_ROLE, targetText, statusText, sendable, counts } from "@/lib/notice-plan";
const EMPTY = { title: "", body: "", to_role: "both", class_id: "", school_id: "" };
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, c = counts(b.notices ?? []);
  const [open, setOpen] = useState(false); const [f, setF] = useState(EMPTY); const [pick, setPick] = useState({});   // 공지 id → 붙일 파일 id
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head"><b style={{ fontSize: "var(--fs-5)" }}>📢 공지</b><span className={"pill" + (c.unsent ? " warn" : "")} data-g="unsent">안 보냄 {c.unsent}</span><span className="pill" data-g="sent">보냄 {c.sent}</span><span className="spacer" /><Link prefetch={false} className="btn sm" href="/send">📨 발송 ↗</Link><button type="button" className="btn pri sm" data-act="add-open" aria-pressed={open} onClick={() => setOpen(!open)}>+ 공지</button></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {open && <div className="card" data-g="add-form" style={{ marginBottom: 8 }}><div className="ctitle"><span className="cemo">＋</span>공지 — 제목 · 본문 · 받는 쪽 · 반/학교(비면 전체)</div>
      <div className="wv"><input value={f.title} aria-label="제목" placeholder="10월 휴강 안내" onChange={(x) => setF({ ...f, title: x.target.value })} style={{ flex: "1 1 240px" }} />
        <div className="seg sm" data-g="to-role">{TO_ROLE.map(([k, name]) => <button key={k} type="button" aria-pressed={f.to_role === k} onClick={() => setF({ ...f, to_role: k })}>{name}</button>)}</div>
        <select value={f.class_id} aria-label="반" onChange={(x) => setF({ ...f, class_id: x.target.value })} style={{ width: "auto" }}><option value="">반 전체</option>{(b.classes ?? []).map((x) => <option key={x.id} value={x.id}>{x.nickname ?? x.kind}</option>)}</select>
        <select value={f.school_id} aria-label="학교" onChange={(x) => setF({ ...f, school_id: x.target.value })} style={{ width: "auto" }}><option value="">학교 전체</option>{(b.schools ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
      <textarea value={f.body} aria-label="본문" placeholder="본문(선택) — 잠금화면엔 안 보이고 앱을 열어야 보입니다" rows={3} onChange={(x) => setF({ ...f, body: x.target.value })} style={{ width: "100%" }} />
      <div className="wv" style={{ marginTop: 6, marginBottom: 0 }}><button className="btn pri sm" type="button" disabled={pending || !f.title.trim()} data-act="add-save" onClick={() => run(() => addAct(f), "공지를 만들었습니다 — 📎 를 붙이고 보내세요", () => { setOpen(false); setF(EMPTY); })}>만들기</button><span className="note" style={{ margin: 0 }}>보내기 전에 붙입니다 — 보낸 뒤에 붙이면 먼저 본 집은 못 봅니다</span></div></div>}
    {!(b.notices ?? []).length && <div className="card" data-g="empty"><p className="note" style={{ margin: 0 }}>공지가 없습니다 — + 공지</p></div>}
    {(b.notices ?? []).map((n) => <div className="card" key={n.id} data-g="notice" data-notice={n.id} data-state={n.sent_at ? "sent" : "draft"} style={{ marginBottom: 8 }}>
      <div className="ctitle"><span className="cemo">📢</span><span data-g="title">{n.title}</span><span className="tag" data-g="target">{targetText(n)}</span><span className={"pill" + (n.sent_at ? " hw" : " warn")} data-g="status">{statusText(n)}</span></div>
      {n.body && <p className="note" style={{ whiteSpace: "pre-wrap", color: "var(--ink)" }}>{n.body}</p>}
      <div className="tags" data-g="files">{(n.files ?? []).map((x) => <a key={x.id} className="tag on" href={`/api/files/${x.id}`} target="_blank" rel="noreferrer" data-g="file">📎 {x.orig_name}</a>)}{!(n.files ?? []).length && <span className="note" style={{ margin: 0 }}>붙인 것 없음</span>}</div>
      {sendable(n) && <div className="wv" style={{ marginTop: 6, marginBottom: 0 }}>
        <select value={pick[n.id] ?? ""} aria-label={`${n.title} 붙일 자료`} data-g="attach-pick" style={{ width: "auto", maxWidth: 320 }} onChange={(e) => setPick({ ...pick, [n.id]: e.target.value })}><option value="">📎 자료함에서 붙이기</option>{(b.files ?? []).filter((x) => !(n.files ?? []).some((y) => y.id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.orig_name}</option>)}</select>
        <button className="btn sm" type="button" disabled={pending || !pick[n.id]} data-act="attach" onClick={() => run(() => attachAct(pick[n.id], n.id), "붙였습니다", () => setPick({ ...pick, [n.id]: "" }))}>붙이기</button>
        <span className="spacer" />
        <button className="btn pri sm" type="button" disabled={pending} data-act="send" onClick={() => { if (window.confirm(`「${n.title}」 — ${targetText(n)} · 대상 ${n.targets}명에게 보낼까요? 보낸 뒤엔 못 고치고 못 붙입니다.`)) run(() => sendAct(n.id), (r) => `${r.n}명에게 보냈습니다 — ${r.sink === "off" ? "🧪 리허설(off): 자취만 남고 실제로는 안 나갔습니다" : `보냄 ${r.sent} · 못 보냄 ${r.failed}`}`); }}>📨 보내기 · {n.targets}명</button></div>}
    </div>)}
  </>;
}
