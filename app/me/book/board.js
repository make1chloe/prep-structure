"use client";
/** 로드맵 판(목업 08 · 아이 쪽 · (어43) 초5가 알아보게 다시 지음 · 원장님 9/15 「이걸 초5가 알아보겠냐? 직관적의 뜻 몰라?」 · 「10번 학생어플이야」).
 *  칸반 세 칸 → 책 차례 한 줄 목록: 대단원마다 [▸ 이름 · 상태 말(✓ 다 했어요 · ▶ 하고 있어요 · 아직) · 막대 · n / N] · 하고 있는 단원은 펼쳐진 채 · 나머지는 눌러 펼친다.
 *  소단원 줄은 큰 네모(✓ = 다 했어요 · 빈 네모 = 아직) · 쌤·검사가 찍은 줄은 잠긴 채 · 내가 찍으면 「확인 기다리는 중」 · 대단원 머리 「이 단원 다 했어요」 네모(한 번에) · ❗ 달기.
 *  세는 것은 lib/road-plan 한 벌 · 부호·말은 lib/mark 한 곳 · 찍기는 낙관적이 아니다(원장님 줄은 못 덮는다는 답을 서버가 하므로 답을 기다린다 · 줄 하나라 빠르다) */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markUnit, markChapter, flagUnit } from "../actions.js";
