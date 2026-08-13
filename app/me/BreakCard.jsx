"use client";

import { useEffect, useState, useTransition } from "react";
import { myBreaks, startBreak, endBreak } from "./breakActions";
import { breakLine, minutesSince } from "@/lib/breaks";

/**
 * **쉬는 시간** — 나갈 때 한 번, 돌아와서 한 번.
 *
 * 원장님 (2026-08-07) — 「개별진도라 가끔 쉬는 시간이 제각각임」
 *
 * 지금은 아이가 자리를 비워도 아무 데도 안 남는다. 5분 다녀온 것과
 * 20분 사라진 것이 똑같아 보인다.
 *
 * **혼내려고 두는 것이 아니다.** 그래서 화면에는 몇 분인지만 담담하게
 * 보여준다 — 아이가 스스로 보게 하는 것이 먼저다. 선생님께는 눈에 띄는
 * 것만 올라간다 (lib/breaks.js).
 */
export default function BreakCard() {
  const [st, setSt] = useState(null);
  const [tick, setTick] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    myBreaks().then((r) => alive && setSt(r));
    return () => { alive = false; };
  }, []);

  // 쉬는 중이면 1분마다 화면의 숫자를 올린다 (지금 몇 분째인지 보여야 한다)
  useEffect(() => {
    if (!st?.open) return;
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [st?.open]);

  function go(fn) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) { alert(res.error); return; }
      setSt(await myBreaks());
    });
  }

  if (!st) return null;
  // 0106 전이면 아직 못 쓴다 — 없는 것처럼 둔다 (오류를 아이에게 보일 일이 아니다)
  if (st.ready === false) return null;

  const open = st.open;
  const now = open ? minutesSince(open.started_at) : 0;
  const line = breakLine(st.rows.filter((r) => r.ended_at));

  return (
    <div className="card card-tight" style={{ marginTop: 8 }}>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>쉬는 시간</b>
        {open ? (
          <span className="tag tag-mint">{now}분째 쉬는 중</span>
        ) : line ? (
          <span className="hint">오늘 {line}</span>
        ) : (
          <span className="hint">화장실 · 물 마시러 갈 때 눌러주세요</span>
        )}
        <span className="spacer" />
        <button
          className={`btn btn-sm ${open ? "btn-primary" : "btn-ghost"}`}
          onClick={() => go(open ? endBreak : startBreak)}
          disabled={pending}
        >
          {open ? "돌아왔어요" : "쉬러 가요"}
        </button>
      </div>
      {open && (
        <p className="hint" style={{ margin: "6px 0 0" }}>
          돌아와서 <b>꼭 눌러주세요.</b> 안 누르면 계속 쉬고 있는 것으로 남아요.
        </p>
      )}
    </div>
  );
}
