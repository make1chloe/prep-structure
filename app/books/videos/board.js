"use client";
/** 영상 배정 판(목업 19 오른쪽) — 머리(안 본 아이 N · + 영상 · ← 교재) · + 영상 양식(제목 · 유튜브 주소 · 폴더 · 길이) · 영상 카드(아이마다 막대와 상태 · 마감 · 📨 재촉 · 마감 미루기 · + 배정 · 내리기). 세는 것은 화면이 센다(원칙-5) */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAct, setAct, assignAct, postponeAct, retireAct, remindAct } from "./actions.js";
import { statusOf, counts, mmss, dueText, opensText, groupByFolder, folders } from "@/lib/video-plan";
import { md, seoulDate } from "@/lib/dash-plan";
const fillColor = (s) => (s.key === "done" ? "var(--ok)" : s.key === "part" ? "var(--weak)" : "var(--miss)");
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date, cut = Number(b.rules?.["video.done_pct"] ?? 95);
  const [adding, setAdding] = useState(false); const [nv, setNv] = useState({ title: "", url: "", folder: "", length: "" }); const [assignFor, setAssignFor] = useState(null); const [picked, setPicked] = useState([]); const [due, setDue] = useState(""); const [post, setPost] = useState({}); const [showHidden, setShowHidden] = useState(false);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(r); router.refresh(); });
  const live = (b.videos ?? []).filter((v) => v.state === "active"), hidden = (b.videos ?? []).filter((v) => v.state !== "active");
  const unwatched = live.reduce((n, v) => n + counts(v.assigns, cut).unwatched, 0);
  const Video = ({ v }) => { const c = counts(v.assigns, cut), rows = (v.assigns ?? []).filter((a) => a.state !== "retired"); return (
    <div className="card" style={{ margin: "0 0 8px" }} data-g="video" data-video={v.id} data-state={v.state}>
      <div className="ctitle"><span className="cemo">🎬</span><span data-g="title">{v.title}</span> · <span data-g="len">{v.seconds ? mmss(v.seconds) : "길이 아직(아이 폰이 처음 알려 줍니다)"}</span>{v.folder && <span className="tag" style={{ marginLeft: 6 }}>📁 {v.folder}</span>}<span className="spacer" /><a className="btn sm gho" href={v.url} target="_blank" rel="noreferrer">유튜브 ↗</a>
        {v.state === "active" ? <button type="button" className="btn sm gho" disabled={pending} data-act="hide" onClick={() => run(() => setAct(v.id, { state: "hidden" }), "내렸습니다(지우지 않습니다)")}>내리기</button> : <button type="button" className="btn sm" disabled={pending} data-act="unhide" onClick={() => run(() => setAct(v.id, { state: "active" }), "되살렸습니다")}>되살리기</button>}</div>
      {!rows.length && <p className="note" style={{ margin: "4px 0" }}>배정한 아이가 없습니다 — + 배정</p>}
      {rows.map((a) => { const s = statusOf(a, cut); return <div className="vrow" key={a.id} data-g="vrow" data-student={a.student_id} data-status={s.key}><span className="vn">{a.student_name}</span><div className="bar"><div className="fill" style={{ width: `${s.key === "done" ? 100 : a.pct ?? 0}%`, background: fillColor(s) }} /></div><span className="bkv" style={{ color: s.key === "none" ? "var(--miss)" : undefined }} data-g="bkv">{s.text}</span>
        <small className="note" style={{ margin: 0 }}>{a.due_on ? dueText(a.due_on, today) : "마감 없음"}{a.done_at ? ` · ${md(seoulDate(a.done_at))} 다 봄` : ""}{opensText(a.opens) ? ` · ${opensText(a.opens)}` : ""}</small><button type="button" className="btn sm gho" disabled={pending} data-act="retire" aria-label={`${a.student_name} 배정 내리기`} onClick={() => run(() => retireAct(a.id), "배정을 내렸습니다")}>✕</button></div>; })}
      <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }} data-g="vbar">
        <button type="button" className="btn sm" disabled={pending || !c.unwatched} data-act="remind" onClick={() => run(() => remindAct(v.id), (r) => `${r.n}명에게 재촉 — ${r.sink === "off" ? "🧪 리허설(off): 자취만 남고 실제로는 안 나갔습니다" : `보냄 ${r.sent} · 못 보냄 ${r.failed}`}`)}>📨 안 본 아이 재촉</button>
        <span className="wv" style={{ gap: 4 }}><input type="date" value={post[v.id] ?? ""} aria-label="미룰 마감" onChange={(e) => setPost({ ...post, [v.id]: e.target.value })} style={{ width: "auto" }} /><button type="button" className="btn sm gho" disabled={pending || !post[v.id] || !rows.length} data-act="postpone" onClick={() => run(() => postponeAct(v.id, post[v.id]), (r) => `마감을 ${md(post[v.id])} 로 — ${r.n}명`)}>마감 미루기</button></span>
        <button type="button" className="btn sm pri" disabled={pending} data-act="assign-open" aria-pressed={assignFor === v.id} onClick={() => { setAssignFor(assignFor === v.id ? null : v.id); setPicked([]); }}>+ 배정</button>
        <span className="spacer" /><span className="pill" data-g="vcounts">다 봄 {c.done} · 보다 맒 {c.part} · 안 봄 {c.none}</span></div>
      {assignFor === v.id && <div className="exr" style={{ marginTop: 8 }} data-g="assign-form"><div className="exh"><span className="ai">🧑‍🎓</span><b>누구에게 — 마감</b><span className="spacer" /><input type="date" value={due} aria-label="마감" min={today} onChange={(e) => setDue(e.target.value)} style={{ width: "auto" }} /></div>
        <div className="tags" style={{ marginTop: 8 }}>{(b.students ?? []).map((s) => { const on = picked.includes(s.id), already = rows.some((a) => a.student_id === s.id); return <label key={s.id} className={"tag" + (on ? " on" : "")} style={{ cursor: "pointer" }}><input type="checkbox" className="ck" checked={on} disabled={pending} data-g="pick" data-student={s.id} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} /> {s.name}{s.school ? ` · ${s.school} ${s.grade ?? ""}` : ""}{already ? " (이미)" : ""}</label>; })}</div>
        <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><button type="button" className="btn sm pri" disabled={pending || !picked.length} data-act="assign-save" onClick={() => run(() => assignAct(v.id, { studentIds: picked, dueOn: due }), (r) => `${r.n}명에게 배정했습니다`, () => { setAssignFor(null); setPicked([]); })}>배정</button><button type="button" className="btn sm" onClick={() => setAssignFor(null)}>닫기</button><span className="note k" style={{ margin: 0 }}>이미 배정된 아이는 마감만 새로 적힙니다 · 아이 화면 「나 › 영상」에 뜹니다</span></div></div>}
    </div>); };
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <Link prefetch={false} className="btn sm gho" href="/books">← 교재</Link><span className="pill" style={{ fontWeight: 700 }}>🎬 영상 배정</span>
      <span className={"pill" + (unwatched ? " warn" : "")} data-g="unwatched">안 본 아이 {unwatched}</span>
      <span className="spacer" />
      <button type="button" className="btn sm" data-act="add-open" aria-pressed={adding} onClick={() => setAdding(!adding)}>+ 영상</button></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {adding && <div className="card" style={{ marginBottom: 8 }} data-g="add-form"><div className="ctitle"><span className="cemo">＋</span>영상 — 제목 · 유튜브 주소 · 폴더 · 길이(비면 아이 폰이 처음 알려 줍니다)</div><div className="wv">
      <input value={nv.title} onChange={(x) => setNv({ ...nv, title: x.target.value })} placeholder="제목 (예: 간접의문문 정리)" aria-label="제목" style={{ flex: "1 1 200px" }} />
      <input value={nv.url} onChange={(x) => setNv({ ...nv, url: x.target.value })} placeholder="유튜브 주소" aria-label="유튜브 주소" style={{ flex: "1 1 220px" }} />
      <input value={nv.folder} onChange={(x) => setNv({ ...nv, folder: x.target.value })} placeholder="폴더 (예: 문법)" aria-label="폴더" style={{ width: 140 }} />
      <input value={nv.length} onChange={(x) => setNv({ ...nv, length: x.target.value })} placeholder="길이 8:04" aria-label="길이" style={{ width: 100 }} />
      <button className="btn pri sm" type="button" disabled={pending || !nv.title.trim() || !nv.url.trim()} data-act="add-save" onClick={() => run(() => addAct(nv), "영상을 더했습니다 — + 배정으로 아이에게", () => { setAdding(false); setNv({ title: "", url: "", folder: "", length: "" }); })}>저장</button>
      <button className="btn sm" type="button" onClick={() => setAdding(false)}>닫기</button>
      {folders(b.videos ?? []).length > 0 && <div className="wv" data-g="folder-pick" style={{ flexBasis: "100%", marginBottom: 0 }}><span className="note" style={{ margin: 0 }}>있는 폴더</span>{folders(b.videos ?? []).map((x) => <button key={x} type="button" className="btn sm gho" data-act="folder" aria-pressed={nv.folder === x} onClick={() => setNv({ ...nv, folder: x })}>{x}</button>)}</div>}</div>
      <p className="note k" style={{ margin: "4px 0 0" }}>앱 안에서 트는 것은 유튜브뿐입니다 · 저작권자가 임베드를 막은 영상은 아이 폰에서 「유튜브에서 보기」로 나갑니다 · 「몇 % 봤나」는 대략치 — 아이를 판단할 숫자가 아닙니다</p></div>}
    {!live.length && <div className="card" data-g="empty"><p className="note" style={{ margin: 0 }}>영상이 없습니다 — + 영상. 영상은 루틴 밖입니다: 못하는 아이에게만 따로 배정합니다</p></div>}
    {groupByFolder(live).map((g) => <div key={g.folder} data-g="folder" data-folder={g.empty ? "" : g.folder}>{(live.some((v) => String(v.folder ?? "").trim()) || !g.empty) && <div className="hh" style={{ margin: "8px 0 4px" }} data-g="folder-head">📁 {g.folder} <span className="cnt">{g.videos.length}개</span></div>}{g.videos.map((v) => <Video key={v.id} v={v} />)}</div>)}
    {hidden.length > 0 && <div className="wv" style={{ marginTop: 8 }}><button type="button" className="btn sm gho" data-act="show-hidden" aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)}>내린 영상 {hidden.length}</button></div>}
    {showHidden && hidden.map((v) => <Video key={v.id} v={v} />)}
    <div className="card" style={{ marginTop: 8 }}><div className="ctitle"><span className="cemo">✅</span>이 화면이 지키는 것</div>
      <div className="rl"><span className="k">밖으로 안 나감</span><span className="v">아이는 유튜브로 튕겨 나가지 않습니다 — 앱 안 화면에서 재생합니다(임베드가 막힌 영상만 예외)</span></div>
      <div className="rl"><span className="k">건너뛰기</span><span className="v">지나간 구간만 셉니다 — 끝까지 끌어다 놓고 「다 봤다」를 누르는 길이 막힙니다. 겹치는 구간은 한 번만</span></div>
      <div className="rl"><span className="k">정직하게</span><span className="v">「틀어놓고 딴짓」은 못 잡습니다. 대략치이지 아이를 판단할 숫자가 아닙니다 · 「다 봄」은 규칙 video.done_pct({cut}%) 이상</span></div></div>
  </>;
}