import { roadOf, headTags, bookTags, flagLines, editBand, FLAG_KIND } from "@/lib/road-plan";
import { MARK, markText } from "@/lib/mark";
import { usePick, PickBox, PickGroup, PickBar } from "../../_shell/pick.js";   // (어75) 고르기는 앱 한 벌(대전제-20)
import { md } from "@/lib/dash-plan";
const kid = (s) => markText(s, "kid");
const Word = ({ s, big = false }) => <span className={"rst " + s + (big ? " big" : "")} data-g="word" data-status={s}>{s === "done" ? "✓ " : s === "doing" ? "▶ " : ""}{kid(s)}</span>;
export default function Board({ d, canFlag = true }) {   // canFlag — 「권한 설정」의 me.flags(「표시」). 끄면 ❗ 를 못 단다(자꾸 잘못 누르는 아이 · 목업 08 의 진도 체크 끄기와 같은 결)
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, today = d.date, round = b.sb?.round ?? 1;
  const [open, setOpen] = useState({}); const [flag, setFlag] = useState(null); const [ff, setFf] = useState({ unitId: "", kind: "not_done", said: "" });
  const allIds = (b.units ?? []).map((u) => u.id); const pk = usePick(allIds); const picking = pk.count > 0;   // (어75) 대단원 전체·일부 골라 한 번에(원장님 9/18)
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(); router.refresh(); });
  if (!b.book) return <div className="task" data-card="road"><div className="h"><b><span className="cemo">🛤️</span>내 진도체크</b></div><p className="note" style={{ margin: "8px 0 0" }}>배정된 교재가 없어요</p><Link prefetch={false} className="btn sm" href="/me">나 👉</Link></div>;
  const road = roadOf(b), head = headTags(b, road), books = bookTags(b.books ?? [], today), flags = flagLines(b.flags ?? []), band = editBand(b.edit, b.student);
  const upTo = (c, s) => { const i = c.subs.findIndex((x) => x.id === s.id); return c.subs.slice(0, i + 1).filter((x) => x.can && x.status !== "done").map((x) => x.id); };   // 여기까지 — 그 줄까지 아직인 것만(쌤이 찍은 줄은 건드리지 않는다)
  /* ⚠️ 줄을 <label> 로 감싸면 안 된다 — 고르기 네모(그것도 <label>)를 눌렀을 때 바깥 label 이 **체크까지 같이** 눌러 버린다(겹친 label).
     그래서 줄은 <div> 로 두고, 이름만 <label htmlFor> 로 묶어 「이름을 눌러도 체크된다」를 지킨다 */
  const Sub = ({ s, c }) => <div className={"rsub" + (s.own ? " own" : "")} data-g="sub" data-unit={s.id} data-status={s.status} data-pending={s.pending ? "1" : "0"}>
    {s.can ? <PickBox pick={pk} id={s.id} label={s.short} disabled={pending} /> : null}
    <input id={`ck-${s.id}`} type="checkbox" className="bigck" data-g="big-ck" checked={s.status === "done"} disabled={pending || !s.can} aria-label={s.short} onChange={(e) => { const on = e.target.checked; run(() => markUnit(s.id, round, on ? "done" : "none"), on ? `${MARK.done.kid} ✓ · 쌤이 확인하면 돼요` : "아직으로 되돌렸어요"); }} />
    <label className="rsn" htmlFor={`ck-${s.id}`}><b>{s.short}{s.is_workbook ? " · 워크북" : ""}</b>{s.parts && <small data-g="sub-parts">{s.parts}</small>}</label>
    <Word s={s.status} />
    {s.by && <b className={"by" + (s.own ? " me" : "")} data-g="by">{s.pending ? `${s.by} · 확인 기다리는 중` : s.by}</b>}
    {s.can && upTo(c, s).length > 1 && <button type="button" className="btn sm gho" data-act="upto" data-unit={s.id} disabled={pending} onClick={() => run(() => markChapter(upTo(c, s), round, "done"), (r) => `여기까지 ${r.marked}개 ${MARK.done.kid} ✓ · 쌤이 확인하면 돼요`)}>여기까지 다했어요</button>}
  </div>;
  const Chapter = ({ c }) => { const isOpen = c.now || Boolean(open[c.chapter]); const pct = c.total ? Math.round((c.done + c.skip) / c.total * 100) : 0;
    return <div className={"rd" + (c.now ? " now" : "")} data-g="chapter" data-chapter={c.chapter} data-status={c.status} data-now={c.now ? "1" : "0"} data-open={isOpen ? "1" : "0"}>
      <div className="rdh">
        <button type="button" className="rdt" data-act="toggle-chapter" aria-expanded={isOpen} onClick={() => setOpen({ ...open, [c.chapter]: !isOpen })}><span className="ar">▸</span><b>{c.chapter}</b><Word s={c.status} big /><span className="bar"><span className="fill" style={{ width: `${pct}%` }} /></span><span className="rdn" data-g="chapter-n">{c.done + c.skip} / {c.total}</span></button>
        {b.edit?.can_edit && c.markable.length > 0 && <label className="ckl rdck" data-g="chapter-ck-l"><input type="checkbox" className="bigck" data-g="chapter-ck" data-chapter={c.chapter} checked={c.finished} disabled={pending} aria-label={`${c.chapter} ${MARK.done.kid}`} onChange={(e) => { const on = e.target.checked; run(() => markChapter(c.markable, round, on ? "done" : "none"), (r) => on ? `${c.chapter} · ${r.marked}개 ${MARK.done.kid} ✓${r.skipped ? ` · 쌤이 찍은 ${r.skipped}개는 그대로` : ""} · 쌤이 확인하면 돼요` : `${c.chapter} · ${r.marked}개를 아직으로 되돌렸어요`); }} />이 단원 {MARK.done.kid}</label>}
        {b.edit?.can_edit && c.markable.length > 0 && <PickGroup pick={pk} ids={c.markable} label={`${c.chapter} 전체`} disabled={pending} />}
        {c.pending > 0 && <span className="tag" data-g="chapter-pending">✎ 확인 기다리는 중 {c.pending}</span>}
      </div>
      {isOpen && <div className="rsubs">{c.subs.map((s) => <Sub key={s.id} s={s} c={c} />)}</div>}
    </div>; };
  return <>
    <div className="wv" style={{ margin: "0 0 8px" }}><Link prefetch={false} className="btn sm" href="/me">← 나</Link><b style={{ fontSize: "var(--fs-6)" }} data-g="book-name">{b.book.name}</b><span className="spacer" /><span className="pill">{md(today)}</span></div>
    {!band.open && <div className="lf" style={{ marginBottom: 12 }} data-g="edit-band" data-open="0"><span className="ln">✎</span><div><b>{band.title}</b><small>{band.small}</small></div><span className="lm">{band.pill}</span></div>}
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    <div className="tags" style={{ marginBottom: 10 }} data-g="head-tags"><span className="tag type">{head.round}</span></div>
    {books.length > 1 && <div className="wv" style={{ marginBottom: 12 }} data-g="book-tags"><span className="hh" style={{ margin: 0 }}>다른 교재</span>{books.filter((x) => x.book_id !== b.book.id).map((x) => <Link prefetch={false} key={x.book_id} className="btn sm" href={`/me/book?b=${x.book_id}`} data-g="book-go" data-book={x.book_id} style={x.state === "book_off" ? { color: "var(--mute)" } : undefined}>{x.name}</Link>)}</div>}
    <div className="rlist" data-g="road">{road.chapters.map((c) => <Chapter key={c.chapter} c={c} />)}{!road.chapters.length && <p className="note" style={{ margin: 0 }}>소단원이 없어요</p>}</div>
    {picking && <PickBar pick={pk} unit="개">
      <button type="button" className="btn pri sm" data-act="pick-done" disabled={pending} onClick={() => run(() => markChapter(pk.ids, round, "done"), (r) => `${r.marked}개 ${MARK.done.kid} ✓${r.skipped ? ` · 쌤이 찍은 ${r.skipped}개는 그대로` : ""} · 쌤이 확인하면 돼요`, () => pk.clear())}>{MARK.done.kid} ✓</button>
      <button type="button" className="btn sm" data-act="pick-none" disabled={pending} onClick={() => run(() => markChapter(pk.ids, round, "none"), (r) => `${r.marked}개를 아직으로 되돌렸어요`, () => pk.clear())}>아직으로</button>
    </PickBar>}
    {canFlag && <div className="lf warn" style={{ marginTop: 8 }} data-g="flag-band"><span className="ln">❗</span><div><b>이거 잘못된 것 같아요</b></div><button className="btn sm" type="button" data-act="flag-open" onClick={() => setFlag(!flag)}>❗ 달기</button></div>}
    {canFlag && flag && <div className="task" data-g="flag-form" style={{ marginTop: 6 }}>
      <div className="wv"><select value={ff.unitId} aria-label="소단원" onChange={(x) => setFf({ ...ff, unitId: x.target.value })} style={{ width: "auto", maxWidth: 260 }}><option value="">어느 소단원?</option>{(b.units ?? []).map((u) => <option key={u.id} value={u.id}>{u.chapter} › {u.short}</option>)}</select>
        <div className="seg sm" data-g="flag-kind">{FLAG_KIND.map(([k, nm]) => <button key={k} type="button" aria-pressed={ff.kind === k} onClick={() => setFf({ ...ff, kind: k })}>{nm}</button>)}</div></div>
      <div className="wv" style={{ marginTop: 6 }}><input type="text" value={ff.said} placeholder={ff.kind === "other" ? "무엇이 잘못됐는지 한 줄" : "한 마디(비워도 돼요)"} aria-label="한 마디" onChange={(x) => setFf({ ...ff, said: x.target.value })} style={{ flex: "1 1 200px" }} />
        <button className="btn pri sm" type="button" disabled={pending || !ff.unitId} data-act="flag-save" onClick={() => run(() => flagUnit(ff.unitId, round, ff.kind, ff.said), "❗ 를 달았어요", () => { setFlag(false); setFf({ unitId: "", kind: "not_done", said: "" }); })}>달기</button></div></div>}
    {flags.map((f, i) => <div className="lf" key={f.id} data-g="flag-row" data-waiting={f.waiting ? "1" : "0"}><span className="ln">{i + 1}</span><div><b>{f.title}</b><small><i className="ic">❗</i> 「{f.said}」 · {f.when} · {f.state}</small></div><span className="lm">{f.state}</span></div>)}
  </>;
}
