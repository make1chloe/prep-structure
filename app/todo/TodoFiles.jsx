"use client";

import { useEffect, useState } from "react";
import { taskFileUrls } from "@/app/tasks/photoActions";
import { shownName, isImage, fileKind } from "@/lib/noticeFile";

/**
 * 할일에 붙은 사진·파일 (0147 — 빠른 메모에서 붙인 것).
 *
 * 비공개 버킷이라 주소가 그때그때 새로 만들어진다 — 펼칠 때 한 번 받아온다.
 * 그림은 미리보기로, 나머지는 이름표로. 누르면 새 창에 원본이 열린다.
 * 이름·갈래를 읽는 법은 lib/noticeFile 한 벌 (공지 첨부와 같다).
 */
export default function TodoFiles({ paths = [] }) {
  const [urls, setUrls] = useState(null);
  const key = paths.join("|");
  useEffect(() => {
    let alive = true;
    if (paths.length === 0) { setUrls({}); return () => {}; }
    taskFileUrls(paths).then((r) => { if (alive) setUrls(r?.urls || {}); });
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (paths.length === 0) return null;
  if (!urls) return <span className="hint" style={{ fontSize: 12.5 }}>첨부 여는 중…</span>;

  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      {paths.map((p) => {
        const url = urls[p];
        if (!url) {
          return (
            <span key={p} className="tag tag-muted" title="열 수 없어요">
              {shownName(p)}
            </span>
          );
        }
        return isImage(p) ? (
          <a key={p} href={url} target="_blank" rel="noreferrer" title={shownName(p)}>
            <img
              src={url}
              alt={shownName(p)}
              style={{
                width: 84, height: 84, objectFit: "cover",
                borderRadius: 8, border: "1px solid var(--border)",
              }}
            />
          </a>
        ) : (
          <a
            key={p} href={url} target="_blank" rel="noreferrer"
            className="tag tag-sky"
            style={{ display: "inline-block", padding: "8px 10px" }}
          >
            {fileKind(p)} · {shownName(p)}
          </a>
        );
      })}
    </div>
  );
}
