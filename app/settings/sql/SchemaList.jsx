"use client";

import { useState } from "react";

/**
 * 지금 DB 상태 — **문제가 있는 것만.**
 *
 * 원장님 (2026-08-06) — 「잘 들어간 건 안 봐도 되고 문제가 있는 것만 보게 해줘.
 * 목록이 너무 길어」
 *
 * 마이그레이션이 여든 개를 넘었다. 다 늘어놓으면 화면 두 판이 「OK」 로 차고,
 * 정작 봐야 할 「없음」 두 줄이 그 사이에 묻힌다. **다 됐다는 말은 숫자 하나면
 * 충분하다** — 손댈 것이 있는 줄만 남긴다.
 *
 * 잘 들어간 것도 필요하면 펼쳐 볼 수 있게 둔다. 안 보이는 것과 없는 것은
 * 다르고, 「내가 넣은 0087 이 목록에 아예 없는데?」 를 확인할 길은 있어야 한다.
 */
export default function SchemaList({ checks = [] }) {
  const [openAll, setOpenAll] = useState(false);

  const missing = checks.filter((c) => !c.ok);
  const done = checks.length - missing.length;
  const show = openAll ? checks : missing;

  return (
    <div className="stack" style={{ gap: 3, marginTop: 8 }}>
      {/* 다 됐을 때는 아무것도 안 적는다 — 위 제목 줄에 이미 「다 들어가 있습니다」 가 있다 */}
      {show.map((c) => (
        <div className="unitrow" key={c.id + (c.col || c.rpc || "")}>
          <span className={`tag ${c.ok ? "tag-mint" : "tag-amber"}`}>{c.ok ? "OK" : "없음"}</span>
          <span className="hint" style={{ minWidth: 44 }}>{c.id}</span>
          <span style={{ fontSize: 14, flex: 1 }}>{c.label}</span>
          {!c.ok && (
            <span className="hint" style={{ fontSize: 12, maxWidth: 320, textAlign: "right" }}>
              {c.why}
            </span>
          )}
        </div>
      ))}

      {done > 0 && (
        <button
          className="btn btn-ghost btn-sm"
          style={{ alignSelf: "flex-start", marginTop: 4 }}
          onClick={() => setOpenAll(!openAll)}
        >
          {openAll ? "문제 있는 것만 보기" : `잘 들어간 ${done}가지도 보기`}
        </button>
      )}
    </div>
  );
}
