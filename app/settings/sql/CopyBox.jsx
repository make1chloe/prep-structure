"use client";

import { useState } from "react";

export default function CopyBox({ sql, empty }) {
  const [done, setDone] = useState(false);

  if (empty) {
    return (
      <p className="hint">
        SQL 파일을 읽지 못했습니다. 깃허브에서 직접 여세요 →{" "}
        <a
          href="https://github.com/make1chloe/prep-structure/blob/main/supabase/%ED%95%9C%EB%B2%88%EC%97%90_%EC%8B%A4%ED%96%89.sql"
          target="_blank"
          rel="noreferrer"
        >
          supabase/한번에_실행.sql
        </a>
      </p>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sql);
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            } catch {
              alert("복사가 안 되면 아래 상자에서 전체 선택(Ctrl+A) 후 복사하세요.");
            }
          }}
        >
          {done ? "복사됐어요 ✓" : "전체 복사"}
        </button>
        <span className="hint" style={{ alignSelf: "center" }}>
          {sql.split("\n").length.toLocaleString()}줄
        </span>
      </div>
      <textarea
        className="input"
        readOnly
        value={sql}
        onFocus={(e) => e.target.select()}
        style={{ width: "100%", height: 320, fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}
      />
    </>
  );
}
