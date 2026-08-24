"use client";

import { useEffect, useState, useTransition } from "react";
import RoutinePick from "./RoutinePick";
import RoutineEditor from "@/app/textbooks/RoutineEditor";
import { routineLayout, setAreaOrder, setBookSort } from "./routinePickActions";

/**
 * **차례는 세 겹이다** (원장님 2026-08-24 — 「독해/문법/영작 순서를 먼저
 * 놓고, 그 안에서 루틴순서」 · 「교재학습 순서도 정할 수 있게 해줘」).
 *
 *   ① 영역   독해 → 문법 → 영작
 *   ② 교재   그 영역 안에서 어느 책부터
 *   ③ 항목   그 책의 루틴에서 무엇부터 (등원끼리 · 숙제끼리 — RoutinePick)
 *
 * 이 판이 ①②를 맡고, 교재를 펼치면 ③이 나온다.
 * **화면을 새로 그리지 않는다** — 차례는 ↑↓ 를 여러 번 누르는 자리라,
 * 한 번 누를 때마다 판이 새로 그려지면 열어둔 것이 접히고 눈이 튄다.
 */
export default function RoutineAssign({ studentId, hwItems = [] }) {
  const [d, setD] = useState(null);
  const [openBook, setOpenBook] = useState(null);
  const [editBook, setEditBook] = useState(null);
  const [pending, startTransition] = useTransition();

  async function load() {
    const r = await routineLayout(studentId);
    setD(r);
  }
  useEffect(() => {
    let live = true;
    routineLayout(studentId).then((r) => { if (live) setD(r); });
    return () => { live = false; };
  }, [studentId]);

  if (d === null) return <p className="hint" style={{ margin: 0 }}>불러오는 중…</p>;
  if (!d.books.length) {
    return <p className="hint" style={{ margin: 0 }}>배정된 교재가 없어요 — 위에서 먼저 교재를 붙여주세요.</p>;
  }

  const areas = d.areas;
  const 미정 = d.books.filter((b) => !b.정함).length;

  function moveArea(area, dir) {
    const i = areas.indexOf(area);
    const j = i + (dir === "up" ? -1 : 1);
    if (j < 0 || j >= areas.length) return;
    const next = [...areas];
    [next[i], next[j]] = [next[j], next[i]];
    const before = d;
    setD({ ...d, areas: next, books: sortBooks(d.books, next) });
    startTransition(async () => {
      const res = await setAreaOrder(studentId, next);
      if (res?.error) { setD(before); alert(res.error); }
    });
  }

  function sortBooks(books, order) {
    const rank = new Map(order.map((a, i) => [a, i]));
    return [...books].sort((x, y) => {
      const ax = rank.get(x.area) ?? 9e9;
      const ay = rank.get(y.area) ?? 9e9;
      if (ax !== ay) return ax - ay;
      if (x.sort !== y.sort) return x.sort - y.sort;
      return x.name.localeCompare(y.name, "ko");
    });
  }

  function moveBook(book, dir) {
    const sameArea = d.books.filter((b) => b.area === book.area);
    const i = sameArea.findIndex((b) => b.id === book.id);
    const j = i + (dir === "up" ? -1 : 1);
    if (j < 0 || j >= sameArea.length) return;
    const reordered = [...sameArea];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    const pairs = reordered.map((b, k) => ({ textbookId: b.id, sort: k }));
    const before = d;
    const nextBooks = d.books.map((b) => {
      const hit = pairs.find((p) => p.textbookId === b.id);
      return hit ? { ...b, sort: hit.sort } : b;
    });
    setD({ ...d, books: sortBooks(nextBooks, areas) });
    startTransition(async () => {
      const res = await setBookSort(studentId, pairs);
      if (res?.error) { setD(before); alert(res.error); }
    });
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="hint" style={{ margin: 0 }}>
        위에서부터 하는 차례예요 — <b>영역 → 교재 → 항목</b>. 교재를 누르면 그 안의 항목을 고르고 차례를 잡습니다.
        {미정 > 0 ? ` · 아직 안 정한 교재 ${미정}권` : ""}
      </p>

      {/* ── ① 영역 차례 */}
      {areas.length > 1 && (
        <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span className="hint" style={{ fontSize: 12.5, fontWeight: 700 }}>
            영역 차례 <span style={{ fontWeight: 400 }}>← → 로 바꿔요</span>
          </span>
          {areas.map((a, i) => (
            <span key={a || "그밖"} className="row" style={{ gap: 0, alignItems: "center" }}>
              <span className="tag tag-muted">{a || "그 밖"}</span>
              <button className="btn btn-ghost btn-sm" title="앞으로" disabled={pending || i === 0}
                style={{ padding: "2px 5px" }} onClick={() => moveArea(a, "up")}>←</button>
              <button className="btn btn-ghost btn-sm" title="뒤로" disabled={pending || i === areas.length - 1}
                style={{ padding: "2px 5px" }} onClick={() => moveArea(a, "down")}>→</button>
            </span>
          ))}
        </div>
      )}

      {/* ── ② 교재 차례 · ③ 펼치면 항목 */}
      {d.books.map((b, i) => {
        const sameArea = d.books.filter((x) => x.area === b.area);
        const at = sameArea.findIndex((x) => x.id === b.id);
        const open = openBook === b.id;
        return (
          <div key={b.id} className="stack" style={{ gap: 4 }}>
            <div className="stuLine" style={{ padding: "3px 0", cursor: "default" }}>
              <span className="stuWho">
                <span className="hint" style={{ width: 16, textAlign: "right" }}>{i + 1}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "2px 4px", fontWeight: 700 }}
                  onClick={() => setOpenBook(open ? null : b.id)}
                >
                  {open ? "▾" : "▸"} {b.name}
                </button>
              </span>
              <span className="stuTags">
                {b.area && <span className="tag tag-muted">{b.area}</span>}
                {b.정함 ? (
                  <span className="tag tag-mint">정함</span>
                ) : (
                  <span className="tag tag-amber">루틴 안 정함</span>
                )}
              </span>
              <span className="stuEnd">
                {/**
                  * **영역에 교재가 하나면 ↑↓ 를 아예 안 보여준다**
                  * (원장님 2026-08-24 — 「여기 화살표가 안 움직여」).
                  * 교재 차례는 **그 영역 안에서만** 뜻이 있다. 영역마다 한 권씩
                  * 이면 눌러도 움직일 데가 없는데, 흐릿하게라도 단추가 있으면
                  * 고장 난 것처럼 보인다. 그 자리엔 어디서 바꾸는지를 적는다.
                  */}
                {sameArea.length > 1 ? (
                  <>
                    <button className="btn btn-ghost btn-sm" title="이 영역 안에서 위로"
                      disabled={pending || at === 0} style={{ padding: "2px 6px" }}
                      onClick={() => moveBook(b, "up")}>↑</button>
                    <button className="btn btn-ghost btn-sm" title="이 영역 안에서 아래로"
                      disabled={pending || at === sameArea.length - 1} style={{ padding: "2px 6px" }}
                      onClick={() => moveBook(b, "down")}>↓</button>
                  </>
                ) : (
                  <span className="hint" style={{ fontSize: 12 }}>
                    {areas.length > 1 ? "차례는 위 「영역 차례」 로" : ""}
                  </span>
                )}
              </span>
            </div>
            {open && (
              <div className="stack" style={{ gap: 6, paddingLeft: 16 }}>
                <RoutinePick studentId={studentId} book={b} onStamp={load} />
                {/* 루틴 **자체**를 고치는 것은 따로 — 다른 학생도 같이 바뀐다 */}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => setEditBook((cur) => (cur === b.id ? null : b.id))}
                >
                  {editBook === b.id ? "▾" : "▸"} 이 교재의 루틴 자체 고치기 (다른 학생도 같이 바뀜)
                </button>
                {editBook === b.id && (
                  <RoutineEditor key={`rte-${b.id}`} textbookId={b.id} items={hwItems} />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
