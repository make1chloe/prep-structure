"use client";
/** 「교재 배정」 모달 한 벌((어41) · 원장님 9/15 「숙제를 최초에 어디서 배정을 하냐 … 배정이 없으면 걍 진도체크된거부터 뜨게하든가 뭘 설정하라고 하든가」).
 *  대시보드 17 · 오늘 01 · 학생 14 가 같은 부품. 진도 체크된 교재(◐)부터 · 고르기 한 벌(대전제-20 · 여러 권 한 번에) · 그 날부터 배정(루틴이 저절로 붙는다) · 01 에서 부르면 오늘 수업 일지에 바로 깔린다. 페이지를 안 떠난다(대전제-22) */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { usePick, PickAll, PickBox } from "./pick.js";
import { assignChoices, assignBooksFor } from "./assign-actions.js";
export default function AssignModal({ studentId, name = "", date, sheetId = null, onClose, onDone = null }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [rows, setRows] = useState(null); const [on, setOn] = useState(date); const [err, setErr] = useState("");
  const ids = useMemo(() => (rows ?? []).map((r) => r.book_id), [rows]); const pk = usePick(ids);
  useEffect(() => { let alive = true; (async () => { const r = await assignChoices(studentId); if (!alive) return; if (!r.ok) { setErr(r.msg); setRows([]); return; } setRows(r.choices); })(); return () => { alive = false; }; }, [studentId]);
  const save = () => start(async () => { setErr(""); const picked = pk.ids; const r = await assignBooksFor(studentId, picked, on, sheetId); if (!r.ok) { setErr(r.msg); return; } router.refresh(); if (onDone) onDone(picked); else onClose(); });
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="교재 배정" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" style={{ width: "min(520px,100%)" }}>
        <div className="mdlh"><b>교재 배정{name ? ` · ${name}` : ""}</b><span className="spacer" /><button type="button" className="x" aria-label="닫기" onClick={onClose}>✕</button></div>
        <div className="mdlb">
          {err && <p className="note" role="alert" style={{ margin: "0 0 8px", color: "var(--miss)" }}>{err}</p>}
          {!rows ? <p className="note">읽는 중…</p> : !rows.length ? <p className="note" data-g="assign-none">배정할 교재 없음</p> :
            <div data-g="assign-list"><div className="wv" style={{ margin: "0 0 4px" }}><PickAll pick={pk} /></div>{rows.map((r) => (
              <div key={r.book_id} className={"lf pick" + (pk.has(r.book_id) ? " on" : "")} data-g="assign-row" data-book={r.book_id} data-progressed={r.progressed ? "1" : "0"} onClick={() => pk.toggle(r.book_id)}>
                <PickBox pick={pk} id={r.book_id} label={r.name} /><span className="ln">{r.progressed ? "◐" : "📕"}</span><div><b>{r.name}</b><small>{r.area}{r.progressed ? ` · 진도 ${r.done}` : ""}</small></div>
              </div>))}</div>}
          <div className="wv" style={{ marginTop: 8 }}><span className="lm">이 날부터</span><input type="date" className="dt" value={on} aria-label="이 날부터" style={{ width: "auto" }} onChange={(e) => setOn(e.target.value)} /></div>
        </div>
        <div className="mdlf"><button type="button" className="btn pri" data-act="assign-save" disabled={pending || !pk.count || !on} onClick={save}>배정{pk.count > 1 ? ` ${pk.count}권` : ""}</button><button type="button" className="btn gho" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}
