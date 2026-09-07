"use client";
/** 반 판(4단계-3a) — + 반 만들기 · 반마다: 이름·갈래 · 시간표(이 날부터 바꾸기 · 다음 시간표 예약) · 명단(넣기·빼기) · 반 단가 줄 · 닫기. 닫은 반은 아래 접어 둔다(지우지 않는다) */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addAct, scheduleAct, nameAct, closeAct, memberAct, removeAct, feeAct } from "./actions.js";
import { KIND, kindName, weekdayText, timeText, feeText, candidates, classLine } from "@/lib/class-plan";
import { W, sessionsOf } from "@/lib/schedule-plan";
const DAYS = [1, 2, 3, 4, 5, 6, 0];
function Weekdays({ value, onChange, disabled }) {
  return <div className="seg sm" data-g="weekdays">{DAYS.map((d) => <button key={d} type="button" aria-pressed={value.includes(d)} disabled={disabled} onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])}>{W[d]}</button>)}</div>;
}
function ScheduleForm({ init, on, disabled, onSave, label = "이 날부터 바꾸기" }) {
  const [f, setF] = useState({ weekdays: init?.weekdays ?? [], start: String(init?.start_time ?? "").slice(0, 5), end: String(init?.end_time ?? "").slice(0, 5), fromDate: on });
  return <div className="wv" style={{ marginBottom: 0 }} data-g="schedule-form">
    <Weekdays value={f.weekdays} onChange={(w) => setF({ ...f, weekdays: w })} disabled={disabled} />
    <input type="text" value={f.start} aria-label="시작" placeholder="16:00" inputMode="numeric" style={{ maxWidth: 80 }} disabled={disabled} onChange={(e) => setF({ ...f, start: e.target.value })} />
    <span>~</span><input type="text" value={f.end} aria-label="끝" placeholder="17:30" inputMode="numeric" style={{ maxWidth: 80 }} disabled={disabled} onChange={(e) => setF({ ...f, end: e.target.value })} />
    <input type="date" className="dt" value={f.fromDate} aria-label="이 날부터" style={{ width: "auto" }} disabled={disabled} onChange={(e) => setF({ ...f, fromDate: e.target.value })} />
    <button type="button" className="btn sm pri" disabled={disabled} data-act="schedule-save" onClick={() => onSave(f)}>{label}</button></div>;
}
export default function Board({ d }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [add, setAdd] = useState(false); const [nf, setNf] = useState({ nickname: "", kind: "regular" });
  const [open, setOpen] = useState(null); const [showClosed, setShowClosed] = useState(false);
  const [pick, setPick] = useState({}); const [fee, setFee] = useState({}); const [name, setName] = useState({});
  const run = (fn, okMsg, after) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); after?.(r); router.refresh(); });
  const target = Number(d.rules?.["schedule.sessions_per_month"] ?? 8);
  const live = d.classes.filter((c) => c.state === "active"), closed = d.classes.filter((c) => c.state !== "active");
  return (<>
    <div className="wv" style={{ marginBottom: 8 }} data-g="head">
      <a className="btn sm gho" href="/schedule">← 일정</a><b style={{ fontSize: "var(--fs-5)" }}>🏫 반</b>
      <span className="pill" data-g="live-count">반 {live.length}</span>{closed.length > 0 && <span className="pill" data-g="closed-count">닫은 반 {closed.length}</span>}
      <span className="spacer" /><button type="button" className="btn sm pri" data-act="add-open" aria-pressed={add} onClick={() => setAdd(!add)}>+ 반 만들기</button>
    </div>
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="msg" style={{ margin: "0 0 8px", color: "var(--on-ok)" }}>{msg}</p>}
    {add && <div className="card" style={{ margin: "0 0 8px" }} data-g="add-form"><div className="ctitle"><span className="cemo">➕</span>새 반 — 이름 · 갈래 · 요일 · 시각 · 이 날부터</div>
      <div className="wv"><input type="text" value={nf.nickname} aria-label="반 이름" placeholder="예: 중2 월수 4시" style={{ maxWidth: 220 }} onChange={(e) => setNf({ ...nf, nickname: e.target.value })} />
        <div className="seg sm" data-g="kind">{KIND.map(([k, n]) => <button key={k} type="button" aria-pressed={nf.kind === k} onClick={() => setNf({ ...nf, kind: k })}>{n}</button>)}</div></div>
      <ScheduleForm init={null} on={d.on} disabled={pending} label="만들기" onSave={(f) => run(() => addAct({ ...nf, ...f }), "반을 만들었습니다 — 명단에 아이를 넣으세요", () => { setAdd(false); setNf({ nickname: "", kind: "regular" }); })} />
      <p className="note" style={{ margin: "6px 0 0" }}>회차·수강료·오늘 수업은 이 시간표에서 세어 나옵니다(12·13·01). 요일이 달라지면 「이 날부터 바꾸기」 — 옛 회차는 옛 시간표로 남습니다.</p></div>}
    {!live.length && <div className="card"><p className="note">반이 없습니다 — 「+ 반 만들기」</p></div>}
    {live.map((c) => { const s = sessionsOf(c, target), isOpen = open === c.id, cand = candidates(d.students, c.members); return (
      <div className="card" key={c.id} style={{ margin: "0 0 8px" }} data-g="class-row" data-class={c.id} data-open={isOpen ? "1" : "0"}>
        <div className="ctitle"><span className="cemo">🏫</span><span data-g="line">{classLine(c)}</span><span className="spacer" />
          <span className={"pill" + (c.kind === "special" ? "" : s.ok ? " hw" : " warn")} data-g="sessions">{`이 달 ${s.n}회`}{c.kind === "regular" && !s.ok ? ` · ${s.short}회 모자람` : ""}</span>
          {c.next_schedule && <span className="pill" data-g="next-schedule">{String(c.next_schedule.from_date).slice(5).replace("-", "/")}부터 {weekdayText(c.next_schedule.weekdays)} {timeText(c.next_schedule)}</span>}
          <button type="button" className="btn sm" data-act="open" aria-pressed={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}>{isOpen ? "접기" : "펴기"}</button></div>
        {isOpen && <>
          <div className="lf" style={{ marginTop: 8 }} data-g="name-edit"><span className="ln">✎</span><div><b>이름 · 갈래</b></div>
            <input type="text" value={name[c.id]?.nickname ?? c.nickname} aria-label="반 이름" style={{ maxWidth: 200 }} onChange={(e) => setName({ ...name, [c.id]: { ...(name[c.id] ?? { kind: c.kind }), nickname: e.target.value } })} />
            <div className="seg sm">{KIND.map(([k, n]) => <button key={k} type="button" aria-pressed={(name[c.id]?.kind ?? c.kind) === k} onClick={() => setName({ ...name, [c.id]: { ...(name[c.id] ?? { nickname: c.nickname }), kind: k } })}>{n}</button>)}</div>
            <button type="button" className="btn sm" disabled={pending || !name[c.id]} data-act="name-save" onClick={() => run(() => nameAct(c.id, name[c.id].nickname ?? c.nickname, name[c.id].kind ?? c.kind), "고쳤습니다", () => setName({ ...name, [c.id]: undefined }))}>저장</button></div>
          <div className="lf" style={{ marginTop: 8 }} data-g="schedule-edit"><span className="ln">🗓</span><div><b>시간표 — {c.schedule ? `${weekdayText(c.schedule.weekdays)} ${timeText(c.schedule)} · ${String(c.schedule.from_date).slice(0, 10)}부터` : "없음"}</b><small>바꾸면 그날부터 회차·수업이 새 시간표로 · 옛 회차는 그대로</small></div></div>
          <ScheduleForm init={c.schedule} on={d.on} disabled={pending} onSave={(f) => run(() => scheduleAct(c.id, f), (r) => (r.replaced ? "시간표를 고쳤습니다" : `${f.fromDate}부터 새 시간표입니다`))} />
          <div className="lf" style={{ marginTop: 8 }} data-g="members"><span className="ln">🧑‍🎓</span><div><b>명단 {c.members.length}명</b><small>오늘 기준 · 넣으면 그날부터 오늘 수업·회차·수강료에 선다 · 빼면 오늘부터 안 나옵니다(줄은 어제까지로 남습니다)</small></div></div>
          <div className="tags" style={{ margin: "4px 0 0" }} data-g="member-list">{c.members.map((m) => <span key={m.student_id} className="tag" data-g="member" data-student={m.student_id}>{m.name}{m.grade ? ` ${m.grade}학년` : ""} <button type="button" className="btn sm gho" style={{ padding: "0 4px", minHeight: 0 }} disabled={pending} data-act="member-remove" aria-label={`${m.name} 빼기`} onClick={() => run(() => removeAct(c.id, m.student_id, d.on), `${m.name} — 오늘부터 명단에서 뺐습니다`)}>✕</button></span>)}{!c.members.length && <span className="tag">아직 아무도 없습니다</span>}</div>
          <div className="wv" style={{ margin: "6px 0 0" }}><select value={pick[c.id] ?? ""} aria-label="넣을 아이" data-g="member-pick" style={{ width: "auto" }} onChange={(e) => setPick({ ...pick, [c.id]: e.target.value })}><option value="">+ 아이 넣기</option>{cand.map((st) => <option key={st.id} value={st.id}>{st.name}{st.grade ? ` · ${st.grade}학년` : ""}{st.school ? ` · ${st.school}` : ""}</option>)}</select>
            <button type="button" className="btn sm" disabled={pending || !pick[c.id]} data-act="member-add" onClick={() => run(() => memberAct(c.id, pick[c.id], d.on), "오늘부터 명단에 넣었습니다", () => setPick({ ...pick, [c.id]: "" }))}>오늘부터 넣기</button></div>
          <div className="lf" style={{ marginTop: 8 }} data-g="fee-edit"><span className="ln">💳</span><div><b>반 단가 — {feeText(c.fee)}</b><small>13 수강료의 단가 줄과 같은 표(fee_rule.class_id) · 학생별 금액이 있으면 그것이 먼저</small></div>
            <input type="text" inputMode="numeric" value={fee[c.id]?.amount ?? ""} aria-label="금액" placeholder="금액(원)" style={{ maxWidth: 120 }} onChange={(e) => setFee({ ...fee, [c.id]: { ...(fee[c.id] ?? {}), amount: e.target.value } })} />
            <label className="ckl"><input type="checkbox" className="ck" checked={Boolean(fee[c.id]?.perSession)} onChange={(e) => setFee({ ...fee, [c.id]: { ...(fee[c.id] ?? {}), perSession: e.target.checked } })} />회차제</label>
            <input type="date" className="dt" value={fee[c.id]?.fromDate ?? d.on} aria-label="단가 이 날부터" style={{ width: "auto" }} onChange={(e) => setFee({ ...fee, [c.id]: { ...(fee[c.id] ?? {}), fromDate: e.target.value } })} />
            <button type="button" className="btn sm" disabled={pending || !fee[c.id]?.amount} data-act="fee-save" onClick={() => run(() => feeAct(c.id, { ...fee[c.id], fromDate: fee[c.id]?.fromDate ?? d.on }), "단가 줄을 적었습니다 — 13 에서 이 달부터 셉니다", () => setFee({ ...fee, [c.id]: undefined }))}>단가 줄 적기</button></div>
          <div className="wv" style={{ marginTop: 8, marginBottom: 0 }}><span className="spacer" /><button type="button" className="btn sm" disabled={pending} data-act="close-class" onClick={() => { if (confirm(`「${c.nickname}」 반을 오늘부터 없는 반으로 닫을까요? 시간표·명단·단가 줄이 어제까지로 닫히고 옛 기록은 남습니다.`)) run(() => closeAct(c.id, d.on), "반을 닫았습니다", () => setOpen(null)); }}>반 닫기</button></div>
        </>}
      </div>); })}
    {closed.length > 0 && <div className="card" data-g="closed"><div className="ctitle"><span className="cemo">🗂</span>닫은 반 {closed.length}<span className="spacer" /><button type="button" className="btn sm" data-act="show-closed" aria-pressed={showClosed} onClick={() => setShowClosed(!showClosed)}>{showClosed ? "접기" : "보기"}</button></div>
      {showClosed && <div className="tags" style={{ marginTop: 6 }}>{closed.map((c) => <span key={c.id} className="tag" data-g="closed-class">{c.nickname} · {kindName(c.kind)}</span>)}</div>}</div>}
  </>);
}
