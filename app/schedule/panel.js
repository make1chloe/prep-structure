"use client";
/** 일정의 손 자리 · 최상단 「+ 일정」 다섯 갈래(시험 · 휴강 · 업무 · 보강 · 결석 예정 · (어52) 원장님 2026-09-16 「일정 추가하는 부분을 페이지 최상단으로 올려주고 … 종류를 선택하게해서 클릭을 하나줄여」)
 *  · 고른 날의 줄(결석 → 보강 잡기 · 휴강 취소 · 업무 끝냄 · 시험 영어 시험일) · 반 보강일 잡기(8회 채우기).
 *  시험 칸은 12b·06b 와 같은 부품(_shell/examform · 원칙-1) · 결석 예정은 02c 와 같은 손(absenceAct → planSave) 이라 넣으면 01 오늘 수업이 그 아이를 저절로 본다(대전제-24).
 *  보강 시각을 앱이 제안하지 않는다(확정-㉔) — 날짜·시각을 직접 적는다. 되돌릴 수 없는 손은 서버 답을 기다린다(속도-5) */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Sure, { useSure } from "../_shell/sure.js";   /* 한 번 더 묻기는 화면 안(대전제-10) */
import ExamForm from "../_shell/examform.js";   /* 시험 넣는 칸 한 벌 — 12 · 12b · 06b 가 같은 것을 쓴다(원칙-1) */
import { holidayAct, undoHolidayAct, todoAct, doneTodoAct, englishOnAct, cancelExamAct, classMakeupAct, makeupManyAct, cancelClassMakeupAct, makeupAct, absenceAct, absenceManyAct, confirmMonthAct } from "./actions.js";
import { dayTitle, classText } from "@/lib/schedule-plan";
import { kindList } from "@/lib/todo-plan";   // (어88) 업무 종류 고르개 — 05 와 같은 목록 한 벌(원칙-1)
import WhoPick from "../_shell/whopick.js";   // (어83) 학교 단추 · 반 단추 · 학생 목록 — 결석 예정과 보강이 같은 부품(원칙-1)
import { DateBox } from "../_shell/datebox.js";
const emptyAbs = (date) => ({ ids: [], from: date, to: "", range: false, reason: "" });
const MISS = { background: "var(--miss-fill)", color: "var(--on-miss)", borderColor: "transparent" };
function useRun() {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  const run = (fn, okMsg = null, after = null) => start(async () => { setErr(""); setMsg(""); const r = await fn(); if (!r.ok) { setErr(r.msg); return; } if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg); after?.(); router.refresh(); });
  return { run, pending, err, msg };
}
const Note = ({ err, msg }) => <>{err && <p className="note" role="alert" style={{ margin: "4px 0 0", color: "var(--miss)" }}>{err}</p>}{msg && <p className="note" data-g="msg" style={{ margin: "4px 0 0", color: "var(--on-ok)" }}>{msg}</p>}</>;
/** 반 보강일 잡기(8회 채우기) — 회차가 모자란 반 카드 아래(반이 정해져 있다) · 일정 최상단 「↻ 보강」(반을 고른다 · (어52)). 한 부품 · 손도 글도 한 벌(원칙-1) */
export function ClassMakeup({ classId = null, ym, short = 0, classes = null, students = null, always = false }) {
  const { run, pending, err, msg } = useRun(); const [open, setOpen] = useState(false); const [on, setOn] = useState(`${ym}-`); const [at, setAt] = useState("");
  /* (어83) 원장님 2026-09-18 「보강도 반이 아니라 학생별로 잡아야해」 — 고르개가 있으면 아이 목록으로 잡고,
     없으면(반 카드 밑 · 8회 못 채운 반) 그 반 전체로 잡는다. 저장되는 것은 어느 쪽이든 아이마다 한 줄이다 */
  const [ids, setIds] = useState([]);
  const canPick = Array.isArray(students) && students.length > 0;
  const shown = always || open;
  const ok = canPick ? ids.length > 0 : Boolean(classId);
  return <div style={{ marginTop: always ? 0 : 4 }}>
    {!always && <button className="btn sm" type="button" data-act="class-makeup-open" onClick={() => setOpen(!open)}>📅 보강일 잡기</button>}
    {shown && <div style={{ marginTop: always ? 0 : 4 }} data-g="class-makeup">
      {canPick && <WhoPick students={students} classes={classes ?? []} value={ids} onChange={setIds} label="누구 보강" />}
      <div className="wv" style={{ marginTop: canPick ? 4 : 0 }}>
        <DateBox type="date" value={on} onChange={(e) => setOn(e.target.value)} aria-label="보강 날짜" style={{ width: "auto" }} /><DateBox type="time" value={at} onChange={(e) => setAt(e.target.value)} aria-label="보강 시각" style={{ width: "auto" }} />
        <button className="btn pri sm" type="button" disabled={pending || !ok} data-act="class-makeup-save" onClick={() => run(() => (canPick ? makeupManyAct({ studentIds: ids, onDate: on, atTime: at || null }) : classMakeupAct({ classId, onDate: on, atTime: at || null })), (r) => `보강일을 잡았습니다. ${r.made}명(이미 있던 ${r.had}명)${short ? ` · ${short}회 중 1회` : ""}`, () => { setOpen(false); setOn(`${ym}-`); setAt(""); setIds([]); })}>잡기</button></div></div>}
    <Note err={err} msg={msg} />
  </div>;
}
/** ── 최상단 「+ 일정」((어52)) · 갈래를 먼저 고르면 그 칸이 바로 열린다(클릭 하나 줄임) · 고른 날에 넣는다(날은 달력이 고른다 · 시험만 제 기간을 적는다) */
export const ADD_KINDS = Object.freeze([["exam", "📝 시험", "open-exam"], ["hol", "🚫 휴강", "open-holiday"], ["todo", "📋 업무", "open-todo"], ["mk", "↻ 보강", "open-makeup"], ["abs", "✕ 결석 예정", "open-absence"]]);
export function AddTop({ d }) {
  const { run, pending, err, msg } = useRun();
  const [form, setForm] = useState(null);
  const [hol, setHol] = useState({ classId: "", reason: "" }); const [todo, setTodo] = useState({ title: "", dueTime: "", ids: [] }); const [abs, setAbs] = useState(() => emptyAbs(d.sel));
  return <div className="card" style={{ marginBottom: 8 }} data-g="add-top">
    <div className="wv">
      <span className="fl" style={{ margin: 0 }}>+ 일정</span>
      <div className="seg sm" data-g="add-kind">{ADD_KINDS.map(([k, name, act]) => <button key={k} type="button" data-act={act} aria-pressed={form === k} onClick={() => setForm(form === k ? null : k)}>{name}</button>)}</div>
      <span className="tag" data-g="add-day">{dayTitle(d.sel)}</span>
      <span className="spacer" />
    </div>
    {form === "exam" && <ExamForm key={d.sel} schools={d.schools} date={d.sel} pending={pending} run={run} onDone={() => setForm(null)} />}
    {form === "hol" && <div className="wv" style={{ marginTop: 8 }} data-g="holiday-form"><span className="tag">🚫 {d.sel}</span>
      <select value={hol.classId} onChange={(e) => setHol({ ...hol, classId: e.target.value })} aria-label="반" style={{ width: "auto" }}><option value="">전체</option>{d.classes.map((c) => <option key={c.id} value={c.id}>{classText(c)}</option>)}</select>
      <input value={hol.reason} onChange={(e) => setHol({ ...hol, reason: e.target.value })} placeholder="사유 (예: 개천절 · 원장 연수)" aria-label="사유" name="reason" style={{ flex: "1 1 200px" }} />
      <button className="btn pri sm" type="button" disabled={pending} data-act="holiday-save" onClick={() => run(() => holidayAct({ date: d.sel, classId: hol.classId, reason: hol.reason }), "휴강을 넣었습니다. 회차에서 빠집니다", () => { setForm(null); setHol({ classId: "", reason: "" }); })}>저장</button><button className="btn sm gho" type="button" data-act="holiday-close" onClick={() => setForm(null)}>닫기</button></div>}
    {form === "todo" && <div className="wv" style={{ marginTop: 8 }} data-g="todo-form"><span className="tag">📋 {d.sel}</span>
      <input value={todo.title} onChange={(e) => setTodo({ ...todo, title: e.target.value })} placeholder="업무 (예: 11월 수납 안내)" aria-label="업무" name="title" style={{ flex: "1 1 200px" }} /><select value={todo.kind ?? "note"} aria-label="업무 종류" data-g="sched-kind" onChange={(e) => setTodo({ ...todo, kind: e.target.value })} style={{ width: "auto" }}>{kindList(d.kinds ?? null).filter((k) => k.state === "active" && k.showOn !== "schedule").map((k) => <option key={k.kind} value={k.kind}>{k.name}</option>)}</select>{/* (어88) 12 도 kind:"note" 가 박혀 있던 같은 구멍이다 */}<DateBox type="time" value={todo.dueTime} onChange={(e) => setTodo({ ...todo, dueTime: e.target.value })} aria-label="시각" style={{ width: "auto" }} />
      <button className="btn pri sm" type="button" disabled={pending} data-act="todo-save" onClick={() => run(() => todoAct({ title: todo.title, kind: todo.kind || null, dueOn: d.sel, dueTime: todo.dueTime || null, studentIds: todo.ids }), "업무를 넣었습니다", () => { setForm(null); setTodo({ title: "", dueTime: "", ids: [] }); })}>저장</button><button className="btn sm gho" type="button" data-act="todo-close" onClick={() => setForm(null)}>닫기</button>
      {/* (어95) 12 에서도 아이를 **여럿** 잇는다 — 여태 12 의 업무는 아이를 아예 못 이었다(05 와 같은 줄인데 한쪽만 되던 자리) */}
      <div style={{ flexBasis: "100%" }}><WhoPick students={d.students ?? []} classes={d.classes ?? []} value={todo.ids} onChange={(ids) => setTodo({ ...todo, ids })} label="아이" /></div></div>}
    {form === "mk" && <div style={{ marginTop: 8 }} data-g="makeup-top"><ClassMakeup ym={d.ym} classes={d.classes} students={d.students ?? []} always /></div>}
    {form === "abs" && <div style={{ marginTop: 8 }} data-g="absence-form">{/* (어83) 아이 하나 고르개 → 여럿 · 날짜도 고른다(원장님 2026-09-18) */}
      <div className="wv"><span className="fl" style={{ margin: 0 }}>언제</span>
        <DateBox type="date" value={abs.from} onChange={(e) => setAbs({ ...abs, from: e.target.value })} aria-label="결석 시작일" style={{ width: "auto" }} />
        <label className="ckl"><input type="checkbox" className="ck" data-g="absence-range" checked={abs.range} onChange={(e) => setAbs({ ...abs, range: e.target.checked, to: e.target.checked ? abs.to || abs.from : "" })} />여러 날</label>
        {abs.range && <DateBox type="date" value={abs.to} onChange={(e) => setAbs({ ...abs, to: e.target.value })} aria-label="결석 종료일" style={{ width: "auto" }} />}
        <span className="note" style={{ margin: 0 }}>그 아이 수업일만</span></div>
      <WhoPick students={d.students ?? []} classes={d.classes ?? []} value={abs.ids} onChange={(ids) => setAbs({ ...abs, ids })} />
      <div className="wv" style={{ marginTop: 4 }}>
        <input value={abs.reason} onChange={(e) => setAbs({ ...abs, reason: e.target.value })} placeholder="사유 (예: 가족 일정)" aria-label="사유" name="absence-reason" style={{ flex: "1 1 200px" }} />
        <button className="btn pri sm" type="button" disabled={pending || !abs.ids.length || !abs.from} data-act="absence-save" onClick={() => run(() => absenceManyAct({ studentIds: abs.ids, from: abs.from, to: abs.range ? abs.to : null, reason: abs.reason }), (r) => `✕ 결석 예정 ${r.made}일 · ${r.students}명${r.skipped ? ` · 수업일이 없어 건너뛴 아이 ${r.skipped}` : ""}`, () => { setForm(null); setAbs(emptyAbs(d.sel)); })}>저장</button>
        <button className="btn sm gho" type="button" data-act="absence-close" onClick={() => setForm(null)}>닫기</button></div></div>}
    <Note err={err} msg={msg} />
  </div>;
}
/** 그 달 일정 확정(4단계-3b · ㉚ 9/7 「무조건 확정 후 알림」) — 도장 하나 · 확정하면 반 아이들의 학부모에게 「수업 일정 안내」 · 휴강이 들어오면 풀려서 「다시 확정」. 되돌릴 수 없는 손이라 물어보고 서버 답을 기다린다 */
export function MonthConfirm({ ym, ct, can }) {
  const { run, pending, err, msg } = useRun(); const sure = useSure(); const m = Number(String(ym).slice(5, 7));
  return <div className="wv" style={{ gap: 6 }} data-g="confirm" data-state={ct.state}>
    <span className={"pill" + (ct.bad ? " warn" : "")} data-g="confirm-text">{ct.text}</span>
    {can && ct.button && <button className="btn pri sm" type="button" disabled={pending} data-act="confirm-month" onClick={() => sure.ask("month")}>{ct.button}</button>}
    <Sure on={sure.is("month")} text={`${m}월 일정을 확정하고 반 아이들의 학부모에게 알림을 보낼까요?${ct.state === "undone" ? " (휴강이 들어와 풀렸던 것을 다시 확정합니다)" : ""}`} yes="확정" pending={pending} onYes={() => { sure.off(); run(() => confirmMonthAct(ym), (r) => `${m}월 일정 확정 · 반 ${r.classes} · 학부모 ${r.n}명에게 알림${r.sink === "off" ? "(🧪 리허설(off): 발송 이력만 남고 실제로는 안 나갔습니다)" : ` · 보냄 ${r.sent} · 못 보냄 ${r.failed}`}`); }} onNo={sure.off} style={{ flexBasis: "100%" }} />
    <Note err={err} msg={msg} />
  </div>;
}
export default function Panel({ d }) {
  const { run, pending, err, msg } = useRun();
  const [mk, setMk] = useState({});   // student_id → { onDate, atTime }
  const [eng, setEng] = useState({});
  return <>
    <div className="ctitle"><span className="cemo">📅</span><span data-g="day-title">{dayTitle(d.sel)}</span></div>
    {!d.rows.length && <p className="note" data-g="day-empty">이 날은 적힌 것이 없습니다. 정상 수업이면 아무것도 안 띄웁니다.</p>}
    {d.rows.map((r, i) => <div key={i} className="dayrow" data-g="day-row" data-kind={r.kind}><i className={"cm " + (r.kind === "abs" ? "i-abs" : r.kind === "late" ? "i-late" : r.kind === "mk" ? "i-mk" : r.kind === "hol" ? "i-off" : r.kind === "todo" ? "i-todo" : "i-ex")}>{r.icon}</i>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}><b>{r.title}</b><small>{r.small}</small>
        {r.kind === "abs" && <div style={{ marginTop: 4 }} data-g="makeup-forms">{r.items.map((it) => <div key={it.id} className="wv" style={{ margin: "2px 0" }} data-g="makeup-form" data-student={it.student_id}><span className="tag">{it.name}</span>
          {it.state === "set" ? <span className="tag on">보강 {String(it.on_date ?? "").slice(5)}{it.at_time ? " " + String(it.at_time).slice(0, 5) : ""}</span> : it.state === "waived" ? <span className="tag">보강 안 잡음</span> : <span className="tag" style={MISS}>보강 안 잡힘</span>}
          <DateBox type="date" value={mk[it.student_id]?.onDate ?? ""} onChange={(e) => setMk({ ...mk, [it.student_id]: { ...(mk[it.student_id] ?? {}), onDate: e.target.value } })} aria-label="보강 날짜" style={{ width: "auto" }} /><DateBox type="time" value={mk[it.student_id]?.atTime ?? ""} onChange={(e) => setMk({ ...mk, [it.student_id]: { ...(mk[it.student_id] ?? {}), atTime: e.target.value } })} aria-label="보강 시각" style={{ width: "auto" }} />
          <button className="btn sm pri" type="button" disabled={pending || !mk[it.student_id]?.onDate} data-act="makeup-save" onClick={() => run(() => makeupAct({ studentId: it.student_id, ofDate: d.sel, onDate: mk[it.student_id].onDate, atTime: mk[it.student_id].atTime || null }), "보강을 잡았습니다")}>📅 보강 잡기</button>
          {it.state !== "waived" && <button className="btn sm gho" type="button" disabled={pending} data-act="makeup-waive" onClick={() => run(() => makeupAct({ studentId: it.student_id, ofDate: d.sel, waived: true }), "보강 안 잡음으로 두었습니다")}>안 잡음</button>}</div>)}</div>}
      </div>
      {r.kind === "hol" && <button className="btn sm gho" type="button" disabled={pending} data-act="holiday-undo" onClick={() => run(() => undoHolidayAct(r.id), "휴강을 물렀습니다(지우지 않았습니다)")}>취소</button>}
      {r.kind === "todo" && <button className="btn sm gho" type="button" disabled={pending} data-act="todo-done" onClick={() => run(() => doneTodoAct(r.id), "완료했습니다")}>완료</button>}
      {r.kind === "mk" && r.ids && <button className="btn sm gho" type="button" disabled={pending} data-act="class-makeup-cancel" onClick={() => run(() => cancelClassMakeupAct(r.ids), "반 보강일을 물렀습니다")}>취소</button>}
      {(r.kind === "exam" || r.kind === "exam2") && <span className="wv" style={{ gap: 4 }}><span className="tag">{r.tag}</span>{r.kind === "exam" && <><DateBox type="date" value={eng[r.id] ?? ""} onChange={(e) => setEng({ ...eng, [r.id]: e.target.value })} aria-label="영어 시험일" style={{ width: "auto" }} /><button className="btn sm" type="button" disabled={pending || !eng[r.id]} data-act="english-on" onClick={() => run(() => englishOnAct(r.id, eng[r.id]), "영어 시험일을 적었습니다")}>영어 시험일</button></>}<button className="btn sm gho" type="button" disabled={pending} data-act="exam-cancel" onClick={() => run(() => cancelExamAct(r.id), "시험을 물렀습니다")}>취소</button></span>}
    </div>)}
    <Note err={err} msg={msg} />
  </>;
}
