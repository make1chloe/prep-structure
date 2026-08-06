"use client";

import { useState, useTransition } from "react";
import { setMyState } from "./stateActions";
import { STATES, STUDENT_PICKABLE, stateOf } from "@/lib/activity";

/**
 * **선생님 부르기.**
 *
 * 원장님 (2026-08-05) — 「시험 볼 때 얘기하려고 했더니, 다른 학생 설명 중일 때
 * 끼어들어서 말해」
 *
 * 말로 끼어드는 대신 이걸 누른다. 선생님 화면 맨 위로 올라가서, 설명이 끝나는
 * 대로 오신다. 손 들고 기다리지 않아도 된다.
 *
 * **여기에 「다 했어요」 를 또 두지 않는다.** 그건 학습 목록에 이미 있고,
 * 누르면 현황판에 그대로 뜬다. 같은 것을 두 군데 두면 반드시 어긋난다.
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
        <b style={{ fontSize: 14 }}>선생님 부르기</b>
        {cur && <span className={`tag ${cur.cls}`}>{cur.label}</span>}
        <span className="spacer" />
        {saved && <span className="hint" style={{ color: "var(--mint)" }}>선생님께 전달됐어요 ✓</span>}
      </div>
      <p className="hint" style={{ margin: "4px 0 8px" }}>
        모르는 것이 있으면 <b>말로 부르지 말고</b> 눌러주세요. 선생님 화면 맨 위에
        뜨고, 하시던 설명을 마치는 대로 오십니다.
        <br />
        무엇을 하고 있고 어디까지 했는지는 <b>따로 누르지 않아도</b> 선생님께
        보입니다 — 학습을 시작하고 「다 했어요」 를 누르는 것으로 충분해요.
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
