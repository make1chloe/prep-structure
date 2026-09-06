"use client";
/** 아이 화면의 누르는 카드 — 등원·하원(걸음 셋 · 반 고르기 · 집에 가요) · 「다 했어요」. 되돌릴 수 없는 것(등원 찍기)은 서버 답을 기다린다 */
import { useState, useTransition } from "react";
import { arrive, said, stage as setStageAct, due as setDueAct, submitScore } from "./actions.js";
import { md } from "@/lib/dash-plan";
import { STAGES, dueText, dueBad } from "@/lib/material-plan";
import { STEPS, LEAVE } from "@/lib/arrival-plan";
import { seoulTime } from "@/lib/day-plan";
export function ArrivalCard({ arrival, choice, off }) {
  const [err, setErr] = useState(""); const [pending, start] = useTransition(); const [cls, setCls] = useState(choice.classId ?? null);
  const go = (step) => start(async () => { setErr(""); const r = await arrive(step, cls); if (!r.ok) setErr(r.msg); });
  const pill = arrival.left ? `${seoulTime(arrival.leftAt)} 집에 감` : arrival.arrived ? `${seoulTime(arrival.arrivedAt)} 왔음` : "아직";
  return (
    <div className="task" data-card="arrival" style={{ borderColor: "var(--navy)" }}>
      <div className="h"><b><span className="cemo">🕘</span>등원 · 하원</b><span className="spacer" /><span className={"pill" + (arrival.arrived ? " hw" : "")} data-g="arrival-pill">{pill}</span></div>
      {off && <p className="note" style={{ margin: "8px 0 0" }}>오늘은 휴강이에요 — 찍을 것이 없어요</p>}
      {!off && choice.none && !arrival.arrived && <p className="note" style={{ margin: "8px 0 0" }}>오늘은 수업이 없어요</p>}
      {!off && choice.pick && !arrival.done.has(2) && <div className="lenrow" style={{ marginTop: 8 }}><span className="fl" style={{ margin: 0, whiteSpace: "nowrap" }}>어느 반</span>
        <div className="seg sm" data-g="pick-class">{choice.options.map((o) => <button key={o.id} type="button" aria-pressed={cls === o.id} onClick={() => setCls(o.id)}>{o.name} {o.start}</button>)}</div></div>}
      {!off && <div className="tags" style={{ marginTop: 8 }}>
        {STEPS.map(([n, name]) => arrival.done.has(n)
          ? <span key={n} className="tag on" data-step={n}>✓ {name}</span>
          : <button key={n} type="button" className="tag" data-step={n} disabled={pending || choice.none || arrival.left} onClick={() => go(n)}>{name}</button>)}
      </div>}
      <p className="note" style={{ margin: "4px 0 0" }}>학원 와이파이에서만 눌러집니다 · 시각은 앱이 찍습니다(내가 못 고칩니다){choice.pick ? " · 반이 둘인 날은 어느 반인지 먼저 고릅니다" : ""}</p>
      {!off && arrival.arrived && !arrival.left && <button type="button" className="btn pri" style={{ width: "100%", marginTop: 8 }} data-step={LEAVE} disabled={pending} onClick={() => go(LEAVE)}>🏠 집에 가요</button>}
      {arrival.arrived && !arrival.left && <p className="note" style={{ margin: "4px 0 0" }}>누르면 어머니께 하원 알림이 갑니다 — 원장님 화면 「실제 하원」과 같은 한 줄</p>}
      {err && <div className="lf warn" role="alert" style={{ marginTop: 8 }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
    </div>
  );
}
/** 「다 했어요」 — 학원 줄은 차례대로(지금 할 것만 누른다), 숙제 줄은 아무 때나. 무를 수 있다 */
export function SaidButton({ item, state = "now" }) {   // 마감 뒤에도 누른다 — 숙제는 마감 뒤 저녁에 한다(DB 문은 내 판이면 열려 있다)
  const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const on = Boolean(item.said_done_at);
  const flip = () => start(async () => { setErr(""); const r = await said(item.id, !on); if (!r.ok) setErr(r.msg); });
  if (state === "locked") return <span className="tag" data-g="locked">앞엣것부터</span>;
  return (<>
    <button type="button" className={"btn sm" + (on ? "" : " pri")} data-act="said" aria-pressed={on} disabled={pending} onClick={flip}>{on ? "했어요 ✓ · 무르기" : "다 했어요"}</button>
    {err && <span className="note" role="alert" style={{ margin: 0, color: "var(--miss)" }}>{err}</span>}
  </>);
}

/** 📚 받을 교재·학습지 — 갈래별 · 단계 넷(아직·받음·하는 중·완료) · 스스로 정한 마감(선생님 달력에도) · 끝낸 것은 접힘 */
export function MaterialCard({ gives, today }) {
  const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const total = gives.groups.reduce((n, g) => n + g.items.length, 0) + gives.done.length;
  const run = (fn) => start(async () => { setErr(""); const r = await fn(); if (!r.ok) setErr(r.msg); });
  const Item = ({ it, dim = false }) => (
    <div className="task" style={{ marginTop: 4, padding: 8, background: dim ? "var(--sunk)" : undefined }} data-material={it.material_id}>
      <div className="h"><b style={{ fontSize: "var(--fs-3)" }}>{it.material?.title}</b><span className="spacer" />
        {it.due_on && it.stage !== "done" && <span className={"pill" + (dueBad(it.due_on, today) ? " bad" : " warn")} data-g="due">{dueText(it.due_on, today)}</span>}
        {it.stage === "done" && <span className="tag on">완료</span>}</div>
      <div className="stage" data-g="stage">{STAGES.map(([k, name]) => <button key={k} type="button" aria-pressed={it.stage === k} disabled={pending} onClick={() => run(() => setStageAct(it.material_id, k))}>{name}</button>)}</div>
      {it.stage !== "done" && <div className="wv" style={{ marginTop: 4, marginBottom: 0 }}><label className="fl" style={{ margin: 0 }}>내가 정한 마감</label>
        <input type="date" defaultValue={it.due_on ?? ""} min={today} aria-label="내가 정한 마감" style={{ width: "auto" }} onChange={(e) => run(() => setDueAct(it.material_id, e.target.value))} />
        <span className="note" style={{ margin: 0 }}>내가 정한 날짜예요 — 선생님 달력에도 떠 있어요</span></div>}
    </div>);
  return (
    <div className="task" data-card="material">
      <div className="h"><b><span className="cemo">📚</span>받을 교재·학습지</b><span className="spacer" /><span className="pill">{total ? `${gives.done.length}/${total}` : "없음"}</span></div>
      {!total && <p className="note" style={{ margin: "8px 0 0" }}>아직 받을 학습지가 없어요</p>}
      {gives.groups.map((g, i) => <div key={g.name}><div style={{ marginTop: i ? 12 : 8, fontSize: "var(--fs-2)", fontWeight: 700, color: "var(--faint)" }}>{i + 1} {g.name}</div>{g.items.map((it) => <Item key={it.material_id} it={it} />)}</div>)}
      {gives.done.length > 0 && <details style={{ marginTop: 8 }}><summary className="donehead" style={{ cursor: "pointer", listStyle: "none" }}><span className="ar">›</span>끝낸 것 <b>{gives.done.length}</b><span className="spacer" /><span className="tag on">눌러서 펴기</span></summary>{gives.done.map((it) => <Item key={it.material_id} it={it} dim />)}</details>}
      {err && <div className="lf warn" role="alert" style={{ marginTop: 8 }}><span className="ln">!</span><div><b>{err}</b></div><button type="button" className="btn sm" onClick={() => setErr("")}>닫기</button></div>}
    </div>
  );
}

/** 📈 성적 — 원장님이 공개한 시험만 보인다 · 내가 넣은 것은 「확인 기다리는 중」 · 본 회차가 있으면 원점수·틀린 번호를 넣는다(목업 16 「아이가 넣고 원장님이 확인」 · 9/5 ⑯) */
export function ScoreCard({ scores = [], entry = [] }) {
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [pending, start] = useTransition(); const [f, setF] = useState({});
  if (!scores.length && !entry.length) return null;   // 빈 카드는 숨긴다(확정-⑮)
  const v = (id, k, d = "") => f[id]?.[k] ?? d, setV = (id, k, val) => setF({ ...f, [id]: { ...(f[id] ?? {}), [k]: val } });
  const go = (e) => start(async () => { setErr(""); setMsg(""); const r = await submitScore(e.id, v(e.id, "raw"), v(e.id, "full", "100"), v(e.id, "wrongs")); if (!r.ok) { setErr(r.msg); return; } setMsg(`넣었어요 — 선생님이 확인하면 굳어요`); setF({}); });
  return <div className="task" data-card="scores"><div className="h"><b><span className="cemo">📈</span>성적</b><span className="spacer" />{scores.length > 0 && <span className="pill">{scores[0].title}</span>}</div>
    {scores.map((s) => <div className="li" key={s.id} data-g="score-line" data-pending={s.pending ? "1" : "0"}><div><b>{s.title}</b><small>{s.small || "원장님이 공개한 시험"}</small></div>{s.pending && <span className="tag act">확인 기다리는 중</span>}</div>)}
    {entry.map((e) => <div className="li" key={e.id} data-g="score-entry" data-exam={e.id}><div><b>{e.school} {e.name} — 점수를 넣어요</b><small>{md(e.on)} 본 시험 · 원점수와 틀린 번호(눌러도 적어도 같은 값)</small>
      <div className="wv" style={{ marginTop: 6 }}><input type="text" inputMode="numeric" className="scr" placeholder="원점수" aria-label="원점수" value={v(e.id, "raw")} onChange={(x) => setV(e.id, "raw", x.target.value)} /><span className="note" style={{ margin: 0 }}>/</span><input type="text" inputMode="numeric" className="scr sm2" placeholder="100" aria-label="만점" value={v(e.id, "full")} onChange={(x) => setV(e.id, "full", x.target.value)} />
        <input type="text" placeholder="틀린 번호 (예: 3, 7, 11)" aria-label="틀린 번호" value={v(e.id, "wrongs")} onChange={(x) => setV(e.id, "wrongs", x.target.value)} style={{ flex: "1 1 160px" }} />
        <button className="btn sm pri" type="button" disabled={pending || !String(v(e.id, "raw")).trim()} data-act="score-submit" onClick={() => go(e)}>넣기</button></div></div></div>)}
    {err && <p className="note" role="alert" style={{ margin: "6px 0 0", color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="score-msg" style={{ margin: "6px 0 0", color: "var(--on-ok)" }}>{msg}</p>}
    {scores.length > 0 && <p className="note k" style={{ margin: "6px 0 0" }}>원장님이 공개한 시험만 보여요.</p>}
  </div>;
}
