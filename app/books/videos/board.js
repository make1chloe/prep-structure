"use client";
/** 영상 배정 판(목업 19 오른쪽) · 머리(안 본 아이 N · + 영상 · ← 교재) · + 영상 양식(제목 · 유튜브 주소 · 폴더 · 길이) · 영상 카드(아이마다 막대와 상태 · 마감 · 📨 알림 · 마감 미루기 · + 배정 · 삭제). 세는 것은 화면이 센다(원칙-5) */
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { usePick, PickAll, PickBox, PickBar } from "../../_shell/pick.js";   /* 고르기 한 벌((어28)-③ · 대전제-20) */
import { useRouter } from "next/navigation";
import { addAct, setAct, setManyAct, assignAct, postponeAct, retireAct, remindAct, remindManyAct } from "./actions.js";
import { statusOf, counts, mmss, dueText, opensText, groupByFolder, folders } from "@/lib/video-plan";
import { md, seoulDate } from "@/lib/dash-plan";
import { icon } from "../../_shell/icon.js";   // (어51) 아이콘만 있는 손의 이름·툴팁 한 벌
const fillColor = (s) => (s.key === "done" ? "var(--ok)" : s.key === "part" ? "var(--weak)" : "var(--miss)");
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date, cut = Number(b.rules?.["video.done_pct"] ?? 95);
  const [adding, setAdding] = useState(false); const [nv, setNv] = useState({ title: "", url: "", folder: "", length: "" }); const [assignFor, setAssignFor] = useState(null); const [picked, setPicked] = useState([]); const [due, setDue] = useState(""); const [post, setPost] = useState({}); const [showHidden, setShowHidden] = useState(false);
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(r); router.refresh(); });
  const live = (b.videos ?? []).filter((v) => v.state === "active"), hidden = (b.videos ?? []).filter((v) => v.state !== "active");
  const vIds = useMemo(() => (b.videos ?? []).map((v) => v.id), [b]); const pk = usePick(vIds); const pv = (b.videos ?? []).filter((v) => pk.has(v.id)), toDown = pv.filter((v) => v.state === "active"), toUp = pv.filter((v) => v.state !== "active"); const [folderTo, setFolderTo] = useState("");   /* 고른 영상 · 띠에서 한 번에 */
  const unwatched = live.reduce((n, v) => n + counts(v.assigns, cut).unwatched, 0);
  const Video = ({ v }) => { const c = counts(v.assigns, cut), rows = (v.assigns ?? []).filter((a) => a.state !== "retired"); return (
    <div className="card" style={{ margin: "0 0 8px" }} data-g="video" data-video={v.id} data-state={v.state}>
      <div className="ctitle"><PickBox pick={pk} id={v.id} label={`${v.title} 고르기`} /><span className="cemo">🎬</span><span data-g="title">{v.title}</span> · <span data-g="len">{v.seconds ? mmss(v.seconds) : "길이 아직(아이 폰이 처음 알려 줍니다)"}</span>{v.folder && <span className="tag" style={{ marginLeft: 6 }}>📁 {v.folder}</span>}<span className="spacer" /><a className="btn sm gho" href={v.url} target="_blank" rel="noreferrer">유튜브 👉</a>
        {v.state === "active" ? <button type="button" className="btn sm gho" disabled={pending} data-act="hide" onClick={() => run(() => setAct(v.id, { state: "hidden" }), "내렸습니다(지우지 않습니다)")}>삭제</button> : <button type="button" className="btn sm" disabled={pending} data-act="unhide" onClick={() => run(() => setAct(v.id, { state: "active" }), "복구했습니다")}>복구</button>}</div>
      {!rows.length && <p className="note" style={{ margin: "4px 0" }}>배정한 아이가 없습니다. + 배정</p>}
      {rows.map((a) => { const s = statusOf(a, cut); return <div className="vrow" key={a.id} data-g="vrow" data-student={a.student_id} data-status={s.key}><span className="vn">{a.student_name}</span><div className="bar"><div className="fill" style={{ width: `${s.key === "done" ? 100 : a.pct ?? 0}%`, background: fillColor(s) }} /></div><span className="bkv" style={{ color: s.key === "none" ? "var(--miss)" : undefined }} data-g="bkv">{s.text}</span>
        <small className="note" style={{ margin: 0 }}>{a.due_on ? dueText(a.due_on, today) : "마감 없음"}{a.done_at ? ` · ${md(seoulDate(a.done_at))} 다 봄` : ""}{opensText(a.opens) ? ` · ${opensText(a.opens)}` : ""}</small><button type="button" className="btn sm gho" disabled={pending} data-act="retire" {...icon(`${a.student_name} 배정 삭제`)} onClick={() => run(() => retireAct(a.id), "배정을 내렸습니다")}>✕</button></div>; })}
      <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }} data-g="vbar">
        <button type="button" className="btn sm" disabled={pending || !c.unwatched} data-act="remind" onClick={() => run(() => remindAct(v.id), (r) => `${r.n}명에게 알림 · ${r.sink === "off" ? "🧪 리허설(off): 발송 이력만 남고 실제로는 안 나갔습니다" : `보냄 ${r.sent} · 못 보냄 ${r.failed}`}`)}>📨 안 본 아이에게 알림</button>
        <span className="wv" style={{ gap: 4 }}><input type="date" value={post[v.id] ?? ""} aria-label="미룰 마감" onChange={(e) => setPost({ ...post, [v.id]: e.target.value })} style={{ width: "auto" }} /><button type="button" className="btn sm gho" disabled={pending || !post[v.id] || !rows.length} data-act="postpone" onClick={() => run(() => postponeAct(v.id, post[v.id]), (r) => `마감을 ${md(post[v.id])} 로 · ${r.n}명`)}>마감 미루기</button></span>
        <button type="button" className="btn sm pri" disabled={pending} data-act="assign-open" aria-pressed={assignFor === v.id} onClick={() => { setAssignFor(assignFor === v.id ? null : v.id); setPicked([]); }}>+ 배정</button>
        <span className="spacer" /><span className="pill" data-g="vcounts">다 봄 {c.done} · 보다 맒 {c.part} · 안 봄 {c.none}</span></div>
      {assignFor === v.id && <div className="exr" style={{ marginTop: 8 }} data-g="assign-form"><div className="exh"><span className="ai">🧑‍🎓</span><b>누구에게 · 마감</b><span className="spacer" /><input type="date" value={due} aria-label="마감" min={today} onChange={(e) => setDue(e.target.value)} style={{ width: "auto" }} /></div>
        <div className="tags" style={{ marginTop: 8 }}>{(b.students ?? []).map((s) => { const on = picked.includes(s.id), already = rows.some((a) => a.student_id === s.id); return <label key={s.id} className={"tag" + (on ? " on" : "")} style={{ cursor: "pointer" }}><input type="checkbox" className="ck" checked={on} disabled={pending} data-g="pick" data-student={s.id} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} /> {s.name}{s.school ? ` · ${s.school} ${s.grade ?? ""}` : ""}{already ? " (이미)" : ""}</label>; })}</div>
        <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><button type="button" className="btn sm pri" disabled={pending || !picked.length} data-act="assign-save" onClick={() => run(() => assignAct(v.id, { studentIds: picked, dueOn: due }), (r) => `${r.n}명에게 배정했습니다`, () => { setAssignFor(null); setPicked([]); })}>배정</button><button type="button" className="btn sm" onClick={() => setAssignFor(null)}>닫기</button><span className="note k" style={{ margin: 0 }}>이미 배정된 아이는 마감만 새로 적힙니다 · 아이 화면 「나 › 영상」에 뜹니다</span></div></div>}
    </div>); };
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <PickAll pick={pk} /><Link prefetch={false} className="btn sm gho" href="/books">← 교재</Link><span className="pill" style={{ fontWeight: 700 }}>🎬 영상 배정</span>
      <span className={"pill" + (unwatched ? " warn" : "")} data-g="unwatched">안 본 아이 {unwatched}</span>
      <span className="spacer" />
      <button type="button" className="btn sm" data-act="add-open" aria-pressed={adding} onClick={() => setAdding(!adding)}>+ 영상</button></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <PickBar pick={pk} unit="개">{/* (어28)-③ 고른 영상에 한 번에 · 폴더 옮기기 · 삭제(지우지 않는다) · 복구 · 📨 안 본 아이에게 알림 */}
      <input type="text" value={folderTo} placeholder="폴더" aria-label="옮길 폴더" onChange={(e) => setFolderTo(e.target.value)} style={{ maxWidth: 140 }} />
      <button type="button" className="btn sm" disabled={pending || !folderTo.trim() || !pv.length} data-act="folder-picked" onClick={() => run(() => setManyAct(pv.map((v) => v.id), { folder: folderTo.trim() }), (r) => `${r.n}개를 📁 ${folderTo.trim()} 로`, () => { pk.clear(); setFolderTo(""); })}>📁 옮기기</button>
      <button type="button" className="btn sm gho" disabled={pending || !toDown.length} data-act="hide-picked" onClick={() => run(() => setManyAct(toDown.map((v) => v.id), { state: "hidden" }), (r) => `${r.n}개 내렸습니다(지우지 않습니다)`, pk.clear)}>삭제 {toDown.length}</button>
      <button type="button" className="btn sm" disabled={pending || !toUp.length} data-act="unhide-picked" onClick={() => run(() => setManyAct(toUp.map((v) => v.id), { state: "active" }), (r) => `${r.n}개 복구했습니다`, pk.clear)}>복구 {toUp.length}</button>
      <button type="button" className="btn sm" disabled={pending || !toDown.length} data-act="remind-picked" onClick={() => run(() => remindManyAct(toDown.map((v) => v.id)), (r) => `${r.n}명에게 알림`, pk.clear)}>📨 알림</button>
    </PickBar>
    {adding && <div className="card" style={{ marginBottom: 8 }} data-g="add-form"><div className="ctitle"><span className="cemo">＋</span>영상</div><div className="wv">
      <input value={nv.title} onChange={(x) => setNv({ ...nv, title: x.target.value })} placeholder="제목 (예: 간접의문문 정리)" aria-label="제목" style={{ flex: "1 1 200px" }} />
      <input value={nv.url} onChange={(x) => setNv({ ...nv, url: x.target.value })} placeholder="유튜브 주소" aria-label="유튜브 주소" style={{ flex: "1 1 220px" }} />
      <input value={nv.folder} onChange={(x) => setNv({ ...nv, folder: x.target.value })} placeholder="폴더 (예: 문법)" aria-label="폴더" style={{ width: 140 }} />
      <input value={nv.length} onChange={(x) => setNv({ ...nv, length: x.target.value })} placeholder="길이 8:04" aria-label="길이" style={{ width: 100 }} />
      <button className="btn pri sm" type="button" disabled={pending || !nv.title.trim() || !nv.url.trim()} data-act="add-save" onClick={() => run(() => addAct(nv), "영상을 더했습니다. + 배정으로 아이에게", () => { setAdding(false); setNv({ title: "", url: "", folder: "", length: "" }); })}>저장</button>
      <button className="btn sm" type="button" onClick={() => setAdding(false)}>닫기</button>
      {folders(b.videos ?? []).length > 0 && <div className="wv" data-g="folder-pick" style={{ flexBasis: "100%", marginBottom: 0 }}><span className="note" style={{ margin: 0 }}>있는 폴더</span>{folders(b.videos ?? []).map((x) => <button key={x} type="button" className="btn sm gho" data-act="folder" aria-pressed={nv.folder === x} onClick={() => setNv({ ...nv, folder: x })}>{x}</button>)}</div>}</div></div>}
    {!live.length && <div className="card" data-g="empty"><p className="note" style={{ margin: 0 }}>영상 없음 · + 영상</p></div>}
    {groupByFolder(live).map((g) => <div key={g.folder} data-g="folder" data-folder={g.empty ? "" : g.folder}>{(live.some((v) => String(v.folder ?? "").trim()) || !g.empty) && <div className="hh" style={{ margin: "8px 0 4px" }} data-g="folder-head">📁 {g.folder} <span className="cnt">{g.videos.length}개</span></div>}{g.videos.map((v) => <Video key={v.id} v={v} />)}</div>)}
    {hidden.length > 0 && <div className="wv" style={{ marginTop: 8 }}><button type="button" className="btn sm gho" data-act="show-hidden" aria-pressed={showHidden} onClick={() => setShowHidden(!showHidden)}>삭제한 영상 {hidden.length}</button></div>}
    {showHidden && hidden.map((v) => <Video key={v.id} v={v} />)}
  </>;
}
