"use client";

import { useEffect, useState, useTransition } from "react";
import { routineChoices, setRoutineSkip } from "./routinePickActions";

/**
 * **이 학생은 이 교재 루틴에서 무엇을 하나** (원장님 2026-08-24 —
 * 「교재루틴이 있으면 그걸 학생한테 일부만 배정하는 거야」).
 *
 * 루틴에 적힌 항목을 늘어놓고 **끄고 켠다.** 켜져 있으면 이 학생이 한다.
 * 끄면 그 학생에게서만 빠진다 — 교재 루틴 자체는 그대로라 다른 학생은
 * 안 바뀐다. 교재 루틴이 없으면 영역 루틴을 따르고, 그때도 똑같이 고른다.
 *
 * 낙관 저장 — 누르면 바로 켜지고/꺼지고, 실패하면 되돌리며 말해준다.
 */
export default function RoutinePick({ studentId, book }) {
  const [data, setData] = useState(null);
  const [skip, setSkip] = useState(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    routineChoices(studentId, book.id).then((r) => {
      if (!live) return;
      setData(r);
      setSkip(new Set(r.skip || []));
    });
    return () => { live = false; };
  }, [studentId, book.id]);

  if (data === null) return <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>;
  if (!data.steps.length) {
    return (
      <p className="hint" style={{ margin: 0 }}>
        이 교재에 진도루틴이 없어요 — 교재 화면에서 루틴을 만들면 여기서 학생별로 고를 수 있어요.
      </p>
    );
  }

  function toggle(id) {
    const next = new Set(skip);
    next.has(id) ? next.delete(id) : next.add(id);
    const before = skip;
    setSkip(next);                       // 먼저 그린다
    startTransition(async () => {
      const res = await setRoutineSkip(studentId, book.id, [...next]);
      if (res?.error) { setSkip(before); alert(res.error); }
    });
  }

  const off = skip.size;
  const Chip = ({ it }) => (
    <button
      key={it.id}
      className={`chip ${skip.has(it.id) ? "" : "on"}`}
      disabled={pending}
      title={skip.has(it.id) ? "이 학생은 안 합니다 — 누르면 다시 합니다" : "이 학생이 합니다 — 누르면 뺍니다"}
      onClick={() => toggle(it.id)}
      style={skip.has(it.id) ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
    >
      {it.name}
    </button>
  );

  return (
    <div className="stack" style={{ gap: 6 }}>
      <p className="hint" style={{ margin: 0 }}>
        {data.따르는루틴 === "영역" ? "영역 루틴" : "교재 루틴"}
        {data.회독 > 1 ? ` · ${data.회독}회독` : ""} — 켜진 것만 이 학생에게 나갑니다
        {off > 0 ? ` (${off}개 뺌)` : ""}
      </p>
      {data.steps.map((st) => (
        <div key={st.id} className="stack" style={{ gap: 3 }}>
          <span className="hint" style={{ fontSize: 12.5 }}>
            {st.no}. {st.label || "이름 없는 단계"}
          </span>
          {st.inclass.length > 0 && (
            <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span className="hint" style={{ width: 44, fontSize: 12 }}>등원</span>
              {st.inclass.map((it) => <Chip key={`i${st.id}${it.id}`} it={it} />)}
            </div>
          )}
          {st.home.length > 0 && (
            <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span className="hint" style={{ width: 44, fontSize: 12 }}>숙제</span>
              {st.home.map((it) => <Chip key={`h${st.id}${it.id}`} it={it} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
