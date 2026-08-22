"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BookProgress from "@/components/BookProgress";
import { listStudentUnitsMany, endStudentBooks } from "./actions";

/**
 * 한 학생의 교재 진도 판 묶음 — **한 왕복으로** (원장님, 2026-08-14 —
 * 「재원생 페이지에서 저장할 때도 효율적으로」).
 *
 * 전에는 판마다 따로 서버에 다녀왔다 (교재 네 권 = 네 왕복, 판마다
 * 「불러오는 중…」). 여기서 한 번에 받아 나눠준다.
 * 재원생 교재 탭과 진도 화면이 같은 한 벌을 쓴다.
 */
export default function StudentBooksProgress({ studentId, books = [] }) {
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
