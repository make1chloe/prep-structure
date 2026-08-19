"use client";

import { useState, useTransition } from "react";
import { saveGrammarUnits } from "./actions";

/**
 * **단원평가 공통 단원 목록** (원장님, 2026-08-19 — 「단원평가는 교재단원과
 * 별개로 문법 대단원으로 공통의 목록이 하나 필요함」).
 *
 * 오늘 수업의 단원평가 단원명 고르기에 이 목록이 먼저 나온다 — 교재가
 * 무엇이든 관계사는 관계사라, 성적도 같은 이름으로 쌓인다.
 */
export default function GrammarUnitsCard({ initial = [] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial.join("\n"));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveGrammarUnits(text);
      if (res?.error) { alert(res.error); return; }
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        단원평가 공통 단원 {initial.length > 0 ? `${initial.length}개` : "만들기"}
      </button>
    );
  }
  return (
    <div className="card card-tight" style={{ marginTop: 10, width: "100%", maxWidth: 480 }}>
      <b style={{ fontSize: 14.5 }}>단원평가 공통 단원 (문법 대단원)</b>
      <p className="hint" style={{ margin: "6px 0" }}>
        한 줄에 하나 — 교재와 상관없이 단원평가 단원명 고르기에 먼저 나옵니다.
      </p>
      <textarea
        className="input"
        rows={10}
        placeholder={"관계사\n수동태\nto부정사\n동명사"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row" style={{ gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>취소</button>
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={save}>저장</button>
      </div>
    </div>
  );
}
