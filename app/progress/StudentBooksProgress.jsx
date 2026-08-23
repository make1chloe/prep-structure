"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BookProgress from "@/components/BookProgress";
import { listStudentUnitsMany, endStudentBooks, addStudentBookDated } from "./actions";
import { todaySeoul } from "@/lib/day";
import { AREA_ORDER } from "@/lib/bookSort";

/**
 * 한 학생의 교재 진도 판 묶음 — **한 왕복으로** (원장님, 2026-08-14 —
 * 「재원생 페이지에서 저장할 때도 효율적으로」).
 *
 * 전에는 판마다 따로 서버에 다녀왔다 (교재 네 권 = 네 왕복, 판마다
 * 「불러오는 중…」). 여기서 한 번에 받아 나눠준다.
 * 재원생 교재 탭과 진도 화면이 같은 한 벌을 쓴다.
 */
export default function StudentBooksProgress({ studentId, books = [], allBooks = [] }) {
  /**
   * **진도 판에서 바로 교재 추가** (원장님 2026-08-23 — 「진도체크에서
   * 바로 학생한테 교재 추가할 수 있게」). 재원생 화면까지 안 건너가게 —
   * 배정 판단은 addStudentBookDated 한 벌 재사용.
   */
  const [adding, setAdding] = useState(false);
  const [addBook, setAddBook] = useState("");
  const [addFrom, setAddFrom] = useState(todaySeoul());
  const [addQ, setAddQ] = useState("");   // 교재 검색 (긴 드롭다운이 번거롭다 — 2026-08-23)
  const [byBook, setByBook] = useState(null);
  /**
   * **🧹 정리 — 안 쓰는 교재를 골라 한 번에 끝냄** (원장님, 2026-08-14 —
   * 「오늘 진도에 사용 중인 교재가 아니라 누적 교재가 다 나와」).
   * 교재안내 이관으로 옛 책까지 전부 사용 중이 됐다 — 한 권씩 열어
   * 끝냄을 누르기엔 많다. 골라서 한 번에 치운다 (끝낸 교재 기록에 남는다).
   */
  const [tidy, setTidy] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let dead = false;
    setByBook(null);
    if (books.length === 0) { setByBook({}); return; }
    listStudentUnitsMany(studentId, books.map((b) => b.id)).then((res) => {
      if (!dead) setByBook(res.byBook || {});
    });
    return () => { dead = true; };
  }, [studentId]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (books.length === 0) {
    return (
      <p className="hint" style={{ margin: 0 }}>
        배정된 교재가 없어요. 재원생 → 교재 탭이나 학습 → 교재에서 배정하세요.
      </p>
    );
  }
  if (byBook === null) return <p className="hint">진도 불러오는 중…</p>;

  function endPicked() {
    const ids = [...sel];
    if (ids.length === 0) return;
    const names = books.filter((b) => sel.has(b.id)).map((b) => b.name).join(" · ");
    if (!confirm(`${ids.length}권을 끝낸 교재로 처리할까요?\n\n${names}\n\n숙제·진도 화면에서 빠지고 「지난 교재」 기록에 남습니다.`)) return;
    startTransition(async () => {
      const res = await endStudentBooks(studentId, ids);
      if (res?.error) { alert(res.error); return; }
      setSel(new Set());
      setTidy(false);
      router.refresh();
    });
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <button
          className={`btn btn-sm ${tidy ? "btn-primary" : "btn-ghost"}`}
          onClick={() => { setTidy(!tidy); setSel(new Set()); }}
          title="안 쓰는 교재를 골라 한 번에 끝냄 처리합니다"
        >
          🧹 교재 정리
        </button>
        {tidy && (
          <>
            <span className="hint">이제 안 쓰는 교재를 누르세요 — 한 번에 끝냄 처리돼요</span>
            <button
              className="btn btn-primary btn-sm"
              disabled={pending || sel.size === 0}
              onClick={endPicked}
            >
              {sel.size}권 끝냄
            </button>
          </>
        )}
      </div>
      {tidy && (
        <div className="row" style={{ gap: 4 }}>
          {books.map((b) => (
            <button
              key={b.id}
              className={`hwchip ${sel.has(b.id) ? "hw-next" : ""}`}
              onClick={() => {
                const n = new Set(sel);
                n.has(b.id) ? n.delete(b.id) : n.add(b.id);
                setSel(n);
              }}
            >
              {sel.has(b.id) && <b>✓</b>} {b.name}
              {b.from && <span className="hint" style={{ marginLeft: 4 }}>{b.from.slice(2)}부터</span>}
            </button>
          ))}
        </div>
      )}
      {allBooks.length > 0 && (
        <div className="row" style={{ gap: 6, alignItems: "center", margin: "4px 0 8px", flexWrap: "wrap" }}>
          {!adding ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
              ＋ 교재 추가
            </button>
          ) : (
            <>
              {/* 검색 + 영역 묶음 칩 (원장님 2026-08-23 「교재 고르기 방식이
                  번거로워」) — 긴 드롭다운 대신 몇 자 치고 칩 한 번 */}
              <input
                className="input input-sm"
                style={{ width: 160 }}
                placeholder="교재 검색"
                value={addQ}
                autoFocus
                onChange={(e) => { setAddQ(e.target.value); }}
              />
              <input
                className="input input-sm" type="date" style={{ width: 145 }}
                value={addFrom} onChange={(e) => setAddFrom(e.target.value)}
                title="언제부터 쓰나 — 오늘이면 그대로"
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={pending || !addBook}
                onClick={() =>
                  startTransition(async () => {
                    const res = await addStudentBookDated(studentId, addBook, addFrom, null);
                    if (res?.error) { alert(res.error); return; }
                    setAdding(false);
                    setAddBook("");
                    router.refresh();
                  })
                }
              >
                {pending ? "넣는 중…" : "배정"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>취소</button>
              <div style={{ width: "100%" }}>
                {(() => {
                  const kw = addQ.trim().toLowerCase();
                  const pool = allBooks
                    .filter((ab) => !books.some((b) => b.id === ab.id))
                    .filter((ab) => !kw || ab.name.toLowerCase().includes(kw));
                  const order = [...AREA_ORDER, ""];
                  const groups = order
                    .map((a) => ({
                      area: a || "기타",
                      // 묶음 안은 이름순 (원장님 2026-08-23 「정렬이 안 되어 있어」)
                      rows: pool
                        .filter((ab) => (ab.area || "기타") === (a || "기타"))
                        .sort((x, y) => x.name.localeCompare(y.name, "ko")),
                    }))
                    .filter((g) => g.rows.length > 0);
                  if (pool.length === 0)
                    return <p className="hint" style={{ margin: "4px 0 0" }}>맞는 교재가 없어요.</p>;
                  return groups.map((g) => (
                    <div key={g.area} className="row" style={{ gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="tag tag-muted" style={{ minWidth: 44, justifyContent: "center" }}>{g.area}</span>
                      {g.rows.map((ab) => (
                        <button
                          key={ab.id}
                          className={`chip ${addBook === ab.id ? "on" : ""}`}
                          onClick={() => setAddBook(addBook === ab.id ? "" : ab.id)}
                        >
                          {ab.name}
                        </button>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            </>
          )}
        </div>
      )}
      <div className="bookgrid">
        {books.map((b) => (
          <BookProgress
            key={b.id}
            studentId={studentId}
            book={b}
            /* 접힌 채로 시작 (원장님 2026-08-23 「교재 다 펼쳐지지 않게 —
               접힌 상태로, 클릭하면 펼쳐지게」) — 교재가 예닐곱이면 다 펴진
               판이 한 화면을 넘겨 스크롤 지옥이었다 */
            initialUnits={byBook[b.id]?.units || []}
            initialRound={byBook[b.id]?.round || b.round || 1}
          />
        ))}
      </div>
    </div>
  );
}
