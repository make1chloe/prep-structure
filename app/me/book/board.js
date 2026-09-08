"use client";
/** 로드맵 판(목업 08 — 아이 쪽) — 열림 띠 · 꼬리표(회독 · 소단원씩 · 끝낸 대단원 · 이대로면) · 내 교재들(상태) · 세 칸(끝냄 · 하는 중(소단원 줄 · 쌤/내가 · ○◐·) · 아직) · ❗ 달기 · 내가 단 ❗. 세는 것은 lib/road-plan 한 벌.
 *  찍기는 낙관적이 아니다 — 원장님 줄은 못 덮는다는 답을 서버가 하므로 답을 기다린다(줄 하나라 빠르다) */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markUnit, flagUnit } from "../actions.js";
import { roadOf, headTags, bookTags, flagLines, editBand, TRI, FLAG_KIND } from "@/lib/road-plan";
import { md } from "@/lib/dash-plan";
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date, round = b.sb?.round ?? 1;
  const [open, setOpen] = useState({}); const [flag, setFlag] = useState(null); const [ff, setFf] = useState({ unitId: "", kind: "not_done", said: "" });
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  if (!b.book) return <div className="task" data-card="road"><div className="h"><b><span className="cemo">🛤️</span>내 교재 로드맵</b></div><p className="note" style={{ margin: "8px 0 0" }}>배정된 교재가 없어요</p><Link prefetch={false} className="btn sm" href="/me">나 ↗</Link></div>;
  const road = roadOf(b), head = headTags(b, road), books = bookTags(b.books ?? [], today), flags = flagLines(b.flags ?? []), band = editBand(b.edit, b.student);
  const ic = (s) => s.status === "done" ? "✅" : s.status === "doing" ? "◐" : s.status === "skip" ? "⏭" : "⬜";
  const Sub = ({ s }) => <div className={"sr" + (s.own ? " own" : "")} data-g="sub" data-unit={s.id} data-status={s.status} data-pending={s.pending ? "1" : "0"}>
    <i className={"ic" + (s.status === "none" ? " no" : "")}>{ic(s)}</i><span>{s.short}{s.is_workbook ? " · 워크북" : ""}</span>
    {s.by && <b className={"by" + (s.own ? " me" : "")} data-g="by">{s.pending ? `${s.by} · 확인 기다리는 중` : s.by}</b>}
    {s.can && <div className="tri sm" data-g="tri">{TRI.map(([k, ch]) => <button key={k} type="button" data-p={k} aria-pressed={s.status === k} disabled={pending} onClick={() => run(() => markUnit(s.id, round, k), k === "none" ? "아직으로 되돌렸어요" : "찍었어요 — 선생님이 확인하면 굳어요")}>{ch}</button>)}</div>}
  </div>;
  const Chapter = ({ c, col }) => <div className={"ru" + (c.now ? " now" : "")} key={c.chapter} data-g="chapter" data-col={col} data-chapter={c.chapter} style={c.pending && !c.now ? { borderColor: "var(--amber)" } : undefined}>
    {c.chapter}<small>{col === "done" ? `소단원 ${c.total} ✓${c.skip ? ` · 건너뜀 ${c.skip}` : ""}` : c.pending ? <b style={{ color: "var(--navy)" }}>✎ 내가 찍음 — 확인 기다리는 중 {c.pending}</b> : col === "doing" ? <>소단원 {c.total}개 중 <b>{c.done + c.skip}개 끝냄</b></> : b.edit?.can_edit ? "내가 찍기 ○ ◐ ·" : `소단원 ${c.total}`}</small>
    {(c.now || open[c.chapter]) && <div className="sub2">{c.subs.map((s) => <Sub key={s.id} s={s} />)}</div>}
    {!c.now && <button className="lnk" type="button" data-act="toggle-chapter" aria-pressed={Boolean(open[c.chapter])} onClick={() => setOpen({ ...open, [c.chapter]: !open[c.chapter] })} style={{ marginTop: 4 }}>{open[c.chapter] ? "접기" : "소단원 보기"}</button>}
  </div>;
  return <>
    <div className="wv" style={{ margin: "0 0 8px" }}><Link prefetch={false} className="btn sm" href="/me">← 나</Link><b style={{ fontSize: "var(--fs-6)" }} data-g="book-name">{b.book.name}</b><span className="spacer" /><span className="pill">{md(today)}</span></div>
    <div className={"lf " + (band.open ? "ok" : "")} style={{ marginBottom: 12 }} data-g="edit-band" data-open={band.open ? "1" : "0"}><span className="ln">✎</span><div><b>{band.title}</b><small>{band.small}</small></div><span className="lm">{band.pill}</span></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <div className="tags" style={{ marginBottom: 12 }} data-g="head-tags"><span className="tag type">{head.round}</span><span className="tag">{head.basis}</span><span className="tag on" data-g="finished">{head.finished}</span><span className="tag act" data-g="end">{head.end}</span></div>
    <div className="tags" style={{ marginBottom: 12 }} data-g="book-tags">{books.map((x) => <Link prefetch={false} key={x.book_id} className={"tag" + (x.book_id === b.book.id ? " on" : "")} href={`/me/book?b=${x.book_id}`} style={x.state === "book_off" ? { color: "var(--mute)" } : undefined}>{x.text}</Link>)}</div>
    <div className="road" data-g="road">
      <div className="rcol" data-g="col-done"><div className="colh">끝냄 <span className="n">{road.done.length}</span></div>{road.done.map((c) => <Chapter key={c.chapter} c={c} col="done" />)}{!road.done.length && <p className="note" style={{ margin: 0 }}>아직 없어요</p>}</div>
      <div className="rcol" data-g="col-doing"><div className="colh">하는 중 <span className="n">{road.doing.length}</span></div>{road.doing.map((c) => <Chapter key={c.chapter} c={c} col="doing" />)}{!road.doing.length && <p className="note" style={{ margin: 0 }}>{road.total ? "다 끝냈어요" : "소단원이 없어요"}</p>}</div>
      <div className="rcol" data-g="col-todo"><div className="colh">아직 <span className="n">{road.todo.length}</span></div>{road.todo.map((c) => <Chapter key={c.chapter} c={c} col="todo" />)}{!road.todo.length && <p className="note" style={{ margin: 0 }}>없어요</p>}</div>
    </div>
    <div className="lf warn" style={{ marginTop: 8 }} data-g="flag-band"><span className="ln">❗</span><div><b>이거 잘못된 것 같아요</b><small>원장님이 찍으신 줄에도 <b>❗를 달 수 있어요</b> — 안 했는데 끝냄으로 되어 있거나 그 반대일 때. 진도는 안 바뀌고 원장님께 말만 갑니다</small></div><button className="btn sm" type="button" data-act="flag-open" onClick={() => setFlag(!flag)}>❗ 달기</button></div>
    {flag && <div className="task" data-g="flag-form" style={{ marginTop: 6 }}>
      <div className="wv"><select value={ff.unitId} aria-label="소단원" onChange={(x) => setFf({ ...ff, unitId: x.target.value })} style={{ width: "auto", maxWidth: 260 }}><option value="">어느 소단원?</option>{(b.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.chapter} › {u.short}</option>)}</select>
        <div className="seg sm" data-g="flag-kind">{FLAG_KIND.map(([k, nm]) => <button key={k} type="button" aria-pressed={ff.kind === k} onClick={() => setFf({ ...ff, kind: k })}>{nm}</button>)}</div></div>
      <div className="wv" style={{ marginTop: 6 }}><input type="text" value={ff.said} placeholder={ff.kind === "other" ? "무엇이 잘못됐는지 한 줄" : "한 마디(비워도 돼요)"} aria-label="한 마디" onChange={(x) => setFf({ ...ff, said: x.target.value })} style={{ flex: "1 1 200px" }} />
        <button className="btn pri sm" type="button" disabled={pending || !ff.unitId} data-act="flag-save" onClick={() => run(() => flagUnit(ff.unitId, round, ff.kind, ff.said), "❗ 를 달았어요 — 원장님이 볼 때까지 그대로 있어요", () => { setFlag(false); setFf({ unitId: "", kind: "not_done", said: "" }); })}>달기</button></div></div>}
    {flags.map((f, i) => <div className="lf" key={f.id} data-g="flag-row" data-waiting={f.waiting ? "1" : "0"}><span className="ln">{i + 1}</span><div><b>{f.title}</b><small><i className="ic">❗</i> 「{f.said}」 — {f.when} · {f.waiting ? <b>원장님이 볼 때까지 그대로 있어요</b> : f.state}</small></div><span className="lm">{f.state}</span></div>)}
  </>;
}
