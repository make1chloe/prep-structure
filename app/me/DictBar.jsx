"use client";

import { useState } from "react";

/**
 * **영어사전 검색** (원장님, 2026-08-16 — 「학생용 페이지 하단에 네이버나
 * 다음 영어사전 연동」 → 「연동」).
 *
 * 사전 화면을 앱 안에 끼워 넣을 수는 없다 — 네이버·다음이 남의 페이지
 * 안에 뜨는 것(iframe)을 막아둔다. 대신 여기서 단어를 치면 **그 단어가
 * 검색된 사전이 새 창으로** 열린다. 홈 화면 앱에서도 브라우저로 뜬다.
 */
export default function DictBar() {
  const [q, setQ] = useState("");

  function open(which) {
    const w = q.trim();
    if (!w) return;
    const url =
      which === "daum"
        ? `https://dic.daum.net/search.do?q=${encodeURIComponent(w)}&dic=eng`
        : `https://en.dict.naver.com/#/search?query=${encodeURIComponent(w)}`;
    window.open(url, "_blank", "noopener");
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800 }}>영어사전</h2>
      <form
        className="row"
        style={{ gap: 6 }}
        onSubmit={(e) => { e.preventDefault(); open("naver"); }}
      >
        <input
          className="input input-sm"
          style={{ flex: 1, minWidth: 140 }}
          placeholder="모르는 단어를 찾아보세요"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn-sm" disabled={!q.trim()}>
          네이버 사전
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!q.trim()}
          onClick={() => open("daum")}
        >
          다음 사전
        </button>
      </form>
    </div>
  );
}
