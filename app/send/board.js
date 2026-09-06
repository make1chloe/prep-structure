"use client";
/** 발송 판(목업 10) — 고르고 · 한 번에 · 예약(확정-㉕). 되돌릴 수 없는 것(보내기·예약)은 서버 답을 기다린다(속도-5). 판단은 lib/send-plan(순수) — 여기는 그린다 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendSelected, scheduleSelected, cancelSchedule, resendLog } from "./actions.js";
import { whenChoices, whenLabel, nowCount, closedCount } from "@/lib/send-plan";
const Row = ({ icon = null, cls = "", check = null, right = null, children, ...rest }) => (
  <div className={"srow" + (cls ? " " + cls : "")} {...rest}>{check}{icon != null && <span className="si">{icon}</span>}<div className="sn">{children}</div>{right}</div>
);
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
export default function Board({ d }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [open, setOpen] = useState(false);
  const selectable = useMemo(() => d.daily.filter((r) => r.state === "ready" || r.state === "sent").map((r) => r.id), [d]);
  const [sel, setSel] = useState(() => new Set(d.daily.filter((r) => r.checked).map((r) => r.id)));
  const [when, setWhen] = useState("evening"); const [cDate, setCDate] = useState(d.date); const [cTime, setCTime] = useState("18:00");
  const ids = [...sel].filter((id) => selectable.includes(id));
  const all = selectable.length > 0 && selectable.every((id) => sel.has(id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setAll = (on) => setSel(on ? new Set(selectable) : new Set());
  const run = (fn, okMsg) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } setMsg(okMsg(r)); setSel(new Set()); router.refresh(); });
  const cnt = closedCount(d.daily), nowN = nowCount(d.late);
  const rc = d.sent.reduce((c, s) => { if (s.status.read) c.read++; else if (s.status.unread) c.unread++; else if (s.status.bad) c.failed++; else c.rehearsal++; return c; }, { read: 0, unread: 0, failed: 0, rehearsal: 0 });
  const ranText = (r) => `큐 ${r.ok}건 보냄 · 실패 ${r.bad}건${r.deferred ? ` · 방해금지로 미룸 ${r.deferred}건` : ""}`;
  return (<>
    <div className="wv" style={{ marginBottom: 8 }}>
      <span className="pill">{d.date}</span>
      <span className={"pill" + (nowN ? " warn" : "")} data-g="now-count">🌙 지금 보낼 것 {nowN}</span>
      <span className="pill" data-g="sel-count">선택 {ids.length}건</span>
      <span className={"pill" + (d.sink === "live" ? " hw" : "")} data-g="sink">{d.sink === "live" ? "앱 알림만" : `🧪 리허설(${d.sink}) — 실제로는 안 나감`}</span>
      {d.reach && <span className="pill" data-g="reach">닿는 길 — 학부모 {d.reach.parents}명 · 로그인한 집 {d.reach.signed_in} · 알림 켠 기기 {d.reach.devices}대</span>}
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}

    <section className={"sgrp" + (nowN ? " now" : "")} data-card="now">
      <div className="sgh"><span className="sgi">🕘</span><b>지금 · 수업 중에</b><span className={"pill" + (nowN ? " warn" : "")}>{d.late.length}</span><span className="spacer" /><span className="note" style={{ margin: 0 }}>늦은 귀가 안내는 오늘 카드에서 보냅니다 — 몰아 보내는 시간까지 기다리면 뜻이 없습니다</span></div>
      {!d.late.length && <Row icon="—" cls="dim"><b>오늘 늦게 가는 아이가 없습니다</b></Row>}
      {d.late.map((r) => r.sent
        ? <Row key={r.id} icon="✅" cls="done" data-g="late-row"><b>{r.name} · 늦은 귀가 안내</b><small>{r.until} 예정 · <b>{r.sent}에 보냄</b>{r.log ? ` · ${r.log.text}` : ""}</small><div className="tags" style={{ marginTop: 4 }}><span className="tag on">✓ 오늘 카드에서 보냄</span>{r.reason && <span className="tag">{r.reason}</span>}</div></Row>
        : <Row key={r.id} icon="🕙" data-g="late-row"><b>{r.name} · 늦은 귀가 안내</b><small>{r.until} 예정 · 아직 안 보냄</small>
            {r.noReason ? <div className="note" style={{ margin: "4px 0 0", color: "var(--miss)" }}>⚠️ <b>사유가 비어 있습니다</b> — 오늘 카드에서 한 줄 정해야 보낼 수 있습니다</div> : <div className="note" style={{ margin: "4px 0 0" }}>{r.reason}</div>}
            <div className="tags" style={{ marginTop: 4 }}><a className="tag act" href="/today">오늘 카드에서 보내기 ↗</a></div></Row>)}
    </section>

    <section className="sgrp" data-card="daily">
      <div className="sgh"><span className="sgi">📨</span><b>마감하면 나갑니다 · 데일리리포트</b><span className="pill" data-g="closed-count">{cnt.closed} / {cnt.total}</span><span className="spacer" />
        <label className="ckl"><input type="checkbox" className="ck all" checked={all} disabled={!selectable.length} onChange={(e) => setAll(e.target.checked)} />이 묶음 전체</label></div>
      {!d.daily.length && <Row icon="—" cls="dim"><b>오늘 판이 없습니다</b></Row>}
      {d.daily.map((r) => {
        const ck = r.state === "ready" || r.state === "sent" ? <label className="ckl"><input type="checkbox" className="ck" checked={sel.has(r.id)} onChange={() => toggle(r.id)} /></label> : null;
        const tags = <div className="tags"><span className="tag on">마감됨</span>{r.cap && <span className="tag">{r.cap}</span>}{r.kind && <span className="tag type">{r.kind}</span>}</div>;
        if (r.state === "open") return <Row key={r.id} icon="⏳" cls="dim" data-g="daily-row" data-state={r.state} right={<a className="btn sm gho" href="/today">오늘 화면으로 ↗</a>}><b>{r.name}</b><small>아직 마감 안 함 — <b>안 나갑니다</b></small></Row>;
        if (r.state === "holes") return <Row key={r.id} icon="⚠️" cls="warnrow" data-g="daily-row" data-state={r.state} right={<a className="btn sm" href="/today">고치기 ↗</a>}><b>{r.name}</b><small>안 채운 치환 자리가 있어 <b>안 나갑니다</b></small><div className="tags"><span className="tag" style={MISS}>{r.holes.map((h) => `{{${h}}}`).join(" ")} 가 안 채워졌습니다</span></div></Row>;
        if (r.state === "sent") return <Row key={r.id} icon="✅" cls="done" check={ck} data-g="daily-row" data-state={r.state} right={r.logId && <button className="btn sm gho" type="button" disabled={pending} data-act="resend" onClick={() => run(() => resendLog(r.logId), (x) => `다시 보냈습니다 — ${ranText(x.r)}`)}>다시 보내기</button>}><b>{r.name}</b><small>{r.log?.text}</small>{tags}</Row>;
        if (r.state === "scheduled") return <Row key={r.id} icon="⏰" data-g="daily-row" data-state={r.state} right={<button className="btn sm" type="button" disabled={pending} data-act="cancel" onClick={() => run(() => cancelSchedule(r.scheduledId), () => "예약을 취소했습니다")}>취소</button>}><b>{r.name}</b><small>예약 {whenLabel(r.scheduledAt, d.date)}</small>{tags}</Row>;
        if (r.state === "queued") return <Row key={r.id} icon="📤" data-g="daily-row" data-state={r.state}><b>{r.name}</b><small>{r.job?.state === "fail" ? `실패 — ${r.job.last_error ?? ""}` : "보내는 중"}</small>{tags}</Row>;
        return <Row key={r.id} icon="📄" check={ck} data-g="daily-row" data-state={r.state} right={<span className="pill">보낼 것</span>}><b>{r.name}</b><small>{r.comment ? r.comment.slice(0, 70) + (r.comment.length > 70 ? "…" : "") : "(수업일지 글이 없습니다)"}</small>{tags}</Row>;
      })}
    </section>

    <section className="sgrp" data-card="auto">
      <div className="sgh"><span className="sgi">🔔</span><b>저절로 나가는 것 · 등원·하원 · 결석·지각 예정</b><span className="pill">{d.auto.length}</span><span className="spacer" /><span className="note" style={{ margin: 0 }}>아이가 찍은 등원·하원과 02c 「학부모께 알림」이 넣은 것 — 나간 것은 아래 「오늘 나간 것」에</span></div>
      {!d.auto.length && <Row icon="—" cls="dim"><b>기다리는 것이 없습니다</b></Row>}
      {d.auto.map((r) => <Row key={r.id} icon={r.icon} data-g="auto-row"><b>{r.name} 학부모 · {r.what}</b><small>{r.state.text}</small></Row>)}
    </section>

    <section className="sgrp" data-card="scheduled">
      <div className="sgh"><span className="sgi">📢</span><b>예약된 것</b><span className="pill" data-g="sch-count">{d.scheduled.length}</span></div>
      {!d.scheduled.length && <Row icon="—" cls="dim"><b>예약이 없습니다</b></Row>}
      {d.scheduled.map((r) => <Row key={r.id ?? `j${r.jobId}`} icon="⏰" data-g="sch-row" right={r.cancellable && <button className="btn sm" type="button" disabled={pending} data-act="cancel" onClick={() => run(() => cancelSchedule(r.id), () => "예약을 취소했습니다")}>취소</button>}><b>{r.name} · {r.what}</b><small>{r.when}</small></Row>)}
    </section>

    <div className="sgrp" data-card="sent">
      <button className="donehead" type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ margin: 0 }} data-g="sent-head"><span className="ar">›</span><span style={{ whiteSpace: "nowrap" }}>오늘 나간 것 <b>{d.sent.length}</b></span><span className="spacer" />
        <span className="tag on"><i className="ic">👁️</i> 읽음 {rc.read}</span><span className="tag" style={MISS}><i className="ic no">👁️</i> 안 읽음 {rc.unread}</span>
        {rc.rehearsal > 0 && <span className="tag">🧪 리허설 {rc.rehearsal}</span>}{rc.failed > 0 && <span className="tag" style={MISS}>⚠️ 못 보냄 {rc.failed}</span>}</button>
      <div className="donebody">
        {!d.sent.length && <Row icon="—" cls="dim"><b>오늘 나간 것이 없습니다</b></Row>}
        {d.sent.map((r) => <Row key={r.id} icon={r.status.icon} cls="done" data-g="sent-row" right={r.resendable && <button className="btn sm gho" type="button" disabled={pending} data-act="resend" onClick={() => run(() => resendLog(r.id), (x) => `다시 보냈습니다 — ${ranText(x.r)}`)}>다시 보내기</button>}><b>{r.name} · {r.what}</b><small>{r.status.text}</small></Row>)}
      </div>
    </div>

    <div className="savebar sendbar" data-g="sendbar">
      <label className="ckl"><input type="checkbox" className="ck allall" checked={all} disabled={!selectable.length} onChange={(e) => setAll(e.target.checked)} />전체 선택</label>
      <span className="pill">선택 <b>{ids.length}</b>건</span>
      <button className="btn pri" type="button" data-act="send-now" disabled={pending || !ids.length} onClick={() => run(() => sendSelected(ids), (x) => `보냈습니다 — ${ranText(x.r)}`)}>📨 선택한 것 지금 보내기</button>
      <button className="btn" type="button" data-act="schedule" disabled={pending || !ids.length} onClick={() => run(() => scheduleSelected(ids, when, when === "custom" ? { date: cDate, time: cTime } : null), (x) => `예약했습니다 — ${x.n}건 · ${whenLabel(x.at, d.date)}`)}>⏰ 예약</button>
      <div className="seg sm" data-g="when">{whenChoices(d.rules).map(([k, name]) => <button key={k} type="button" aria-pressed={when === k} onClick={() => setWhen(k)}>{name}</button>)}</div>
      {when === "custom" && <><input type="date" value={cDate} min={d.date} onChange={(e) => setCDate(e.target.value)} style={{ width: "auto" }} aria-label="예약 날짜" /><input type="time" value={cTime} onChange={(e) => setCTime(e.target.value)} style={{ width: "auto" }} aria-label="예약 시각" /></>}
      <span className="spacer" />
      <span className="pill" style={{ background: "var(--ok-fill)", color: "var(--on-ok)", borderColor: "transparent" }}>앱 알림만</span>
    </div>
  </>);
}
