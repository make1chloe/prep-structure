"use client";

import { useEffect, useState, useTransition } from "react";
import { routineChoices, setRoutinePick } from "./routinePickActions";
import { CAT_CLS, toolBadge } from "@/app/homework/categories";
import { keywordFilter } from "@/lib/pickSearch";
import { ADD_BUCKETS, normalizeAdd } from "@/lib/routineAdd";

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
export default function RoutinePick({ studentId, book, hwItems = [], onStamp }) {
  const [data, setData] = useState(null);
  const [skip, setSkip] = useState(new Set());
  const [order, setOrder] = useState([]);
  const [set, setSet] = useState(false);
  const [pending, startTransition] = useTransition();
  // 이 학생에게만 더한 항목 (0182) · 고르는 판 · 거르는 글자
  const [add, setAdd] = useState(() => normalizeAdd(null));
  const [openAdd, setOpenAdd] = useState(null);   // null | "inclass" | "home" | "next"
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    routineChoices(studentId, book.id).then((r) => {
      if (!live) return;
      setData(r);
      setSkip(new Set(r.skip || []));
      setOrder(r.order || []);
      setSet(!!r.정함);
      setAdd(normalizeAdd(r.added));
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

  /**
   * **이름 옆에 준비물을 같이** (원장님 2026-08-28 — 「클래스카드 필수학습이
   * 나와야 하는데 필수학습이라고만 나옴. 이러면 뭔지 모름」).
   * 그림표는 오늘 수업·아이 화면과 **같은 한 벌**(toolBadge)로 만든다.
   *
   * 이름표는 서버가 한 자리로 준다(`items`). 전에는 여기서 steps 를 훑었는데,
   * **이 학생에게만 더한 항목은 steps 에 없어서** 영영 「학습」으로 떴다.
   */
  const itemMap = new Map((data.items || []).map((x) => [x.id, x]));
  const itemOf = (id) => itemMap.get(id) || { id, name: "학습", tool: "", category: "", dead: false };
  const nameOf = (id) => itemOf(id).name;

  /**
   * **등원과 숙제는 서로 배타가 아니다** (원장님 2026-08-28 — 「루틴 내용
   * 내가 작성한 거랑 달라」).
   *
   * 전에는 「숙제 목록에 있으면 등원이 아니다」(isHome)로 갈랐다. 그래서
   * 원장님이 **등원에도 숙제에도 넣어둔 항목**(개념정독·문답노트처럼
   * 「수업에서 하다 남으면 숙제로」인 것들)이 등원 목록에서 통째로
   * 사라졌고, 작성한 루틴과 다른 것을 보고 계셨다.
   *
   * 실제 차림은 그렇지 않다 — app/today/routineActions.js 는 inclass_items
   * 와 home_items·home_next 를 **각각 따로** 내보낸다(248·249·265줄).
   * 화면도 그 규칙과 같아야 한다. 양쪽에 있는 항목은 **양쪽에 보인다.**
   */
  const routineIn = new Set(data.steps.flatMap((st) => st.inclass.map((x) => x.id)));
  const routineHome = new Set(
    data.steps.flatMap((st) => [...st.home, ...(st.next || [])].map((x) => x.id))
  );
  /**
   * **더한 항목도 같은 목록에 선다** (0182). 차림(nextRoutine)이 루틴 항목과
   * 더한 항목을 같은 칸에 이어 붙이므로, 화면도 그렇게 보여야 「루틴엔 있는데
   * 아이한테 안 나간다」 같은 어긋남이 안 생긴다.
   */
  const addIn = new Set(add.inclass);
  const addHome = new Set([...add.home, ...add.next]);
  const inclassIds = new Set([...routineIn, ...addIn]);
  const homeIds = new Set([...routineHome, ...addHome]);
  const bothIds = new Set([...inclassIds].filter((id) => homeIds.has(id)));
  const nextIds = new Set([
    ...data.steps.flatMap((st) => (st.next || []).map((x) => x.id)),
    ...add.next,
  ]);

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
   * **이 학생에게만 더하기·지우기** (0182).
   *
   * 담기는 곳이 다르므로 「뺌」과 **뜻이 갈린다**:
   *   뺌   — 교재 루틴에는 있는데 이 학생만 안 한다 (routine_skip)
   *   지움 — 이 학생에게만 더했던 것을 도로 없앤다 (routine_add)
   * 단추 이름도 그렇게 갈라 적는다 (화면 규칙 1 — 이름으로 말한다).
   */
  function saveAdd(nextAdd) {
    const before = add;
    setAdd(nextAdd);   // 먼저 화면부터 — 이 판은 새로고침을 안 한다
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, {
        skip: [...skip], order, add: nextAdd,
      });
      if (res?.error) { setAdd(before); alert(res.error); }
    });
  }
  function addItem(bucket, id) {
    saveAdd({ ...add, [bucket]: [...new Set([...add[bucket], id])] });
  }
  /** 그 무리에서 지운다 — 숙제 무리는 home·next 둘 다 본다 */
  function dropAdd(id, buckets) {
    const next = { ...add };
    buckets.forEach((b) => { next[b] = next[b].filter((x) => x !== id); });
    saveAdd(next);
  }

  /**
   * 차례 옮기기 — **제 무리 안에서만** 움직인다.
   *
   * 담기는 곳은 한 줄(routine_order)이지만, 그 줄은 **무리 안에서만 쓰이는
   * 순위표**다 — 차림(app/today/routineActions.js `inOrder`)이 등원 목록과
   * 숙제 목록을 **각각** 이 순위로 정렬한다. 그래서 두 무리를 한 줄에 어떤
   * 차례로 이어 붙이든 결과는 같다. 잃지 않는 것만 지키면 된다.
   *
   * 전에는 `order.filter(x => !group.includes(x))` 로 나머지를 골랐다.
   * 등원·숙제 양쪽에 있는 항목이 생기면 그 방식은 **같은 id 를 두 번 넣거나
   * 통째로 떨어뜨린다.** 옮긴 무리를 앞에 놓고 나머지는 본래 차례대로 이어
   * 붙인 뒤 한 번 훑어 중복만 걷는다 — 무엇도 사라지지 않는다.
   *
   * ⚠️ 양쪽에 있는 항목은 순위가 **하나뿐**이다 (담는 칸이 한 줄이라).
   *    등원에서 올리면 숙제 목록에서도 같이 올라간다 — 차림도 같은 한계다.
   */
  function move(id, to, group) {
    const cur = group.filter((x) => x !== id);
    const at = to === "top" ? 0
      : to === "bottom" ? cur.length
      : Math.max(0, Math.min(cur.length, group.indexOf(id) + (to === "up" ? -1 : 1)));
    const moved = [...cur.slice(0, at), id, ...cur.slice(at)];
    const next = [...new Set([...moved, ...order])];
    const before = order;
    setOrder(next);
    startTransition(async () => {
      const res = await setRoutinePick(studentId, book.id, { skip: [...skip], order: next });
      if (res?.error) { setOrder(before); alert(res.error); }
    });
  }

  const live = order.filter((id) => !skip.has(id));
  const inList = live.filter((id) => inclassIds.has(id));
  const homeList = live.filter((id) => homeIds.has(id));
  const off = skip.size;

  const Row = ({ id, i, group, buckets }) => {
    const mine = buckets.some((b) => add[b].includes(id));
    const gone = itemOf(id).dead;
    return (
    <div className="stuLine" style={{ padding: "3px 0", cursor: "default" }}>
      <span className="stuWho">
        <span className="hint" style={{ width: 16, textAlign: "right" }}>{i + 1}</span>
        <span className="stuName" style={{ fontWeight: 600, fontSize: 13.5 }}>{nameOf(id)}</span>
        {itemOf(id).tool && (
          <span className="tag tag-sky" style={{ fontSize: 12 }}>{toolBadge(itemOf(id).tool)}</span>
        )}
        {/* 양쪽에 넣어두신 항목 — 「수업에서 하다 남으면 숙제로」 */}
        {bothIds.has(id) && (
          <span className="tag tag-muted" style={{ fontSize: 12 }} title="등원에도 숙제에도 들어 있어요">
            등원＋숙제
          </span>
        )}
        {group === homeList && nextIds.has(id) && (
          <span className="tag tag-lav" style={{ fontSize: 12 }} title="다음 단원이 붙는 예습 숙제입니다">
            예습
          </span>
        )}
        {/* **글자로 말한다** — 교재 루틴 것인지 이 아이한테만 더한 것인지
            (색만으로 뜻을 나르지 않는다 · 노안 규칙) */}
        {mine && (
          <span className="tag tag-sky" style={{ fontSize: 12 }}
            title="교재 루틴에는 없고 이 학생에게만 더한 항목이에요 — 다른 학생은 안 바뀝니다">
            이 학생만
          </span>
        )}
        {gone && (
          <span className="tag tag-red" style={{ fontSize: 12 }}
            title="학습 항목에서 지워진 항목이에요 — 아이에게 안 나갑니다. 「지움」 으로 치워주세요">
            없어진 항목
          </span>
        )}
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
        {mine ? (
          <button className="btn btn-ghost btn-sm" disabled={pending}
            title="이 학생에게만 더했던 항목을 도로 없앱니다 (교재 루틴은 안 바뀝니다)"
            style={{ padding: "2px 8px" }} onClick={() => dropAdd(id, buckets)}>🗑 지움</button>
        ) : (
          <button className="btn btn-ghost btn-sm" disabled={pending}
            title="교재 루틴에는 있지만 이 학생은 안 합니다"
            style={{ padding: "2px 8px" }} onClick={() => toggle(id)}>✕ 뺌</button>
        )}
      </span>
    </div>
    );
  };

  const Group = ({ title, ids, buckets }) => (
    <div className="stack" style={{ gap: 2 }}>
      <span className="hint" style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</span>
      {ids.map((id, i) => <Row key={id} id={id} i={i} group={ids} buckets={buckets} />)}
      {ids.length === 0 && <span className="hint" style={{ fontSize: 12.5 }}>아직 없어요.</span>}
      <AddBar buckets={buckets} />
    </div>
  );

  /**
   * **고르는 판은 등원 학습 고르기와 같은 부품·같은 규칙** (원칙 1 —
   * 새로 그리지 않는다):
   *   · 거르기   lib/pickSearch — 한두 글자는 앞머리로 (「E」 가 e 든 것에
   *              죄다 걸려 묻히던 문제)
   *   · 준비물   toolBadge, 그리고 **준비물로도 걸린다**. 「필수학습」 만
   *              뜨면 무엇인지 모른다는 원장 지적(2026-08-28)의 짝이다
   *   · 이미 있는 항목은 「✓있음」 으로 적고 **다시 안 담기게 막는다**
   *
   * 고르는 목록(hwItems)은 교재 화면의 루틴 편집기가 쓰는 **그 한 벌**을
   * 그대로 받아 쓴다 (재원생 화면이 이미 읽어 내려주는 것) — 조회를 새로
   * 만들지 않았다.
   */
  const AddBar = ({ buckets }) => {
    const open = buckets.includes(openAdd);
    return (
      <div className="stack" style={{ gap: 4, marginTop: 2 }}>
        <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
          {ADD_BUCKETS.filter((b) => buckets.includes(b.key)).map((b) => (
            <button
              key={b.key}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12.5 }}
              disabled={pending}
              title={`이 학생에게만 ${b.label} 항목을 더합니다 — ${b.hint}. 다른 학생은 안 바뀝니다`}
              onClick={() => { setOpenAdd(openAdd === b.key ? null : b.key); setQ(""); }}
            >
              {openAdd === b.key ? "접기" : `＋ 이 학생만 · ${b.label}`}
            </button>
          ))}
        </div>

        {open && !data.더하기가능 && (
          <p className="hint" style={{ margin: 0 }}>
            관리자 → SQL 확인에서 <b>0182</b> 를 먼저 실행해 주세요 — 아직 더한 항목을 담을 칸이 없어요.
          </p>
        )}

        {open && data.더하기가능 && (() => {
          const bucket = openAdd;
          const already = new Set([
            ...add[bucket],
            ...(bucket === "inclass" ? routineIn : routineHome),
          ]);
          const pick = keywordFilter(hwItems, q, (i) => [i.name, i.tool, i.category]);
          const by = new Map();
          pick.forEach((i) => {
            const g = i.category || "기타";
            if (!by.has(g)) by.set(g, []);
            by.get(g).push(i);
          });
          return (
            <div className="stack" style={{ gap: 2 }}>
              <input
                className="input input-sm"
                style={{ width: "100%" }}
                placeholder="항목·준비물로 거르기 (한두 글자는 앞머리로)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {pick.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>「{q.trim()}」 에 맞는 항목이 없어요.</p>
              ) : (
                [...by.entries()].map(([g, list]) => (
                  <div className="hwgroup" key={g}>
                    <span className={`tag ${CAT_CLS[g] || "tag-muted"} hwcat`}>{g}</span>
                    <div className="row" style={{ gap: 4 }}>
                      {list.map((i) => {
                        const on = already.has(i.id);
                        return (
                          <button
                            key={i.id}
                            className={`hwchip ${on ? "hw-next" : ""}`}
                            disabled={pending || on}
                            title={on
                              ? "이미 이 학생 루틴에 있어요"
                              : `이 학생에게만 더합니다 (${ADD_BUCKETS.find((b) => b.key === bucket)?.label})`}
                            onClick={() => addItem(bucket, i.id)}
                          >
                            {on && <b>✓있음</b>} {i.name}
                            {i.tool ? <span className="hint"> {toolBadge(i.tool)}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <span className="hint" style={{ fontSize: 12.5 }}>
                더하면 <b>이 학생의 이 교재 루틴 모든 회차</b>에 나옵니다 — 다른 학생은 안 바뀌어요.
              </span>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span
          className={`tag ${data.따르는루틴 === "영역" ? "tag-amber" : "tag-muted"}`}
          title={
            data.따르는루틴 === "영역"
              ? "이 교재에는 교재 루틴이 없어서 영역 루틴을 따르고 있어요 — 교재 화면에서 단계를 하나라도 만들면 그때부터 교재 루틴이 우선합니다"
              : "이 교재에 만들어 둔 교재 루틴입니다"
          }
        >
          {data.따르는루틴 === "영역" ? "영역 루틴을 따르는 중" : "교재 루틴"}
        </span>
        <span className="hint">
          {data.회독 > 1 ? `${data.회독}회독` : ""}
          {off > 0 ? `${data.회독 > 1 ? " · " : ""}${off}개 뺌` : ""}
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

      {/**
        * **원장님이 작성한 루틴 그대로** (원장님 2026-08-28 — 「루틴 내용
        * 내가 작성한 거랑 달라」).
        *
        * 아래 두 목록은 「무엇을 뺄까 · 어떤 차례로 할까」를 정하는 자리라
        * 회차를 흩어 평탄하게 편다(0154 — 원장님이 그렇게 해달라고 하셨다).
        * 그런데 그것만 보이면 **작성한 것과 다른 글**로 읽힌다 — 회차도
        * 단계 이름도 없어졌으니까. 그래서 작성한 원본을 그대로 위에 둔다.
        * 여기는 읽기만 — 고치는 곳은 교재 화면의 루틴 편집기 한 곳이다.
        */}
      <details className="card sect sect-calm" style={{ padding: "6px 8px" }}>
        <summary className="hint" style={{ cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>
          작성하신 {data.따르는루틴 === "영역" ? "영역" : "교재"} 루틴 그대로 보기 ({data.steps.length}회차)
        </summary>
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          {data.steps.map((st) => (
            <div className="stack" key={st.id} style={{ gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {st.no}. {st.label || "(이름 없음)"}
              </span>
              <div className="row" style={{ gap: 4, alignItems: "baseline" }}>
                <span className="tag tag-lav" style={{ minWidth: 34, justifyContent: "center" }}>등원</span>
                <span style={{ fontSize: 13 }}>{st.inclass.map((x) => x.name).join(" · ") || "—"}</span>
              </div>
              <div className="row" style={{ gap: 4, alignItems: "baseline" }}>
                <span className="tag tag-mint" style={{ minWidth: 34, justifyContent: "center" }}>숙제</span>
                <span style={{ fontSize: 13 }}>{st.home.map((x) => x.name).join(" · ") || "—"}</span>
              </div>
              {(st.next || []).length > 0 && (
                <div className="row" style={{ gap: 4, alignItems: "baseline" }}>
                  <span className="tag tag-sky" style={{ minWidth: 34, justifyContent: "center" }}>예습</span>
                  <span style={{ fontSize: 13 }}>
                    {st.next.map((x) => x.name).join(" · ")}
                    <span className="hint"> (다음 단원)</span>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </details>

      <Group title="등원 학습 — 학원에서 이 차례로" ids={inList} buckets={["inclass"]} />
      <Group title="집 숙제 — 아이 화면에 이 차례로" ids={homeList} buckets={["home", "next"]} />
      {live.length === 0 && <span className="hint">전부 뺐어요 — 이 교재에서는 아무것도 안 나갑니다.</span>}

      {off > 0 && (
        <div className="row" style={{ gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span className="hint" style={{ fontSize: 12 }}>뺀 것</span>
          {[...skip].map((id) => (
            <button key={id} className="chip" disabled={pending}
              title="누르면 다시 합니다"
              style={{ textDecoration: "line-through", opacity: 0.6 }}
              onClick={() => toggle(id)}>
              {nameOf(id)}{itemOf(id).tool ? ` ${toolBadge(itemOf(id).tool)}` : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
