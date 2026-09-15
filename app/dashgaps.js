"use client";
/** 대시보드 17 의 「오늘 수업 전에」 · 「메모로만」 · 진도 체크 열림 띠((어41) · 원장님 9/15 「학생마다 어쩌구 저쩌구 하지말고 학생이름 (진도체크필요한 갯수) 만 쫙 나열하면 쓸데없이 페이지 안길어지고 누르면 팝업이든모달이든뜨고 저장 하면 페이지도 안 벗어나고」).
 *  이름(개수) 칩 → 그 아이 모달(교재마다 까닭 태그 + 진도 체크 · 교재 배정) → 저장하면 개수만 줄고 페이지는 그대로(대전제-22). 진도 체크 모달은 01 과 같은 부품(_shell/progressmodal) · 손만 아이·오늘 기준(_shell/progress-actions) */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProgressModal from "./_shell/progressmodal.js";
import AssignModal from "./_shell/assignmodal.js";
import { progressOpenFor, progressSetFor, progressSetManyFor, progressUpToFor, progressSkipFor } from "./_shell/progress-actions.js";
import { academyAct } from "./settings/progress/actions.js";
const apiFor = (studentId) => ({ open: (bk) => progressOpenFor(studentId, bk), set: (u, st) => progressSetFor(studentId, u, st), setMany: (ids, st) => progressSetManyFor(studentId, ids, st), upTo: (bk, u) => progressUpToFor(studentId, bk, u), skip: (bk, c) => progressSkipFor(studentId, bk, c) });
export default function DashGaps({ gaps = [], calls = [], summary, people, date, progress = null }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const [who, setWho] = useState(null);       // 고른 아이 { id, name }
  const [prog, setProg] = useState(null);     // { studentId, book }
  const [assign, setAssign] = useState(null); // { studentId, name }
  const fail = (r) => { if (r?.ok === false) { setErr(r.msg); return false; } setErr(""); return true; };
  const byStudent = useMemo(() => {
    const m = new Map(); const at = (id, name) => { if (!m.has(id)) m.set(id, { id, name, rows: [], calls: [] }); return m.get(id); };
    for (const g of gaps) at(g.student_id, g.name).rows.push(g);
    for (const c of calls) at(c.student_id, c.name).calls.push(c);
    return [...m.values()];
  }, [gaps, calls]);
  const cur = who ? byStudent.find((s) => s.id === who.id) : null;
  const chip = (s, n, g) => <button key={s.id} type="button" className="tag act" data-g={g} data-student={s.id} onClick={() => setWho({ id: s.id, name: s.name })}>{s.name} ({n})</button>;
  return (<>
    {progress?.show && <div className="lf warn" style={{ marginBottom: 8 }} data-g="progress-band" data-open={progress.open ? "1" : "0"}><span className="ln">✎</span><div><b>{progress.text}</b><small>{progress.small}</small></div>
      {progress.open && <button type="button" className="btn sm" data-act="progress-close" disabled={pending} onClick={() => start(async () => { if (fail(await academyAct(false))) router.refresh(); })}>닫기</button>}
      <Link prefetch={false} className="btn sm gho" href="/settings/progress">진도 체크 화면 ↗</Link></div>}
    <div className="gap" data-g="gap">
      <div className="gaph"><span className="gi">🚨</span><b>{gaps.length ? `오늘 수업 전에 · 배정이 빌 아이 ${summary.bad}명` : "오늘 수업 전에 · 배정이 빈 아이 없음"}</b><span className="spacer" />{gaps.length > 0 && <span className="pill warn">오늘 0줄</span>}</div>
      {gaps.length > 0 && <div className="gapchips" data-g="gap-chips">{byStudent.filter((s) => s.rows.length).map((s) => chip(s, s.rows.length, "gap-chip"))}</div>}
      <div className="gapok"><span className="gi">✅</span>{gaps.length ? <>나머지 <b>{summary.ok}명</b> 다 참</> : <>오늘 <b>{people.students}명</b> 다 참</>}<span className="spacer" /><Link prefetch={false} className="btn sm" href="/today">오늘 수업 ↗</Link></div>
    </div>
    {calls.length > 0 && <div className="card warn" style={{ marginBottom: 8 }} data-g="memo-calls"><div className="ctitle"><span className="cemo">✍</span>메모로만 진도가 올라간 교재 <b>{calls.length}</b></div>
      <div className="gapchips" data-g="call-chips">{byStudent.filter((s) => s.calls.length).map((s) => chip(s, s.calls.length, "call-chip"))}</div></div>}
    {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
    {cur && !prog && !assign && <div className="mdlov" role="dialog" aria-modal="true" aria-label="빈 배정" onClick={(e) => { if (e.target === e.currentTarget) setWho(null); }}><div className="mdl" style={{ width: "min(520px,100%)" }}>
      <div className="mdlh"><b>{cur.name}</b><span className="pill">빈 배정 {cur.rows.length}{cur.calls.length ? ` · 메모로만 ${cur.calls.length}` : ""}</span><span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={() => setWho(null)}>✕</button></div>
      <div className="mdlb" data-g="gap-modal">
        {/* 한 아이의 교재 줄(gap-book · call-book) · 줄마다 손이 다르고(진도 체크 · 루틴 11) 한 번에 할 것이 없어 고르기(대전제-20)는 안 붙인다 · 교재 배정 모달은 고르기 한 벌 */}
        {cur.rows.map((g) => <div key={g.book_id} className="lf" data-g="gap-book" data-gap={g.kind}><span className="ln">📕</span><div><b>{g.book}</b><small><span className="tag">{g.tag}</span>{g.absent && <span className="tag">오늘 결석 예정</span>}</small></div>
          {g.kind === "no_units" || g.kind === "cursor_stuck" ? <button type="button" className="btn sm pri" data-act="gap-progress" onClick={() => setProg({ studentId: cur.id, book: { book_id: g.book_id, books: { name: g.book } } })}>진도 체크</button> : <Link prefetch={false} className="btn sm" href={`/settings/routine?s=${cur.id}`}>루틴 11 ↗</Link>}</div>)}
        {cur.calls.map((c) => <div key={`c-${c.book_id}`} className="lf" data-g="call-book"><span className="ln">✍</span><div><b>{c.book}</b><small><span className="tag">메모로만 {c.streak}회</span></small></div><button type="button" className="btn sm pri" data-act="call-progress" onClick={() => setProg({ studentId: cur.id, book: { book_id: c.book_id, books: { name: c.book } } })}>진도 체크</button></div>)}
      </div>
      <div className="mdlf"><button type="button" className="btn sm" data-act="gap-assign" onClick={() => setAssign({ studentId: cur.id, name: cur.name })}>+ 교재 배정</button><span className="spacer" /><button type="button" className="btn gho" onClick={() => setWho(null)}>닫기</button></div></div></div>}
    {prog && <ProgressModal b={prog.book} api={apiFor(prog.studentId)} fail={fail} start={start} onClose={() => { setProg(null); router.refresh(); }} />}
    {assign && <AssignModal studentId={assign.studentId} name={assign.name} date={date} onClose={() => setAssign(null)} onDone={() => { setAssign(null); setWho(null); }} />}
  </>);
}
