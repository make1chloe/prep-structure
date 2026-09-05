"use client";
/** 월초 정리 띠(목업 01 맨 위, 9/5 ㉗) — 달이 바뀌면 원장님이 정한다: 전원 정리(횟수만 0) / 이번 달은 그냥 두기. 안 누르면 저절로 0이 되지 않는다(확정-㊼) */
import { useState, useTransition } from "react";
import { warnReset } from "./actions.js";
const mon = (d) => Number(String(d).slice(5, 7));
export default function Band({ band }) {
  const [err, setErr] = useState(""); const [gone, setGone] = useState(false); const [, start] = useTransition();
  if (!band || gone) return null;
  const pick = (action) => start(async () => { const r = await warnReset(band.month, action); if (r?.ok) setGone(true); else setErr(r?.msg ?? "실패"); });
  return (
    <div className="lf warn" style={{ margin: "0 0 8px" }} data-band="warn"><span className="ln">🧹</span>
      <div><b>{mon(band.month)}월이 시작됐습니다 — {mon(band.prevMonth)}월 경고를 정리할까요?</b>
        <small>정리하면 <span style={{ fontWeight: 700 }}>횟수만 0</span>이 됩니다. 반성문·유예 기록은 아이 기록에 남습니다. 안 누르면 저절로 0이 되지 않습니다 — 끌고 가면 학기 끝엔 누구나 반성문 대상이 됩니다{err ? ` · ${err}` : ""}</small></div>
      <button type="button" className="btn sm pri" onClick={() => pick("reset")}>전원 정리하기</button>
      <button type="button" className="btn sm" onClick={() => pick("keep")}>이번 달은 그냥 두기</button>
    </div>
  );
}
