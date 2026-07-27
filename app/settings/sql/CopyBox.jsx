"use client";

import { useState } from "react";

/** 마지막 진짜 줄 (빈 줄 빼고) — 제대로 붙었는지 눈으로 맞춰보는 용도 */
function lastLine(sql = "") {
  const lines = sql.split("\n").filter((l) => l.trim());
  return lines[lines.length - 1] || "";
}

export default function CopyBox({ sql, empty }) {
  const [done, setDone] = useState(false);

  if (empty) {
    return (
      <p className="hint">
        SQL 파일을 읽지 못했습니다. 깃허브에서 직접 여세요 →{" "}
        <a
          href="https://github.com/make1chloe/prep-structure/blob/main/supabase/SETUP_ALL.sql"
          target="_blank"
          rel="noreferrer"
        >
          supabase/SETUP_ALL.sql
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
      <div
        className="card card-tight"
        style={{ background: "transparent", marginBottom: 8, fontSize: 12 }}
      >
        <b style={{ fontSize: 12.5 }}>붙여넣은 뒤 이것만 확인해주세요</b>
        <div className="hint" style={{ marginTop: 5, lineHeight: 1.8 }}>
          · Supabase 편집기의 마지막 줄 번호가 <b>{sql.split("\n").length.toLocaleString()}</b> 이어야
          합니다
          <br />
          · 마지막 줄이 <code>{lastLine(sql)}</code> 이어야 합니다
          <br />
          · 그 아래에 <b>파일 이름 같은 게 딸려왔으면 지워주세요.</b> SQL 이 아니라서 에러가 납니다
        </div>
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
