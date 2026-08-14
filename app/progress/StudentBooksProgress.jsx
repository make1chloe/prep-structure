"use client";

import { useEffect, useState } from "react";
import BookProgress from "@/components/BookProgress";
import { listStudentUnitsMany } from "./actions";

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

  return (
    <div className="bookgrid">
      {books.map((b) => (
        <BookProgress
          key={b.id}
          studentId={studentId}
          book={b}
          openFirst
          initialUnits={byBook[b.id]?.units || []}
          initialRound={byBook[b.id]?.round || b.round || 1}
        />
      ))}
    </div>
  );
}
