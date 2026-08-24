"use client";

import { useEffect, useState, useTransition } from "react";
import { routineChoices, setRoutinePick } from "./routinePickActions";

/**
 * **이 학생은 이 교재 루틴에서 무엇을, 어떤 차례로 하나**
 * (원장님 2026-08-24 — 「교재루틴이 있으면 그걸 학생한테 일부만 배정하는
 * 거야」 · 「배정할 때 기본순서도 정해놔」 · 「등원끼리, 숙제끼리 순서를
 * 정해야 의미가 있지 않아?」).
 *
 * **등원과 숙제를 갈라 놓는다.** 하는 자리가 다르므로 섞인 차례는 아무 뜻이
 * 없다 — 등원 목록은 학원에서 그 순서로 강제되고, 숙제는 집에서 그 순서로
 * 뜬다. 담기는 곳은 한 줄(routine_order)이지만 화면이 둘로 나눠 다룬다.
 *
 * 끄면 그 학생에게서만 빠진다 — 교재 루틴 자체는 그대로라 다른 학생은
 * 안 바뀐다. 교재 루틴이 없으면 영역 루틴을 따르고, 그때도 똑같이 고른다.
 *
 * **「이대로 정함」 도장이 따로 있다.** 뺀 것이 하나도 없는 상태가
 * 「전부 한다」 인지 「아직 안 봤다」 인지 구별이 안 되기 때문이다.
 * 도장이 없는 교재는 대시보드가 재촉한다.
 */
export default function RoutinePick({ studentId, book, onStamp }) {
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

  const nameOf = (id) => {
    for (const st of data.steps) {
      const hit = [...st.inclass, ...st.home].find((x) => x.id === id);
      if (hit) return hit.name;
    }
    return "학습";
  };
  const homeIds = new Set(data.steps.flatMap((st) => st.home.map((x) => x.id)));
  const isHome = (id) => homeIds.has(id);

  function push(nextSkip, nextOrder, stamp) {
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, {
        skip: [...nextSkip], order: nextOrder, 정함: stamp,
      });
      if (res?.error) { alert(res.error); return { bad: true }; }
      if (stamp) { setSet(true); onStamp?.(); }
      return {};
    });
  }

  function toggle(id) {
    const next = new Set(skip);
    next.has(id) ? next.delete(id) : next.add(id);
    const before = new Set(skip);
    setSkip(next);
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, { skip: [...next], order });
      if (res?.error) { setSkip(before); alert(res.error); }
    });
  }

  /**
   * 차례 옮기기 — **제 무리 안에서만** 움직인다. 등원 항목이 숙제 사이로
   * 가면 뜻이 없다. 담을 때는 등원 차례 뒤에 숙제 차례를 이어 붙인다.
   */
  function move(id, to, group) {
    const cur = group.filter((x) => x !== id);
    const at = to === "top" ? 0
      : to === "bottom" ? cur.length
      : Math.max(0, Math.min(cur.length, group.indexOf(id) + (to === "up" ? -1 : 1)));
    const moved = [...cur.slice(0, at), id, ...cur.slice(at)];
    // 두 무리를 합쳐 한 줄로 — 등원 먼저, 숙제 뒤
    const other = order.filter((x) => !group.includes(x));
    const next = isHome(id) ? [...other, ...moved] : [...moved, ...other];
    const before = order;
    setOrder(next);
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, { skip: [...skip], order: next });
      if (res?.error) { setOrder(before); alert(res.error); }
    });
  }

  const live = order.filter((id) => !skip.has(id));
  const inList = live.filter((id) => !isHome(id));
  const homeList = live.filter((id) => isHome(id));
  const off = skip.size;

  const Row = ({ id, i, group }) => (
    <div className="stuLine" style={{ padding: "3px 0", cursor: "default" }}>
      <span className="stuWho">
        <span className="hint" style={{ width: 16, textAlign: "right" }}>{i + 1}</span>
        <span className="stuName" style={{ fontWeight: 600, fontSize: 13.5 }}>{nameOf(id)}</span>
      </span>
      <span className="stuTags" />
      <span className="stuEnd">
        <button className="btn btn-ghost btn-sm" title="맨 위로" disabled={pending || i === 0}
          style={{ padding: "2px 5px" }} onClick={() => move(id, "top", group)}>⇈</button>
        <button className="btn btn-ghost btn-sm" title="위로" disabled={pending || i === 0}
          style={{ padding: "2px 6px" }} onClick={() => move(id, "up", group)}>↑</button>
        <button className="btn btn-ghost btn-sm" title="아래로" disabled={pending || i === group.length - 1}
          style={{ padding: "2px 6px" }} onClick={() => move(id, "down", group)}>↓</button>
        <button className="btn btn-ghost btn-sm" title="맨 아래로" disabled={pending || i === group.length - 1}
          style={{ padding: "2px 5px" }} onClick={() => move(id, "bottom", group)}>⇊</button>
        <button className="btn btn-ghost btn-sm" title="이 학생은 안 합니다"
          style={{ padding: "2px 8px" }} onClick={() => toggle(id)}>✕ 뺌</button>
      </span>
    </div>
  );

  const Group = ({ title, ids }) =>
    ids.length === 0 ? null : (
      <div className="stack" style={{ gap: 2 }}>
        <span className="hint" style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</span>
        {ids.map((id, i) => <Row key={id} id={id} i={i} group={ids} />)}
      </div>
    );

  return (
    <div className="stack" style={{ gap: 8 }}>
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
            onClick={() => push(skip, order, true)}
          >
            이대로 정함
          </button>
        )}
      </div>

      <Group title="등원 학습 — 학원에서 이 차례로" ids={inList} />
      <Group title="집 숙제 — 아이 화면에 이 차례로" ids={homeList} />
      {live.length === 0 && <span className="hint">전부 뺐어요 — 이 교재에서는 아무것도 안 나갑니다.</span>}

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
