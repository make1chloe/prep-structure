"use client";
/** 자료함 판(목업 20) — 머리(📥 안 본 것 · 받은 것/보낸 것 · 📤 보내기) · 방금 온 것(갈래만 고른다 — 학교·학년·학기는 저절로) · 갈래별 칸(학교·학년마다 · 🧑‍🎓 아이별) · 묶음 열기(⭐ 가장 또렷 · 열기 · 갈래 옮기기) · 보낸 것(붙인 자리 · 아이가 처리했나 N/M) · 📤 보내기 모달(아이 → 마지막 판의 숙제 줄 → 파일) · 정한 것. 세는 것은 화면이 센다(원칙-5) */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sortAct, replyAct } from "./actions.js";
import Photo from "../../_shell/photo.js";
import { inboxRows, columns, sharpest, sentRows, counts, sendTargets, whoText, icon, sizeText, isImage, replyText } from "@/lib/files-plan";
import { md, seoulDate } from "@/lib/dash-plan";
import Upload from "../../_shell/upload.js";
/** ② 원장님 답 한 줄 — 손 떼면 저장. 비우면 자동 답 자리로(갈래를 고르면 다시 채워진다) */
function Reply({ f, pending, run }) {
  return <input type="text" defaultValue={f.reply ?? ""} placeholder={f.reply ? "" : "아이·학부모에게 답 한 줄(갈래를 고르면 저절로)"} aria-label={`${f.orig_name} 답`} data-g="reply" disabled={pending} onBlur={(e) => { if ((e.target.value ?? "").trim() !== (f.reply ?? "")) run(() => replyAct(f.id, e.target.value), "답을 적었습니다 — 보낸 사람 화면에 뜹니다"); }} style={{ flex: "1 1 220px" }} />;
}
export default function Board({ d }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const b = d.board, kinds = b.kinds ?? [], rules = b.rules ?? {}, days = Number(rules["file.child_days"] ?? 30);
  const [tab, setTab] = useState("in"); const [open, setOpen] = useState(null); const [send, setSend] = useState(false); const [sid, setSid] = useState(""); const [item, setItem] = useState("");
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); if (after) after(r); router.refresh(); });
  const inbox = inboxRows(b.inbox), cols = columns(b.bins), sent = sentRows(b.sent), c = counts(b);
  const openCard = open ? cols.flatMap((x) => x.cards).find((x) => (x.bin?.id ?? x.title) === open) : null; const star = openCard ? sharpest(openCard.files) : null;
  const tg = sendTargets(b.students, sid);
  const FileRow = ({ f, bin }) => <div className="lf" data-g="bin-file" data-file={f.id}>{isImage(f.mime) ? <Photo id={f.id} name={f.orig_name} /> : <span className="ln">{icon(f.mime)}</span>}<div><b>{star === f.id ? "⭐ " : ""}{f.orig_name}</b><small>{whoText(f)} · {md(seoulDate(f.uploaded_at))} · {sizeText(f.bytes)}{star === f.id ? " · 가장 또렷" : ""}{f.note ? ` · 💬 「${f.note}」` : ""}</small>{f.by_role !== "principal" && f.by_role !== "instructor" && f.by_role !== "assistant" && <div className="wv" style={{ marginTop: 4, marginBottom: 0 }}><span className="note k" style={{ margin: 0 }}>답</span><Reply f={f} pending={pending} run={run} /></div>}</div>
    <a className="btn sm" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" data-act="open-file">열기</a>
    {bin && <select value={bin.kind} aria-label={`${f.orig_name} 갈래 옮기기`} disabled={pending} data-g="move" onChange={(e) => run(() => sortAct(f.id, e.target.value), `${e.target.value} 로 옮겼습니다`, () => setOpen(null))} style={{ width: "auto" }}>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select>}</div>;
  return <>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <span className="pill" style={{ fontWeight: 700 }}>📎 자료함</span>
      <span className={"pill" + (c.unsorted ? " warn" : "")} data-g="unsorted">📥 안 본 것 {c.unsorted}</span>
      <span className="spacer" />
      <div className="seg sm" data-g="tab"><button type="button" aria-pressed={tab === "in"} onClick={() => setTab("in")}>받은 것</button><button type="button" aria-pressed={tab === "out"} onClick={() => setTab("out")}>보낸 것</button></div>
      <button type="button" className="btn pri sm" data-act="send-open" onClick={() => setSend(true)}>📤 보내기</button></div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {tab === "in" && <>
      <div className="exr" style={{ borderColor: "var(--amber)" }} data-g="inbox">
        <div className="exh"><span className="ai">📥</span><b>방금 온 것 — 갈래만 골라 주세요</b><span className="tag act" data-g="inbox-n">{inbox.length}</span><span className="spacer" /><span className="pill">학교·학년·학기는 <b>아이에게서 저절로</b> 붙습니다</span></div>
        <div className="left">
          {!inbox.length && <p className="note" style={{ margin: "8px 0 0" }}>방금 온 것이 없습니다 — 아이·학부모가 찍어 보내면 여기 뜹니다</p>}
          {inbox.map((f) => <div className="lf" key={f.id} data-g="inbox-row" data-file={f.id}>{isImage(f.mime) ? <Photo id={f.id} name={f.orig_name} /> : <span className="ln">{f.icon}</span>}
            <div><b>{f.who} — {f.orig_name}</b><small>{f.when} · {f.note ? <><i className="ic">💬</i> 「{f.note}」 · </> : null}{f.size}{f.shrunk ? " · 줄임" : ""} · {f.tag}</small><div className="wv" style={{ marginTop: 4, marginBottom: 0 }}><span className="note k" style={{ margin: 0 }}>답</span><Reply f={f} pending={pending} run={run} /></div></div>
            <div className="seg sm" data-g="kind">{kinds.map((k) => <button key={k} type="button" aria-pressed={false} disabled={pending} onClick={() => run(() => sortAct(f.id, k), `「${k}」 로 넣었습니다`)}>{k}</button>)}</div>
            <a className="btn sm" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" data-act="open-file">열기</a></div>)}
        </div>
      </div>
      <div className="ctitle" style={{ marginTop: 12 }}><span className="cemo">🗂️</span>갈래별로 쌓입니다<span className="spacer" /><span className="note k" style={{ margin: 0 }}>학기가 바뀌어도 남습니다 — 다음 학기 같은 학교 아이가 씁니다</span></div>
      {!cols.length && <p className="note" style={{ margin: "4px 0" }}>아직 쌓인 것이 없습니다 — 위에서 갈래를 고르면 여기 칸이 섭니다</p>}
      <div className="kb" data-g="kb">
        {cols.map((col) => <div className="col" key={col.key} data-g="col"><div className="colh">{col.title} <span className="n">{col.n}</span></div>
          {col.cards.map((x) => { const key = x.bin?.id ?? x.title; return <button type="button" className="kc" key={key} data-g="bin" data-bin={x.bin?.id ?? ""} aria-pressed={open === key} onClick={() => setOpen(open === key ? null : key)} style={{ textAlign: "left", width: "100%", cursor: "pointer" }}>
            <b>{x.title}</b><div className="sub">{x.sub}</div>{x.same > 1 && <div className="kv"><span>같은 것</span>{x.same}장 — 골라 씁니다</div>}<div className="kv"><span>마지막</span>{x.last}</div>{x.why && <div className="why">{x.why}</div>}</button>; })}
        </div>)}
      </div>
      {openCard && <div className="card" style={{ marginTop: 8 }} data-g="bin-files"><div className="ctitle"><span className="cemo">📂</span>{openCard.title} — {openCard.n}개{star ? " · ⭐ 가장 또렷한 것을 골라 씁니다(지우지 않습니다)" : ""}<span className="spacer" /><button type="button" className="btn sm" onClick={() => setOpen(null)}>닫기</button></div>
        {openCard.files.map((f) => <FileRow key={f.id} f={f} bin={openCard.bin} />)}</div>}
      <div className="ctitle" style={{ marginTop: 12 }}><span className="cemo">⚖️</span>정한 것</div>
      <div className="rl2">
        <div className="rl"><span className="k">한 번에</span><span className="v"><b>{rules["file.batch_max"] ?? 30}장까지.</b> 넘으면 나눠 올리라고 말합니다 — 조용히 잘라 넣지 않습니다</span></div>
        <div className="rl"><span className="k">사진 크기</span><span className="v">올릴 때 폰에서 <b>긴 변 {rules["file.photo_px"] ?? 1600}px 로 줄입니다.</b> pdf·문서는 안 줄입니다({rules["file.max_mb"] ?? 4}MB 까지)</span></div>
        <div className="rl"><span className="k">누가 보나</span><span className="v">받은 것은 <b>원장님만</b>. 아이가 올린 것을 다른 아이가 못 봅니다 · 보낸 것은 붙인 그 숙제를 <b>받는 아이(와 그 학부모)만</b></span></div>
        <div className="rl"><span className="k">아이 쪽 보관</span><span className="v">아이에게 보낸 것은 <b>{days}일</b>(원장님 9/2 「1달」). 지나면 아이 화면에서 안 보이고 — <b>여기엔 그대로 있어</b> 다시 보내면 됩니다. 💾 저장은 아이 폰에 내려받고 ✓ 안 보기는 그 줄에서만 치웁니다</span></div>
        <div className="rl"><span className="k">언제 지워지나</span><span className="v"><b>지우지 않습니다</b> — 원장님 9/3 「그냥 둬. 지우지 마 수정하지 마」. 퇴원해도 그대로 · 학기가 바뀌어도 그대로</span></div>
        <div className="rl"><span className="k">형제</span><span className="v"><b>학부모가 보낼 때만</b> 「누구 학교 것인가요」를 묻습니다(아이 계정은 그 아이 하나 · 형제가 한 명뿐이면 안 묻습니다)</span></div>
      </div>
    </>}
    {tab === "out" && <div data-g="sent">
      {!sent.length && <p className="note" style={{ margin: "4px 0" }}>보낸 것이 없습니다 — 📤 보내기로 오늘 숙제에 붙입니다</p>}
      {sent.map((f) => <div className="lf" key={f.id} data-g="sent-row" data-file={f.id}><span className="ln">{f.icon}</span>
        <div><b>{f.orig_name}</b><small>{f.when} · {f.size}{f.note ? ` · 💬 「${f.note}」` : ""}{f.by_name ? ` · ${f.by_name}` : ""}</small>
          {f.links.map((l, i) => <small key={i} data-g="sent-link" data-seen={l.seen_by_child ?? "none"} style={{ color: "var(--mid)" }}>{l.target} · {l.seen}{l.seen_at ? ` ${md(seoulDate(l.seen_at))}` : ""}</small>)}
          {!f.links.length && <small>안 붙임 — 📤 보내기에서 숙제 줄에 붙입니다</small>}</div>
        <span className="lm" data-g="sent-done">{f.done}/{f.total}</span><a className="btn sm" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer">열기</a></div>)}
    </div>}
    <div className="savebar" style={{ marginTop: 12 }} data-g="bar"><span className="pill" data-g="counts">받은 것 {c.received} · 보낸 것 {c.sent} · 안 본 것 {c.unsorted}</span><span className="spacer" /><span className="pill">지우지 않습니다 — 아이 화면의 붙임만 {days}일 뒤 안 보입니다</span></div>
    {send && <div className="mdlov" aria-label="보내기" data-g="send" onClick={(x) => { if (x.target === x.currentTarget) setSend(false); }}><div className="mdl" style={{ maxWidth: 560 }}>
      <div className="mdlh"><b>📤 오늘 숙제에 붙이기</b><span className="spacer" /><button className="btn sm" type="button" onClick={() => setSend(false)}>닫기</button></div>
      <div className="mdlb">
        <div className="wv"><label className="fl" style={{ margin: 0 }}>누구에게</label><select value={sid} aria-label="누구에게" data-g="send-student" onChange={(e) => { setSid(e.target.value); setItem(""); }} style={{ width: "auto" }}><option value="">아이를 고르세요</option>{(b.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.school ? ` · ${s.school} ${s.grade ?? ""}` : ""}</option>)}</select></div>
        {tg.student && <div className="wv" style={{ marginTop: 8 }}><label className="fl" style={{ margin: 0 }}>어느 숙제에</label>{tg.items.length ? <select value={item} aria-label="어느 숙제에" data-g="send-item" onChange={(e) => setItem(e.target.value)} style={{ width: "auto", maxWidth: 360 }}><option value="">{md(tg.student.sheet.date)} 숙제 줄을 고르세요</option>{tg.items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</select> : <span className="note" style={{ margin: 0 }} data-g="send-why">{tg.why}</span>}</div>}
        {tg.student && item && <Upload rules={rules} studentId={tg.student.id} itemId={item} label="📎 붙일 파일" hint={`아이 화면의 그 숙제 줄에 📎 로 붙습니다 — 아이가 💾 저장 · ✓ 안 보기로 처리하고 ${days}일 뒤 아이 화면에서 사라집니다(여기엔 그대로)`} onDone={() => router.refresh()} />}
        {(!tg.student || !item) && <p className="note k" style={{ margin: "8px 0 0" }}>아이 → 숙제 줄을 고르면 파일 칸이 열립니다 · 공지에 붙이기는 <a href="/send/notice" data-act="to-notice">📢 공지 화면</a>에서(자료함의 파일을 골라 붙입니다)</p>}
      </div>
      <div className="mdlf"><span className="spacer" /><button className="btn" type="button" onClick={() => setSend(false)}>닫기</button></div>
    </div></div>}
  </>;
}
