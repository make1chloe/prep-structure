"use client";

import { useState } from "react";

/**
 * **교재 여러 권 고르기 — 한 벌** (원장님, 2026-08-15 — 「(상담 교재도)
 * 실제로 재원생에게 배정하는 것과 같이 해줘. 한 권만 고르는 것도 아니고
 * 검색도 안 됨」).
 *
 * 재원생 교재 배정(StudentBooks)에 있던 고르는 판 — 검색 · 영역으로
 * 좁히기 · 칩 눌러 넣고 빼기 — 을 떼어낸 것이다. 신규 상담도 같은 판을
 * 쓴다. 고르는 화면이 두 벌이 되면 한쪽만 좋아지고 한쪽은 낡는다.
 *
 * @param books    [{ id, name, area }]
 * @param picked   Set(교재 id) — 지금 골라져 있는 것
 * @param onToggle (id) => void — 칩을 눌렀을 때 (넣기·빼기 판단은 부모가)
 */
export default function BookPickPanel({ books = [], picked = new Set(), onToggle, disabled = false }) {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");

  // 교재는 이름을 다 외우고 있지 않다. **영역부터 좁히면** 몇 권 안 남는다.
  const areas = [...new Set(books.map((b) => b.area).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko")
  );
  const kw = q.trim().toLowerCase();
  const pool = area ? books.filter((b) => b.area === area) : books;
  const shown =
    kw || area
      ? pool
          .filter((b) => !kw || [b.name, b.area].filter(Boolean).some((v) => v.toLowerCase().includes(kw)))
          .slice(0, 60)
      : [
          ...books.filter((b) => picked.has(b.id)),
          ...books.filter((b) => !picked.has(b.id)).slice(0, 12),
        ];

  return (
    <>
      <div className="row" style={{ gap: 4, alignItems: "center", marginBottom: 8 }}>
        <input
          className="input input-sm"
          style={{ width: 160 }}
          placeholder="교재 이름"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {areas.length > 0 && (
          <>
            <button type="button" className={`hwchip ${area === "" ? "hw-next" : ""}`} onClick={() => setArea("")}>
              전체
            </button>
            {areas.map((a) => {
              const n = books.filter((b) => b.area === a).length;
              return (
                <button
                  type="button"
                  key={a}
                  className={`hwchip ${area === a ? "hw-next" : ""}`}
                  onClick={() => setArea(area === a ? "" : a)}
                >
                  {a} {n}
                </button>
              );
            })}
          </>
        )}
      </div>
      <div className="row" style={{ gap: 4, maxHeight: 200, overflowY: "auto" }}>
        {shown.map((b) => (
          <button
            type="button"
            key={b.id}
            className={`hwchip ${picked.has(b.id) ? "hw-next" : ""}`}
            disabled={disabled}
            onClick={() => onToggle?.(b.id)}
          >
            {picked.has(b.id) && <b>＋</b>} {b.area ? `[${b.area}] ` : ""}
            {b.name}
          </button>
        ))}
        {shown.length === 0 && <span className="hint">맞는 교재가 없어요.</span>}
      </div>
      {!kw && !area && books.length > shown.length && (
        <p className="hint" style={{ marginTop: 6 }}>
          일부만 보여요. 검색창에 교재 이름을 치면 찾을 수 있어요.
        </p>
      )}
    </>
  );
}
