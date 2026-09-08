"use client";
/** 일정의 손 자리 — 고른 날의 줄(결석 → 보강 잡기 · 휴강 무르기 · 할 일 끝냄 · 시험 영어일) · + 일정(시험 손으로) · + 휴강 · + 할 일 · 반 보강일 잡기(8회 채우기).
 *  보강 시각을 앱이 제안하지 않는다(확정-㉔) — 날짜·시각을 직접 적는다. 되돌릴 수 없는 손은 서버 답을 기다린다(속도-5) */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Sure, { useSure } from "../_shell/sure.js";   /* 한 번 더 묻기는 화면 안(대전제-10) */
import { holidayAct, undoHolidayAct, todoAct, doneTodoAct, examAct, englishOnAct, cancelExamAct, classMakeupAct, cancelClassMakeupAct, makeupAct, confirmMonthAct } from "./actions.js";
import { dayTitle, classText } from "@/lib/schedule-plan";
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
function useRun() {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); after?.(); router.refresh(); });
  return { run, pending, err, msg };
}
const Note = ({ err, msg }) => <>{err && <p className="note" role="alert" style={{ margin: "4px 0 0", color: "var(--miss)" }}>{err}</p>}{msg && <p className="note" data-g="msg" style={{ margin: "4px 0 0", color: "var(--on-ok)" }}>{msg}</p>}</>;
/** 반 보강일 잡기(8회 채우기) — 회차가 모자란 반 카드 아래 */
export function ClassMakeup({ classId, ym, short }) {
  const { run, pending, err, msg } = useRun(); const [open, setOpen] = useState(false); const [on, setOn] = useState(`${ym}-`); const [at, setAt] = useState("");
  return <div style={{ marginTop: 4 }}>
    <button className="btn sm" type="button" data-act="class-makeup-open" onClick={() => setOpen(!open)}>📅 보강일 잡기</button>
    {open && <div className="wv" style={{ marginTop: 4 }} data-g="class-makeup"><input type="date" value={on} onChange={(e) => setOn(e.target.value)} aria-label="보강 날짜" style={{ width: "auto" }} /><input type="time" value={at} onChange={(e) => setAt(e.target.value)} aria-label="보강 시각" style={{ width: "auto" }} />
      <button className="btn pri sm" type="button" disabled={pending} data-act="class-makeup-save" onClick={() => run(() => classMakeupAct({ classId, onDate: on, atTime: at || null }), (r) => `반 보강일을 잡았습니다 — ${r.made}명(이미 있던 ${r.had}명) · ${short}회 중 1회`, () => setOpen(false))}>잡기</button></div>}
    <Note err={err} msg={msg} />
  </div>;
}
/** 그 달 일정 확정(4단계-3b · ㉚ 9/7 「무조건 확정 후 알림」) — 도장 하나 · 확정하면 반 아이들의 학부모에게 「수업 일정 안내」 · 휴강이 들어오면 풀려서 「다시 확정」. 되돌릴 수 없는 손이라 물어보고 서버 답을 기다린다 */
export function MonthConfirm({ ym, ct, can }) {
  const { run, pending, err, msg } = useRun(); const sure = useSure(); const m = Number(String(ym).slice(5, 7));
  return <div className="wv" style={{ gap: 6 }} data-g="confirm" data-state={ct.state}>
    <span className={"pill" + (ct.bad ? " warn" : "")} data-g="confirm-text">{ct.text}</span>
    {can && ct.button && <button className="btn pri sm" type="button" disabled={pending} data-act="confirm-month" onClick={() => sure.ask("month")}>{ct.button}</button>}
    <Sure on={sure.is("month")} text={`${m}월 일정을 확정하고 반 아이들의 학부모에게 알림을 보낼까요?${ct.state === "undone" ? " (휴강이 들어와 풀렸던 것을 다시 확정합니다)" : ""}`} yes="확정" pending={pending} onYes={() => { sure.off(); run(() => confirmMonthAct(ym), (r) => `${m}월 일정 확정 — 반 ${r.classes} · 학부모 ${r.n}명에게 알림${r.sink === "off" ? "(🧪 리허설(off): 자취만 남고 실제로는 안 나갔습니다)" : ` · 보냄 ${r.sent} · 못 보냄 ${r.failed}`}`); }} onNo={sure.off} style={{ flexBasis: "100%" }} />
    <Note err={err} msg={msg} />
  </div>;
}
export default function Panel({ d }) {
  const { run, pending, err, msg } = useRun();
  const [form, setForm] = useState(null);   // holiday · todo · exam
  const [hol, setHol] = useState({ classId: "", reason: "" }); const [todo, setTodo] = useState({ title: "", dueTime: "" });
  const [exam, setExam] = useState({ scope: "school", schoolId: d.schools[0]?.id ?? "", grade: "", name: "", termFrom: d.sel, termTo: d.sel, englishOn: "" });
  const [mk, setMk] = useState({});   // student_id → { onDate, atTime }
  const [eng, setEng] = useState({});
  const openForm = (k) => setForm(form === k ? null : k);
  return <>
    <div className="ctitle"><span className="cemo">📅</span><span data-g="day-title">{dayTitle(d.sel)}</span></div>
    {!d.rows.length && <p className="note" data-g="day-empty">이 날은 적힌 것이 없습니다 — 정상 수업이면 아무것도 안 띄웁니다.</p>}
    {d.rows.map((r, i) => <div key={i} className="dayrow" data-g="day-row" data-kind={r.kind}><i className={"cm " + (r.kind === "abs" ? "i-abs" : r.kind === "late" ? "i-late" : r.kind === "mk" ? "i-mk" : r.kind === "hol" ? "i-off" : r.kind === "todo" ? "i-todo" : "i-ex")}>{r.icon}</i>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}><b>{r.title}</b><small>{r.small}</small>
        {r.kind === "abs" && <div style={{ marginTop: 4 }} data-g="makeup-forms">{r.items.map((it) => <div key={it.id} className="wv" style={{ margin: "2px 0" }} data-g="makeup-form" data-student={it.student_id}><span className="tag">{it.name}</span>
          {it.state === "set" ? <span className="tag on">보강 {String(it.on_date ?? "").slice(5)}{it.at_time ? " " + String(it.at_time).slice(0, 5) : ""}</span> : it.state === "waived" ? <span className="tag">보강 안 잡음</span> : <span className="tag" style={MISS}>보강 안 잡힘</span>}
          <input type="date" value={mk[it.student_id]?.onDate ?? ""} onChange={(e) => setMk({ ...mk, [it.student_id]: { ...(mk[it.student_id] ?? {}), onDate: e.target.value } })} aria-label="보강 날짜" style={{ width: "auto" }} /><input type="time" value={mk[it.student_id]?.atTime ?? ""} onChange={(e) => setMk({ ...mk, [it.student_id]: { ...(mk[it.student_id] ?? {}), atTime: e.target.value } })} aria-label="보강 시각" style={{ width: "auto" }} />
          <button className="btn sm pri" type="button" disabled={pending || !mk[it.student_id]?.onDate} data-act="makeup-save" onClick={() => run(() => makeupAct({ studentId: it.student_id, ofDate: d.sel, onDate: mk[it.student_id].onDate, atTime: mk[it.student_id].atTime || null }), "보강을 잡았습니다")}>📅 보강 잡기</button>
          {it.state !== "waived" && <button className="btn sm gho" type="button" disabled={pending} data-act="makeup-waive" onClick={() => run(() => makeupAct({ studentId: it.student_id, ofDate: d.sel, waived: true }), "보강 안 잡음으로 두었습니다")}>안 잡음</button>}</div>)}</div>}
      </div>
      {r.kind === "hol" && <button className="btn sm gho" type="button" disabled={pending} data-act="holiday-undo" onClick={() => run(() => undoHolidayAct(r.id), "휴강을 물렀습니다(지우지 않았습니다)")}>무르기</button>}
      {r.kind === "todo" && <button className="btn sm gho" type="button" disabled={pending} data-act="todo-done" onClick={() => run(() => doneTodoAct(r.id), "끝냈습니다")}>끝냄</button>}
      {r.kind === "mk" && r.ids && <button className="btn sm gho" type="button" disabled={pending} data-act="class-makeup-cancel" onClick={() => run(() => cancelClassMakeupAct(r.ids), "반 보강일을 물렀습니다")}>물리기</button>}
      {(r.kind === "exam" || r.kind === "exam2") && <span className="wv" style={{ gap: 4 }}><span className="tag">{r.tag}</span>{r.kind === "exam" && <><input type="date" value={eng[r.id] ?? ""} onChange={(e) => setEng({ ...eng, [r.id]: e.target.value })} aria-label="영어 시험일" style={{ width: "auto" }} /><button className="btn sm" type="button" disabled={pending || !eng[r.id]} data-act="english-on" onClick={() => run(() => englishOnAct(r.id, eng[r.id]), "영어 시험일을 적었습니다")}>영어일</button></>}<button className="btn sm gho" type="button" disabled={pending} data-act="exam-cancel" onClick={() => run(() => cancelExamAct(r.id), "시험을 물렀습니다")}>물리기</button></span>}
    </div>)}
    <div className="savebar" style={{ border: 0, padding: "8px 0 0", background: "none" }} data-g="day-acts">
      <button className="btn sm" type="button" data-act="open-exam" onClick={() => openForm("exam")}>+ 일정(시험)</button><button className="btn sm" type="button" data-act="open-holiday" onClick={() => openForm("holiday")}>+ 휴강</button><button className="btn sm" type="button" data-act="open-todo" onClick={() => openForm("todo")}>+ 할 일</button>
      <span className="spacer" /><span className="pill">정상 수업은 안 띄웁니다 — 당연한 것이니까</span>
    </div>
    {form === "holiday" && <div className="card" style={{ marginTop: 8 }} data-g="holiday-form"><div className="wv"><span className="tag">🚫 휴강 · {d.sel}</span>
      <select value={hol.classId} onChange={(e) => setHol({ ...hol, classId: e.target.value })} aria-label="반" style={{ width: "auto" }}><option value="">전체</option>{d.classes.map((c) => <option key={c.id} value={c.id}>{classText(c)}</option>)}</select>
      <input value={hol.reason} onChange={(e) => setHol({ ...hol, reason: e.target.value })} placeholder="사유 (예: 개천절 · 원장 연수) — 아이·학부모가 봅니다" aria-label="사유" name="reason" style={{ flex: "1 1 200px" }} />
      <button className="btn pri sm" type="button" disabled={pending} data-act="holiday-save" onClick={() => run(() => holidayAct({ date: d.sel, classId: hol.classId, reason: hol.reason }), "휴강을 넣었습니다 — 회차에서 빠집니다", () => setForm(null))}>저장</button><button className="btn sm gho" type="button" onClick={() => setForm(null)}>닫기</button></div></div>}
    {form === "todo" && <div className="card" style={{ marginTop: 8 }} data-g="todo-form"><div className="wv"><span className="tag">📋 할 일 · {d.sel}</span>
      <input value={todo.title} onChange={(e) => setTodo({ ...todo, title: e.target.value })} placeholder="할 일 (예: 11월 수납 안내)" aria-label="할 일" name="title" style={{ flex: "1 1 200px" }} /><input type="time" value={todo.dueTime} onChange={(e) => setTodo({ ...todo, dueTime: e.target.value })} aria-label="시각" style={{ width: "auto" }} />
      <button className="btn pri sm" type="button" disabled={pending} data-act="todo-save" onClick={() => run(() => todoAct({ title: todo.title, dueOn: d.sel, dueTime: todo.dueTime || null }), "할 일을 넣었습니다", () => setForm(null))}>저장</button><button className="btn sm gho" type="button" onClick={() => setForm(null)}>닫기</button></div></div>}
    {form === "exam" && <div className="card" style={{ marginTop: 8 }} data-g="exam-form"><div className="wv">
      <div className="seg sm" data-g="exam-scope">{[["school", "학교(중간·기말)"], ["national", "전국(수능·모의)"]].map(([k, name]) => <button key={k} type="button" aria-pressed={exam.scope === k} onClick={() => setExam({ ...exam, scope: k })}>{name}</button>)}</div>
      {exam.scope === "school" && <select value={exam.schoolId} onChange={(e) => setExam({ ...exam, schoolId: e.target.value })} aria-label="학교" style={{ width: "auto" }}>{d.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      <input value={exam.grade} onChange={(e) => setExam({ ...exam, grade: e.target.value })} placeholder="학년(비면 전체)" aria-label="학년" inputMode="numeric" style={{ width: 110 }} />
      <input value={exam.name} onChange={(e) => setExam({ ...exam, name: e.target.value })} placeholder="이름 (예: 2학기 중간)" aria-label="시험 이름" name="exam-name" style={{ flex: "1 1 160px" }} />
      <span className="note" style={{ margin: 0 }}>기간</span><input type="date" value={exam.termFrom} onChange={(e) => setExam({ ...exam, termFrom: e.target.value })} aria-label="시작" style={{ width: "auto" }} /><input type="date" value={exam.termTo} onChange={(e) => setExam({ ...exam, termTo: e.target.value })} aria-label="끝" style={{ width: "auto" }} />
      <span className="note" style={{ margin: 0 }}>영어일</span><input type="date" value={exam.englishOn} onChange={(e) => setExam({ ...exam, englishOn: e.target.value })} aria-label="영어 시험일" style={{ width: "auto" }} />
      <button className="btn pri sm" type="button" disabled={pending} data-act="exam-save" onClick={() => run(() => examAct(exam), "시험을 넣었습니다(손으로 — 받아와도 안 덮습니다)", () => setForm(null))}>저장</button><button className="btn sm gho" type="button" onClick={() => setForm(null)}>닫기</button></div></div>}
    <Note err={err} msg={msg} />
  </>;
}
