"use client";

import { useState, useTransition } from "react";
import { setMyState } from "./stateActions";
import { STATES, STUDENT_PICKABLE, stateOf } from "@/lib/activity";

/**
 * **지금 뭐 하고 있는지 내가 누른다.**
 *
 * 원장님 (2026-08-05) — 「학생 페이지에서 체크하면 그 내용이 현황판에 반영되게」
 *
 * 지금 뭘 하고 있는지 제일 잘 아는 것은 그 아이 자신이고, 선생님은 다른 아이
 * 설명하는 중이라 눌러줄 손이 없다.
 *
 * **「도움이 필요해요」 가 여기 있는 진짜 까닭.**
 *   말로 끼어드는 대신 이걸 누르면 된다. 선생님 화면에서 제일 앞으로 올라가서,
 *   설명이 끝나는 대로 오신다. 손 들고 기다리지 않아도 된다.
 */
export default function StateCard({ mine = null, unavailable = false }) {
  const [state, setState] = useState(mine?.state || "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  if (unavailable) return null;

  function pick(key) {
    const next = state === key ? "idle" : key;
    setState(next === "idle" ? "" : next);      // 먼저 화면부터
    startTransition(async () => {
      const res = await setMyState(next);
      if (res?.error) { alert(res.error); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  const cur = state ? stateOf(state) : null;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 14 }}>지금 뭐 하고 있어요?</b>
        {cur && <span className={`tag ${cur.cls}`}>{cur.label}</span>}
        <span className="spacer" />
        {saved && <span className="hint" style={{ color: "var(--mint)" }}>선생님께 전달됐어요 ✓</span>}
      </div>
      <p className="hint" style={{ margin: "4px 0 8px" }}>
        누르면 선생님 화면에 바로 뜹니다. <b>도움이 필요하면</b> 말로 부르지 말고
        아래 단추를 눌러주세요 — 선생님이 하던 설명을 마치고 오십니다.
      </p>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {STUDENT_PICKABLE.map((k) => {
          const s = STATES.find((x) => x.key === k);
          if (!s) return null;
          const on = state === k;
          return (
            <button
              key={k}
              className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
              style={s.call && !on ? { borderColor: "var(--red)", color: "var(--red)" } : undefined}
              onClick={() => pick(k)}
              disabled={pending}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      {state && (
        <p className="hint" style={{ margin: "8px 0 0" }}>
          다 하면 다시 눌러서 끄면 됩니다.
        </p>
      )}
    </div>
  );
}
