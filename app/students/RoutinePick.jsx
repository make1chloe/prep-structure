"use client";

import { useEffect, useState, useTransition } from "react";
import { routineChoices, setRoutinePick } from "./routinePickActions";

/**
 * **이 학생은 이 교재 루틴에서 무엇을, 어떤 차례로 하나**
 * (원장님 2026-08-24 — 「교재루틴이 있으면 그걸 학생한테 일부만 배정하는
 * 거야」 · 「배정할 때 기본순서도 정해놔」).
 *
 * 루틴에 적힌 항목을 늘어놓고 **끄고 켜고, 차례를 잡는다.**
 * 끄면 그 학생에게서만 빠진다 — 교재 루틴 자체는 그대로라 다른 학생은
 * 안 바뀐다. 교재 루틴이 없으면 영역 루틴을 따르고, 그때도 똑같이 고른다.
 *
 * **「이대로 정함」 도장이 따로 있다.** 뺀 것이 하나도 없는 상태가
 * 「전부 한다」 인지 「아직 안 봤다」 인지 구별이 안 되기 때문이다.
 * 도장이 없는 교재는 대시보드가 재촉한다.
 */
export default function RoutinePick({ studentId, book }) {
  const [data, setData] = useState(null);
  const [skip, setSkip] = useState(new Set());
  const [order, setOrder] = useState([]);
  const [set, setSet] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    routineChoices(studentId, book.id).then((r) => {
      if (!live) return;
      setData(r);
      setSkip(new Set(r.skip || []));
      setOrder(r.order || []);
      setSet(!!r.정함);
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

  // 이름은 단계 목록에서 찾는다 (한 항목이 여러 단계에 있을 수 있다)
  const nameOf = (id) => {
    for (const st of data.steps) {
      const hit = [...st.inclass, ...st.home].find((x) => x.id === id);
      if (hit) return hit.name;
    }
    return "학습";
  };
  const isHome = (id) => data.steps.some((st) => st.home.some((x) => x.id === id));

  function save(next, nextOrder, stamp) {
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, {
        skip: [...next], order: nextOrder, 정함: stamp,
      });
      if (res?.error) { alert(res.error); return; }
      if (stamp) setSet(true);
    });
  }

  function toggle(id) {
    const next = new Set(skip);
    next.has(id) ? next.delete(id) : next.add(id);
    const before = new Set(skip);
    setSkip(next);                                   // 먼저 그린다
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, { skip: [...next], order });
      if (res?.error) { setSkip(before); alert(res.error); }
    });
  }

  function move(id, to) {
    const cur = order.filter((x) => x !== id);
    const at = to === "top" ? 0 : to === "bottom" ? cur.length : Math.max(0, order.indexOf(id) + (to === "up" ? -1 : 1));
    const next = [...cur.slice(0, at), id, ...cur.slice(at)];
    const before = order;
    setOrder(next);
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, { skip: [...skip], order: next });
      if (res?.error) { setOrder(before); alert(res.error); }
    });
  }

  const off = skip.size;
  const live = order.filter((id) => !skip.has(id));

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span className="hint">
          {data.따르는루틴 === "영역" ? "영역 루틴" : "교재 루틴"}
          {data.회독 > 1 ? ` · ${data.회독}회독` : ""}
          {off > 0 ? ` · ${off}개 뺌` : ""}
        </span>
        {set ? (
          <span className="tag tag-mint">정함</span>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            disabled={pending}
            title="이 학생의 루틴을 이대로 확정합니다 — 대시보드 재촉이 없어집니다"
            onClick={() => save(skip, order, true)}
          >
            이대로 정함
          </button>
        )}
      </div>

      {/* ── 차례 — 오늘 수업의 등원 학습 목록이 이 차례로 차려진다 */}
      <div className="stack" style={{ gap: 2 }}>
        {live.map((id, i) => (
          <div className="stuLine" key={id} style={{ padding: "3px 0", cursor: "default" }}>
            <span className="stuWho">
              <span className="hint" style={{ width: 16, textAlign: "right" }}>{i + 1}</span>
              <span className="stuName" style={{ fontWeight: 600, fontSize: 13.5 }}>{nameOf(id)}</span>
            </span>
            <span className="stuTags">
              <span className={`tag ${isHome(id) ? "tag-muted" : "tag-sky"}`}>
                {isHome(id) ? "숙제" : "등원"}
              </span>
            </span>
            <span className="stuEnd">
              <button className="btn btn-ghost btn-sm" title="맨 위로" disabled={pending || i === 0}
                style={{ padding: "2px 5px" }} onClick={() => move(id, "top")}>⇈</button>
              <button className="btn btn-ghost btn-sm" title="위로" disabled={pending || i === 0}
                style={{ padding: "2px 6px" }} onClick={() => move(id, "up")}>↑</button>
              <button className="btn btn-ghost btn-sm" title="아래로" disabled={pending || i === live.length - 1}
                style={{ padding: "2px 6px" }} onClick={() => move(id, "down")}>↓</button>
              <button className="btn btn-ghost btn-sm" title="맨 아래로" disabled={pending || i === live.length - 1}
                style={{ padding: "2px 5px" }} onClick={() => move(id, "bottom")}>⇊</button>
              <button className="btn btn-ghost btn-sm" title="이 학생은 안 합니다"
                style={{ padding: "2px 8px" }} onClick={() => toggle(id)}>✕ 뺌</button>
            </span>
          </div>
        ))}
        {live.length === 0 && <span className="hint">전부 뺐어요 — 이 교재에서는 아무것도 안 나갑니다.</span>}
      </div>

      {/* ── 뺀 것 — 눌러서 되돌린다 */}
      {off > 0 && (
        <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span className="hint" style={{ fontSize: 12 }}>뺀 것</span>
          {[...skip].map((id) => (
            <button key={id} className="chip" disabled={pending}
              title="누르면 다시 합니다"
              style={{ textDecoration: "line-through", opacity: 0.6 }}
              onClick={() => toggle(id)}>
              {nameOf(id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
