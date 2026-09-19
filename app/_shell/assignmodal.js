"use client";
/** 「교재 배정」 모달 한 벌((어41) · 원장님 9/15 「숙제를 최초에 어디서 배정을 하냐 … 배정이 없으면 걍 진도체크된거부터 뜨게하든가 뭘 설정하라고 하든가」).
 *  대시보드 17 · 오늘 01 · 학생 14 가 같은 부품. 진도 체크된 교재(◐)부터 · 고르기 한 벌(대전제-20 · 여러 권 한 번에) · 그 날부터 배정(루틴이 저절로 붙는다) · 01 에서 부르면 오늘 수업 일지에 바로 깔린다. 페이지를 안 떠난다(대전제-22)
 *  (어49) 원장님 2026-09-16 「숙제최초배정을 아직도 할수가 없음」: 01 에서 배정했는데 오늘 줄이 0 이면 닫지 않고 그 자리에서 까닭(단원 없음 · 루틴 항목 없음 · 안 한 소단원 없음 · 시작일이 뒤)과 갈 곳을 준다 · 목록이 비어도 까닭 · 오류는 모달 안에 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePick, PickGroup, PickBox } from "./pick.js";
import { useModalErr, call } from "./modalerr.js";
import { markCh } from "@/lib/mark";
import { assignChoices, assignBooksFor } from "./assign-actions.js";
import { icon } from "./icon.js";   // (어51) 아이콘만 있는 손의 이름·툴팁 한 벌
export default function AssignModal({ studentId, name = "", date, sheetId = null, onClose, onDone = null }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [rows, setRows] = useState(null); const [total, setTotal] = useState(0); const [on, setOn] = useState(date); const [failM, errNode] = useModalErr();
  const [why, setWhy] = useState(null);   // 배정은 됐는데 오늘 줄이 0 · 그 까닭
  const [q, setQ] = useState(""); const [area, setArea] = useState("");   // (어79) 원장님 2026-09-17 「교재 배정 할 때 필터링과 검색 가능하게 해 줘. 찾기가 어렵다.」
  const ids = useMemo(() => (rows ?? []).map((r) => r.book_id), [rows]); const pk = usePick(ids);
  const areas = useMemo(() => [...new Set((rows ?? []).map((r) => r.area).filter(Boolean))], [rows]);
  /** 보이는 줄 — 영역 칩과 이름 검색을 걸러 준다. **고른 것은 걸러도 그대로 남는다**(거르개를 바꿔 가며 여러 권을 고른다 · 저장 단추가 고른 수를 말한다) */
  const shown = useMemo(() => { const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!area || r.area === area) && (!t || `${r.name} ${r.area ?? ""}`.toLowerCase().includes(t))); }, [rows, q, area]);
  const sift = (rows ?? []).length >= 3;   // 두 권뿐이면 거르개가 되레 짐이다
  useEffect(() => { let alive = true; (async () => { const r = await call(() => assignChoices(studentId)); if (!alive) return; if (!failM(r)) { setRows([]); return; } setRows(r.choices); setTotal(r.total ?? 0); })(); return () => { alive = false; }; }, [studentId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => start(async () => { const picked = pk.ids; const r = await call(() => assignBooksFor(studentId, picked, on, sheetId)); if (!failM(r)) return; router.refresh();
    if (sheetId && r.laid === 0) { setWhy(on > date ? `${on} 부터 배정 · 그 날 수업 일지에 줄이 선다` : r.why || "까닭을 못 읽음"); return; }
    if (onDone) onDone(picked); else onClose(); });
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="교재 배정" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mdl" style={{ width: "min(520px,100%)" }}>
        <div className="mdlh"><b>교재 배정{name ? ` · ${name}` : ""}</b><span className="spacer" /><button type="button" className="x" {...icon("닫기")} onClick={onClose}>✕</button></div>
        <div className="mdlb">
          {errNode}
          {why != null ? <div className="lf warn" data-g="assign-why"><span className="ln">📕</span><div><b>배정은 됐고 오늘 줄은 0</b><small>{why}</small></div><Link prefetch={false} className="btn sm goto" href="/settings/routine">루틴 11</Link></div>
            : !rows ? <p className="note">읽는 중…</p>
            : !rows.length ? <p className="note" data-g="assign-none">배정할 교재 없음{total ? ` · 교재 ${total}권이 다 배정됨` : " · 교재 15 에 쓰는 교재가 없음"}</p>
            : <div data-g="assign-list">
              {sift && <div className="wv" data-g="assign-sift" style={{ margin: "0 0 6px" }}>
                <input type="search" value={q} aria-label="교재 찾기" placeholder="교재 이름" data-g="assign-q" style={{ flex: "1 1 140px" }} onChange={(e) => setQ(e.target.value)} />
                {areas.length > 1 && <span className="tags">{[["", "전체"], ...areas.map((a) => [a, a])].map(([k, name]) => <button key={k || "all"} type="button" className={"tag" + (area === k ? " on" : "")} data-act="assign-area" aria-pressed={area === k} onClick={() => setArea(k)}>{name}</button>)}</span>}
              </div>}
              <div className="wv" style={{ margin: "0 0 4px" }}><PickGroup pick={pk} ids={shown.map((r) => r.book_id)} label="전체" /></div>
              {!shown.length && <p className="note" data-g="assign-nohit">찾는 교재 없음</p>}
              {shown.map((r) => (
              <div key={r.book_id} className={"lf pick" + (pk.has(r.book_id) ? " on" : "")} data-g="assign-row" data-book={r.book_id} data-progressed={r.progressed ? "1" : "0"} onClick={() => pk.toggle(r.book_id)}>
                <PickBox pick={pk} id={r.book_id} label={r.name} /><span className="ln">{r.progressed ? markCh("doing") : "📕"}</span><div><b>{r.name}</b><small>{r.area}{r.progressed ? ` · 진도 ${r.done}` : ""}</small></div>
              </div>))}</div>}
          {why == null && <div className="wv" style={{ marginTop: 8 }}><span className="lm">이 날부터</span><input type="date" className="dt" value={on} aria-label="이 날부터" style={{ width: "auto" }} onChange={(e) => setOn(e.target.value)} /></div>}
        </div>
        <div className="mdlf">{why == null && <button type="button" className="btn pri" data-act="assign-save" disabled={pending || !pk.count || !on} onClick={save}>배정{pk.count > 1 ? ` ${pk.count}권` : ""}</button>}<button type="button" className="btn gho" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  );
}
