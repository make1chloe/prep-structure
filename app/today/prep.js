"use client";
/** 📄 내신 자료 — 01 의 업무 하나((어21) · 원장님 9/14 「수업 중 01 을 안 떠납니다 — 이게 내가 원하는거야」). 교재가 멈춘 아이만 선다 — 멈췄나는 routine-plan stopOn(교재 머리와 같은 판단).
 *  보는 것은 자리에(시험 머리 · 학교 시험 범위 · 이 아이 자료 줄 · 안 준 자료) · 손질(범위 고르기)만 펼친다. 손은 04·06b 와 같은 것(handAct · scoredAct · giveAct · scopeAct) — 새 손 0 · 새 자료 만들기는 04 로(「04 전체 👉」) */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ScopeForm from "../_shell/scopeform.js";
import { handAct, giveAct } from "../schedule/exams/prep/actions.js";
import { scoredAct } from "../schedule/todo/actions.js";
import { prepOf, MATERIAL_STATE, sourceEmo } from "@/lib/todo-plan";
import { stopOn } from "@/lib/routine-plan";
import { mdDot } from "@/lib/exam-plan";
export default function PrepCard({ student, prep = [], date, closed = false }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [scopeFor, setScopeFor] = useState(null);
  const run = (fn, done, after) => start(async () => { setErr(""); const r = await fn(); if (!r?.ok) { setErr(r?.msg ?? "안 됐습니다"); return r; } if (done) { setMsg(typeof done === "function" ? done(r) : done); router.refresh(); } after?.(); return r; });
  const list = prepOf(prep, date, stopOn);
  const books = (student.books ?? []).map((b) => ({ id: b.book_id, name: b.books?.name ?? b.name, area: b.books?.area ?? b.area }));
  return (<div className="card" data-card="prep">
    <div className="ctitle"><span className="cemo">📄</span>내신 자료<span className="auto">{list.length ? `시험 ${list.length}` : "멈춘 교재 없음"}</span><span className="spacer" />
      <Link prefetch={false} className="btn sm" href={list.length ? `/schedule/exams/prep?e=${list[0].exam.id}` : "/schedule/exams/prep"} data-g="to-prep">📄 04 전체 👉</Link></div>
    {err && <p className="note" role="alert" style={{ color: "var(--miss)" }}>{err}</p>}
    {msg && <p className="note" data-g="prep-msg" style={{ color: "var(--on-ok)" }}>{msg}</p>}
    {list.map(({ exam: e, stopped, rows, notGiven, scopes, dday }) => <div key={e.id} data-g="prep-exam" data-exam={e.id} style={{ marginBottom: 8 }}>
      <div className="wv" style={{ margin: "0 0 8px" }}><span className="pill">🏛️ {e.school ?? "전국"} · {e.name}</span>{e.english_on ? <span className="pill warn">영어 {mdDot(e.english_on)} · {dday}</span> : <span className="pill">영어 시험일 없음</span>}<span className="spacer" />
        <span className="tag" data-g="prep-stopped">{stopped.map((b) => b.name).join(" · ")} 보류{stopped[0]?.stop_until ? ` · ${mdDot(stopped[0].stop_until)} 에 풀림` : ""}</span></div>
      <div className="lf" style={{ marginBottom: 6 }} data-g="prep-scope" data-scopes={scopes}><span className="ln">📐</span><div><b>학교 시험 범위{scopes ? ` · ${scopes}줄` : ""}</b>{!scopes && <small>없음</small>}</div>
        <button className="btn sm" type="button" data-act="scope-open" aria-pressed={scopeFor === e.id} onClick={() => setScopeFor(scopeFor === e.id ? null : e.id)}>{scopes ? "수정" : "고르기"}</button></div>
      {scopeFor === e.id && <ScopeForm examId={e.id} books={books} pending={pending} run={run} onDone={() => setScopeFor(null)} />}
      {rows.filter((r) => r.give).map((r) => <div className="lf" key={r.material.id} data-g="prep-row" data-material={r.material.id} data-can={r.can ?? ""} style={{ marginBottom: 6 }}><span className="ln">{sourceEmo(r.material.source)}</span><div><b>{r.material.type} · {r.material.title}</b><small>{MATERIAL_STATE[r.material.state] ?? r.material.state}</small></div><span className={"tag" + (r.can === "hand" ? " act" : r.text === "채점 ✓" ? " on" : "")} data-g="prep-status">{r.text}</span>
        {r.can === "hand" && <button className="btn sm pri" type="button" disabled={pending || closed} data-act="prep-hand" onClick={() => run(() => handAct(r.material.id, [student.id]), `${r.material.title} · 배부했습니다`)}>배부</button>}
        {r.can === "score" && <button className="btn sm" type="button" disabled={pending || closed} data-act="prep-score" onClick={() => run(() => scoredAct(r.material.id, student.id, true), `${r.material.title} · 채점 ✓`)}>채점 ✓</button>}</div>)}
      {!rows.length && <p className="note" data-g="prep-empty" style={{ margin: "0 0 6px" }}>자료 없음 · 04 에서 만들기</p>}
      {notGiven > 0 && <div className="wv" style={{ margin: 0 }} data-g="prep-give"><span className="note k" style={{ margin: 0 }}>이 아이에게 안 준 자료 {notGiven}</span>{rows.filter((r) => r.can === "give").map((r) => <button key={r.material.id} className="btn sm" type="button" disabled={pending || closed} data-act="prep-give" data-material={r.material.id} onClick={() => run(() => giveAct(r.material.id, [student.id]), `${r.material.title} · 배정했습니다`)}>배정 · {r.material.title}</button>)}</div>}
    </div>)}
    {!list.length && <p className="note" style={{ margin: 0 }}>멈춘 교재 없음</p>}
  </div>);
}
