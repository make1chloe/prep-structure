"use client";
/** 발송 판(목업 10) · 고르고 · 한 번에 · 예약(확정-㉕). 되돌릴 수 없는 것(보내기·예약)은 서버 답을 기다린다(속도-5). 판단은 lib/send-plan(순수) · 여기는 그린다.
 *  (어39) 줄은 말하지 않는다(대전제-21 · 원장님 9/15 「아이콘 · 기호 · 취소선 · 투명도 … 굳이 텍스트로 다 문장으로 적지 않아도」): 상태는 아이콘 + 흐림(마감 전) + 취소선(나간 것) · 툴팁은 명사 하나.
 *  줄을 펼치면(▸) 나갈 글을 보고 **그 자리에서** 고친다(대전제-22 · 원장님 9/15 「토글을 써서 필요시 확인하고 수정하는 것까지 가능하게」) · 다른 화면으로 보내는 👉 는 0 */
import Link from "next/link";
import Tip from "../_shell/tip.js";
import { usePick, PickAll, PickBox } from "../_shell/pick.js";   /* 고르기 한 벌((어28)-⑤ · 대전제-20) · 발송의 고르기도 같은 부품 · 띠 대신 늘 있는 아래 sendbar 가 한 번에 할 단추 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendSelected, scheduleSelected, cancelSchedule, resendLog, saveDailyAct, lateSendAct } from "./actions.js";
import { whenLabel, nowCount, closedCount, placeholderRows } from "@/lib/send-plan";
import When, { customOf } from "./when.js";   // ⏰ 예약 때 고르기 — 월간·수강료와 같은 부품((어))
import Templates from "./templates.js";   // ✉️ 문자 문구 — 원장님이 고친다((커))
/** 줄 한 벌 · 아이콘(툴팁은 명사 하나) · 고르기 네모 · 이름 · 오른쪽 단추 · 펼치기 ▸(fold 가 있을 때만) */
const Row = ({ icon = null, tip = null, cls = "", check = null, right = null, fold = null, open = false, onFold = null, children, ...rest }) => (
  <div className={"srow" + (cls ? " " + cls : "") + (open ? " open" : "")} {...rest}>{check}{icon != null && <span className="si" title={tip ?? undefined}>{icon}</span>}<div className="sn">{children}{open && fold}</div>{fold && <button type="button" className="btn sm gho sfold" aria-expanded={open} aria-label="글 펼치기" data-act="fold" onClick={onFold}>{open ? "▾" : "▸"}</button>}{right}</div>
);
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
/** 펼친 줄 · 부모님께 나갈 글. 아직 안 나간 줄(마감 전 · 보낼 것 · 빈 칸 · 예약)은 그 자리에서 수정 저장(lib/send editDaily) · 나간 줄은 읽기만 */
function DailyText({ r, editable, pending, run }) {
  const [text, setText] = useState(r.comment);
  useEffect(() => { setText(r.comment); }, [r.comment]);
  return (
    <div className="sbody" data-g="daily-text">
      {editable
        ? <><textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="부모님께 글" disabled={pending} />
            <div className="wv" style={{ gap: 6, marginTop: 4 }}><button type="button" className="btn sm pri" data-act="save-text" disabled={pending || text === r.comment} onClick={() => run(() => saveDailyAct(r.id, text), () => "저장 ✓", true)}>저장</button>{r.holes.length > 0 && <span className="tag" style={MISS}>{r.holes.map((h) => `{{${h}}}`).join(" ")}</span>}</div></>
        : <p className="note" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.comment || "글 없음"}</p>}
    </div>
  );
}
/** 🕘 아직 안 보낸 하원 지연 안내 · 사유가 있으면 「보내기」 · 없으면 사유 한 칸 + 「보내기」 · 다 그 자리에서(오늘 화면으로 안 보낸다) */
function LateSend({ r, pending, run }) {
  const [reason, setReason] = useState(r.reason);
  return (
    <span className="wv" style={{ gap: 6, margin: 0 }} data-g="late-send">
      {r.noReason && <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="사유" placeholder="사유" disabled={pending} style={{ width: 150 }} />}
      <button type="button" className="btn sm pri" data-act="late-send" disabled={pending || !reason.trim()} onClick={() => run(() => lateSendAct(r.id, reason), () => "보냄 ✓", true)}>보내기</button>
    </span>
  );
}
export default function Board({ d }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [open, setOpen] = useState(false);
  const [openIds, setOpenIds] = useState(() => new Set());   // 펼친 줄(화면 안에만)
  const toggle = (id) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectable = useMemo(() => d.daily.filter((r) => r.state === "ready" || r.state === "sent").map((r) => r.id), [d]);
  const pk = usePick(selectable, d.daily.filter((r) => r.checked).map((r) => r.id));   // 마감한 수업 일지는 처음부터 고른 채(그대로) · 셈은 lib/pick-plan 한 벌
  const [when, setWhen] = useState("evening"); const [cDate, setCDate] = useState(d.date); const [cTime, setCTime] = useState("18:00");
  const ids = pk.ids;
  const run = (fn, okMsg, keep = false) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } setMsg(okMsg(r)); if (!keep) pk.clear(); router.refresh(); });
  const cnt = closedCount(d.daily), nowN = nowCount(d.late);
  const fails = d.failWhy ?? [];   // 못 보낸 까닭은 **한 번씩만**(2026-09-12) · 줄마다 반복하던 것을 머리로
  const rc = d.sent.reduce((c, s) => { if (s.status.read) c.read++; else if (s.status.unread) c.unread++; else if (s.status.bad) c.failed++; else c.rehearsal++; return c; }, { read: 0, unread: 0, failed: 0, rehearsal: 0 });
  const ranText = (r) => `${r.ok}건 · 실패 ${r.bad}${r.deferred ? ` · 방해금지로 미룸 ${r.deferred}` : ""}`;
  const tagsOf = (r, first = <span className="tag on">마감됨</span>) => <div className="tags">{first}{r.cap && <span className="tag">{r.cap}</span>}{r.kind && <span className="tag type">{r.kind}</span>}</div>;
  return (<>
    <div className="wv" style={{ marginBottom: 8 }}>
      <span className="pill">{d.date}</span>
      <span className={"pill" + (nowN ? " warn" : "")} data-g="now-count">🌙 지금 보낼 것 {nowN}</span>
      <span className="pill" data-g="sel-count">선택 {ids.length}건</span>
      <span className={"pill" + (d.sink === "live" ? " hw" : "")} data-g="sink">{d.sink === "live" ? "앱 알림만" : `🧪 리허설(${d.sink}) · 실제로는 안 나감`}</span>
      {d.reach && <span className="pill" data-g="reach">닿는 길 · 학부모 {d.reach.parents}명 · 로그인한 집 {d.reach.signed_in} · 알림 켠 기기 {d.reach.devices}대</span>}
      <span className="spacer" /><Link prefetch={false} className="btn sm goto" href="/send/monthly" data-act="monthly">📊 월간 리포트</Link><Link prefetch={false} className="btn sm goto" href="/send/notice" data-act="notice">📢 공지</Link>
    </div>
    {d.sinkBad && <p className="note" role="alert" data-g="sink-bad" style={{ margin: "0 0 8px", color: "var(--miss)" }}>
      <b>스위치 값이 이상해서 아무것도 안 나갑니다</b> · {d.sinkBad}. 아래 ⓘ 대로 고치십시오.</p>}
    {d.sink !== "live" && <p className="note k" data-g="sink-how" style={{ margin: "0 0 8px" }}>
      🧪 리허설이라 <b>실제로는 안 나갑니다</b>.<Tip label="켜는 법">Vercel → Settings → Environment Variables 에 <b>NOTIFY_SINK</b> = <b>live</b>(<b>Production</b> 체크) → Save → Deployments 맨 위 <b>⋯ → Redeploy</b>. 이미 배포된 것에는 안 붙어서 Redeploy 를 해야 그때부터 읽습니다. 켜지면 이 표시가 「앱 알림만」이 됩니다.</Tip></p>}
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}

    <section className={"sgrp" + (nowN ? " now" : "")} data-card="now">
      <div className="sgh"><span className="sgi">🕘</span><b>지금 · 수업 중에</b><span className={"pill" + (nowN ? " warn" : "")}>{d.late.length}</span><span className="spacer" /></div>
      {!d.late.length && <Row icon="" cls="dim"><b>없음</b></Row>}
      {d.late.map((r) => r.sent
        ? <Row key={r.id} icon="✅" tip="보냄" cls="done" data-g="late-row"><b>{r.name} · 하원 지연 안내</b><small>{r.until} 예정 · <b>{r.sent}에 보냄</b>{r.log ? ` · ${r.log.text}` : ""}</small><div className="tags" style={{ marginTop: 4 }}><span className="tag on">✓ 보냄</span>{r.reason && <span className="tag">{r.reason}</span>}</div></Row>
        : <Row key={r.id} icon="🕙" tip="안 보냄" data-g="late-row" right={<LateSend r={r} pending={pending} run={run} />}><b>{r.name} · 하원 지연 안내</b><small>{r.until} 예정</small>{!r.noReason && <div className="tags" style={{ marginTop: 4 }}><span className="tag">{r.reason}</span></div>}</Row>)}
    </section>

    <section className="sgrp" data-card="daily">
      <div className="sgh"><span className="sgi">📨</span><b>데일리리포트 · 마감한 것</b><span className="pill" data-g="closed-count">{cnt.closed} / {cnt.total}</span><span className="spacer" />
        <PickAll pick={pk} label="이 목록 전체" disabled={!selectable.length} /></div>
      {!d.daily.length && <Row icon="" cls="dim"><b>없음</b></Row>}
      {d.daily.map((r) => {
        const ck = r.state === "ready" || r.state === "sent" ? <PickBox pick={pk} id={r.id} label={`${r.name} 고르기`} /> : null;
        const f = { fold: <DailyText r={r} editable={["open", "ready", "holes", "scheduled"].includes(r.state)} pending={pending} run={run} />, open: openIds.has(r.id), onFold: () => toggle(r.id) };
        if (r.state === "open") return <Row key={r.id} icon="⏳" tip="마감 전" cls="dim" data-g="daily-row" data-state={r.state} {...f}><b>{r.name}</b></Row>;
        if (r.state === "holes") return <Row key={r.id} icon="⚠️" tip="빈 칸" cls="warnrow" data-g="daily-row" data-state={r.state} {...f}><b>{r.name}</b>{tagsOf(r, <span className="tag" style={MISS}>{r.holes.map((h) => `{{${h}}}`).join(" ")}</span>)}</Row>;
        if (r.state === "sent") return <Row key={r.id} icon="✅" tip="보냄" cls="done" check={ck} data-g="daily-row" data-state={r.state} right={r.logId && <button className="btn sm gho" type="button" disabled={pending} data-act="resend" onClick={() => run(() => resendLog(r.logId), (x) => `다시 보냄 ✓ · ${ranText(x.r)}`)}>다시 보내기</button>} {...f}><b>{r.name}</b><small>{r.log?.text}</small>{tagsOf(r)}</Row>;
        if (r.state === "scheduled") return <Row key={r.id} icon="⏰" tip="예약" data-g="daily-row" data-state={r.state} right={<button className="btn sm" type="button" disabled={pending} data-act="cancel" onClick={() => run(() => cancelSchedule(r.scheduledId), () => "예약 취소 ✓")}>취소</button>} {...f}><b>{r.name}</b>{tagsOf(r, <span className="tag on">⏰ {whenLabel(r.scheduledAt, d.date)}</span>)}</Row>;
        if (r.state === "queued") return <Row key={r.id} icon="📤" tip="보내는 중" data-g="daily-row" data-state={r.state} {...f}><b>{r.name}</b>{r.job?.state === "fail" && <small>실패 · {r.job.last_error ?? ""}</small>}{tagsOf(r)}</Row>;
        return <Row key={r.id} icon="📄" tip="보낼 것" check={ck} data-g="daily-row" data-state={r.state} {...f}><b>{r.name}</b>{tagsOf(r)}</Row>;
      })}
    </section>

    <section className="sgrp" data-card="auto">
      <div className="sgh"><span className="sgi">🔔</span><b>저절로 나가는 것 · 등원·하원 · 결석·지각 예정</b><span className="pill">{d.auto.length}</span><span className="spacer" /></div>
      {!d.auto.length && <Row icon="" cls="dim"><b>없음</b></Row>}
      {d.auto.map((r) => <Row key={r.id} icon={r.icon} data-g="auto-row"><b>{r.name} 학부모 · {r.what}</b><small>{r.state.text}</small></Row>)}
    </section>

    <section className="sgrp" data-card="scheduled">
      <div className="sgh"><span className="sgi">📢</span><b>예약된 것</b><span className="pill" data-g="sch-count">{d.scheduled.length}</span></div>
      {!d.scheduled.length && <Row icon="" cls="dim"><b>없음</b></Row>}
      {d.scheduled.map((r) => <Row key={r.id ?? `j${r.jobId}`} icon="⏰" tip="예약" data-g="sch-row" right={r.cancellable && <button className="btn sm" type="button" disabled={pending} data-act="cancel" onClick={() => run(() => cancelSchedule(r.id), () => "예약 취소 ✓")}>취소</button>}><b>{r.name} · {r.what}</b><small>{r.when}</small></Row>)}
    </section>

    <div className="sgrp" data-card="sent">
      <button className="donehead" type="button" aria-expanded={open} onClick={() => setOpen(!open)} style={{ margin: 0 }} data-g="sent-head"><span className="ar">›</span><span style={{ whiteSpace: "nowrap" }}>오늘 나간 것 <b>{d.sent.length}</b></span><span className="spacer" />
        <span className="tag on"><i className="ic">👁️</i> 읽음 {rc.read}</span><span className="tag" style={MISS}><i className="ic no">👁️</i> 안 읽음 {rc.unread}</span>
        {rc.rehearsal > 0 && <span className="tag">🧪 리허설 {rc.rehearsal}</span>}{rc.failed > 0 && <span className="tag" style={MISS}>⚠️ 못 보냄 {rc.failed}</span>}</button>
      {fails.length > 0 && <p className="note" data-g="fail-why" style={{ margin: "4px 0 0", color: "var(--miss)" }}>{fails.map((f) => `${f.why} ${f.n}`).join(" · ")}</p>}
      <div className="donebody">
        {!d.sent.length && <Row icon="" cls="dim"><b>없음</b></Row>}
        {d.sent.map((r) => <Row key={r.id} icon={r.status.icon} cls="done" data-g="sent-row" right={r.resendable && <button className="btn sm gho" type="button" disabled={pending} data-act="resend" onClick={() => run(() => resendLog(r.id), (x) => `다시 보냄 ✓ · ${ranText(x.r)}`)}>다시 보내기</button>}><b>{r.name} · {r.what}</b><small>{r.status.text}</small></Row>)}
      </div>
    </div>
    <Templates items={d.templates ?? []} ready={d.smsReady} placeholders={d.placeholders ?? []} kinds={d.smsKinds ?? []} />
    {(d.placeholders ?? []).length > 0 && <div className="sgrp" data-card="placeholders"><div className="sgh"><b>{"{{ }}"} 치환 칸</b><span className="spacer" /><span className="pill">{(d.placeholders ?? []).length}</span></div>
      <div className="tags" data-g="placeholders">{placeholderRows(d.placeholders).map((r) => <span key={r.key} className="tag" title={r.text}>{r.tag}</span>)}</div>
      {/* 칩마다 title 에 뜻이 이미 붙어 있다 — 아래에 같은 것을 또 늘어놓지 않는다(2026-09-12 · 144자) */}
      </div>}

    <div className="savebar sendbar" data-g="sendbar">
      <PickAll pick={pk} label="전체 선택" disabled={!selectable.length} />
      <span className="pill">선택 <b>{ids.length}</b>건</span>
      <button className="btn pri" type="button" data-act="send-now" disabled={pending || !ids.length} onClick={() => run(() => sendSelected(ids), (x) => `보냄 ✓ · ${ranText(x.r)}`)}>📨 지금 보내기</button>
      <button className="btn" type="button" data-act="schedule" disabled={pending || !ids.length} onClick={() => run(() => scheduleSelected(ids, when, customOf(when, cDate, cTime)), (x) => `예약 ✓ · ${x.n}건 · ${whenLabel(x.at, d.date)}`)}>⏰ 예약</button>
      <When rules={d.rules} date={d.date} when={when} setWhen={setWhen} cDate={cDate} setCDate={setCDate} cTime={cTime} setCTime={setCTime} />
      <span className="spacer" />
      <span className="pill" style={{ background: "var(--ok-fill)", color: "var(--on-ok)", borderColor: "transparent" }}>앱 알림만</span>
    </div>
  </>);
}
