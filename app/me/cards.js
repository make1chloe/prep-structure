"use client";
/** 아이 화면의 누르는 카드 — 등원·하원(걸음 셋 · 반 고르기 · 집에 가요) · 「다 했어요」. 되돌릴 수 없는 것(등원 찍기)은 서버 답을 기다린다 */
import { useState, useTransition } from "react";
import { arrive, said } from "./actions.js";
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
