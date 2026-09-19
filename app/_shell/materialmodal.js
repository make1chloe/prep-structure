"use client";
/** 「+ 자료」 양식 한 벌 — (어94) · 04 내신 자료와 05 업무가 **같은 것**을 쓴다(원칙-1 · 두 벌은 반드시 어긋난다).
 *
 *  원장님 2026-09-19 「내신을 업무에 통합시켜도 될거 같은데」. 손(lib/todo.js addMaterial)은 이미 한 벌이었는데
 *  **양식이 04 에만** 있어서, 05 의 「📄 자료」는 만들기가 아니라 04 로 보내는 링크였다 — 대전제-22 위반.
 *  그 링크를 걷고 이 모달을 그 자리에서 연다.
 *
 *  04 는 시험이 정해져 있다(exam) · 05 는 고른다(exams + load). 고르면 그 시험의 종류·보는 아이를 그때 읽는다
 *  (판 파도에 안 태운다 — 모달을 열 때만 필요한 것이라 05 첫 조회를 무겁게 하지 않는다 · 속도-1). */
import { useEffect, useState, useTransition } from "react";
import { useModalErr } from "./modalerr.js";   // (어49) 모달 안 손의 실패는 모달 안에 선다
const EMPTY = { typeId: "", title: "", items: "", studentIds: null };
export default function MaterialModal({ exams = null, exam = null, types = [], takers = [], save, load = null, onClose, onSaved }) {
  const [failM, errNode] = useModalErr();
  const [pending, start] = useTransition();
  const [examId, setExamId] = useState(exam?.id ?? (exams?.length === 1 ? exams[0].id : ""));
  const [opts, setOpts] = useState({ types, takers });
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(EMPTY);
  useEffect(() => { if (!load || !examId) { setOpts({ types, takers }); return; }   // 05 — 고른 시험의 종류·보는 아이를 그때 읽는다
    let alive = true; setBusy(true); (async () => { const r = await load(examId); if (!alive) return; setBusy(false); if (failM(r)) setOpts({ types: r.types ?? [], takers: r.takers ?? [] }); })();
    return () => { alive = false; }; }, [examId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ids = f.studentIds ?? opts.takers.map((t) => t.id);   // 안 건드리면 보는 아이 전부(04 가 하던 대로)
  const toggle = (id) => setF({ ...f, studentIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  return (
    <div className="mdlov" role="dialog" aria-modal="true" aria-label="자료 세우기" data-g="add" onClick={(x) => { if (x.target === x.currentTarget) onClose(); }}><div className="mdl" style={{ maxWidth: 520 }}>
      <div className="mdlh"><b>+ 자료</b><span className="spacer" /><button className="btn sm" type="button" onClick={onClose}>닫기</button></div>
      <div className="mdlb">{errNode}
        {exams && <div className="wv"><label className="fl" style={{ margin: 0 }}>시험</label>
          <select value={examId} aria-label="시험" data-g="add-exam" onChange={(x) => { setExamId(x.target.value); setF(EMPTY); }} style={{ width: "auto", maxWidth: 320 }}><option value="">고르기</option>
            {exams.map((x) => <option key={x.id} value={x.id}>{x.school ?? "전국"} {x.name}</option>)}</select>
          {!exams.length && <span className="note" style={{ margin: 0 }}>다가오는 시험 없음 · 🗓️ 학교 시험에서 넣기</span>}</div>}
        <div className="wv"><label className="fl" style={{ margin: 0 }}>자료 종류</label><select value={f.typeId} aria-label="자료 종류" disabled={busy || !examId} onChange={(x) => setF({ ...f, typeId: x.target.value })} style={{ width: "auto" }}><option value="">고르기</option>{opts.types.map((t) => <option key={t.id} value={t.id}>{t.source} · {t.name}{t.steps?.includes("print") ? "" : " (인쇄 없음)"}</option>)}</select></div>
        <div className="wv"><label className="fl" style={{ margin: 0 }}>유형 이름</label><input type="text" value={f.title} placeholder="비면 종류 이름 그대로" aria-label="유형 이름" onChange={(x) => setF({ ...f, title: x.target.value })} style={{ flex: "1 1 200px" }} /></div>
        <div className="wv"><label className="fl" style={{ margin: 0 }}>항목(쉼표로)</label><textarea value={f.items} placeholder="동사 형 변형, 어순, 접속사, 지시어" aria-label="항목" onChange={(x) => setF({ ...f, items: x.target.value })} style={{ flex: "1 1 260px", minHeight: 60 }} /></div>
        <div className="fl">배정 · 보는 아이</div>
        <div className="tags" data-g="add-students">{opts.takers.map((t) => <label key={t.id} className="ckl"><input type="checkbox" className="ck" checked={ids.includes(t.id)} onChange={() => toggle(t.id)} /> {t.name}</label>)}{!opts.takers.length && <span className="note" style={{ margin: 0 }}>{examId ? "보는 아이 없음" : "시험 먼저"}</span>}</div>
      </div>
      <div className="mdlf"><span className="spacer" /><button className="btn pri" type="button" disabled={pending || busy || !examId || !f.typeId} data-act="add-save"
        onClick={() => start(async () => { const r = await save(examId, { ...f, studentIds: ids }); if (!failM(r)) return; setF(EMPTY); onSaved?.(r); onClose(); })}>저장</button></div>
    </div></div>
  );
}
