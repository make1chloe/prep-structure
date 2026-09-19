"use client";
/** (어84) ⏰ 마감 필요 — 줄을 누르면 **그 자리에서** 끝낸다(대전제-22 · 원장님 2026-09-18 「모달로 바로바로 처리」).
 *
 *  무엇을 모달 안에서 하고 무엇을 화면으로 보내나 —
 *   · **출결**은 여기서 찍는다(칩 다섯 · 01 과 같은 손 setAttend · 다시 누르면 취소 · (어83))
 *   · **마감**도 여기서 한다(적어 둔 글 그대로 나간다 · 01 의 「고른 판 마감」과 같은 손 closeMany)
 *   · **숙제 검사**는 01 로 보낸다 — 판(교재 › 단원 › 활동 나무)을 모달에 또 그리면 두 벌이 된다(원칙-1)
 *   · **발송**은 10 으로 보낸다 — 고른 것을 한 번에 보내는 자리가 이미 있다
 *  ⚠️ 손을 새로 만들지 않았다. 여기 있는 것은 전부 01·10 이 쓰던 그 손이다. */
import { useState, useTransition } from "react";
import Link from "next/link";
import { ATTEND, ATTEND_NONE } from "@/lib/day-plan";
import { dueStepName } from "@/lib/dash-plan";
import { setAttend, closeMany } from "../today/actions.js";
import { icon } from "./icon.js";
import { FACE, ACT } from "@/lib/emoji";   // 그림은 표에서 온다(대전제-25)

export default function DueModal({ row, onClose, onDone }) {
  const [err, setErr] = useState("");
  const [attend, setAttendLocal] = useState(row.attend ?? ATTEND_NONE);
  const [closed, setClosed] = useState(Boolean(row.closed));
  const [pending, start] = useTransition();
  const fail = (r) => { if (r && !r.ok) { setErr(r.msg); return false; } setErr(""); return true; };
  const pick = (v) => { const prev = attend, next = attend === v ? ATTEND_NONE : v; setAttendLocal(next);   // 화면 먼저(속도-3)
    start(async () => { if (!fail(await setAttend(row.sheet_id, next))) setAttendLocal(prev); else onDone?.(); }); };
  const doClose = () => start(async () => { if (fail(await closeMany([row.sheet_id]))) { setClosed(true); onDone?.(); } });
  return <div className="mdlov" role="dialog" aria-modal="true" aria-label={`${row.name} 마감 필요`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="mdl" style={{ width: "min(460px,100%)" }}>
      <div className="mdlh"><b>{FACE.due} {row.name}</b><span className="pill">{row.steps.map(dueStepName).join(" · ")}</span><span className="spacer" /><button type="button" className="x" {...icon("닫기")} onClick={onClose}>✕</button></div>
      <div className="mdlb">
        {err && <p className="note" role="alert" style={{ margin: "0 0 6px", color: "var(--miss)" }}>{err}</p>}
        <div className="wv" style={{ marginBottom: 6 }}><span className="fl" style={{ margin: 0 }}>출결</span>
          <div className="seg sm" data-g="due-att" aria-label={`${row.name} 출결`}>{ATTEND.map(([v, name]) => <button key={v} type="button" aria-pressed={attend === v} disabled={pending || closed} onClick={() => pick(v)}>{name}</button>)}</div>
          {closed && <span className="note" data-g="due-locked" style={{ margin: 0 }}>마감함 · 출결 잠김</span>}</div>{/* 마감한 판은 못 고친다(검사-⑤) — 잠긴 채로 두고 까닭을 그 자리에서 말한다(대전제-0) */}
        {row.left > 0 && <div className="wv" style={{ marginBottom: 6 }}><span className="fl" style={{ margin: 0 }}>숙제 검사</span>
          <span className="pill bad">{row.left}개 남음</span><Link prefetch={false} className="btn sm goto" href="/today" data-act="due-check">숙제 검사</Link></div>}
        <div className="wv" style={{ marginBottom: 0 }}><span className="fl" style={{ margin: 0 }}>마감</span>
          {closed ? <span className="pill">마감함</span> : <button type="button" className="btn pri sm" disabled={pending} data-act="due-close" onClick={doClose}>지금 마감</button>}
          {closed && !row.sent && <Link prefetch={false} className="btn sm goto" href="/send" data-act="due-send">발송</Link>}
          {closed && row.sent && <span className="pill">보냄</span>}</div>
      </div>
      <div className="mdlf"><Link prefetch={false} className="btn goto" href="/today">오늘 수업</Link><button type="button" className="btn gho" onClick={onClose}>닫기</button></div>
    </div>
  </div>;
}
