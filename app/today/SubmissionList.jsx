"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { viewUrl } from "@/app/me/submitActions";
import { markSubmissionChecked } from "./submissionActions";

/**
 * 학생이 낸 것 — 사진 · 녹음 · 글.
 *
 * 버킷이 비공개라 주소만으로는 안 열린다. 누를 때 10분짜리 링크를
 * 새로 만들어 그 자리에서 연다.
 */
/** 체크리스트는 글자로 담겨 온다 — 못 읽으면 조용히 빈 것으로 본다 */
function parseList(body) {
  try {
    const v = JSON.parse(body || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function SubmissionList({ rows = [], items = [] }) {
  const [open, setOpen] = useState({});     // id → signed url
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const nameOf = (id) => items.find((i) => i.id === id)?.name || "숙제";

  if (rows.length === 0) return null;

  function show(row) {
    if (open[row.id]) {
      setOpen((o) => ({ ...o, [row.id]: null }));
      return;
    }
    startTransition(async () => {
      const res = await viewUrl(row.path);
      if (res?.error) { alert(res.error); return; }
      setOpen((o) => ({ ...o, [row.id]: res.url }));
    });
  }

  return (
    <div className="prow">
      <span className="plabel">낸 숙제</span>
      <div className="stack" style={{ gap: 6, flex: 1 }}>
        {rows.map((r) => (
          <div key={r.id} className="stack" style={{ gap: 4 }}>
            <div className="unitrow">
              <span className={`tag ${r.checked_at ? "tag-muted" : "tag-amber"}`}>
                {r.kind === "audio" ? "녹음" : r.kind === "checklist" ? "체크" : "사진"}
              </span>
              <b style={{ fontSize: 13 }}>{nameOf(r.homework_item_id)}</b>
              <span className="hint" style={{ fontSize: 11.5 }}>
                {r.kind === "audio" && r.seconds ? `${r.seconds}초 · ` : ""}
                {new Date(r.created_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              <span className="spacer" />
              {r.kind !== "checklist" && (
                <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => show(r)}>
                  {open[r.id] ? "닫기" : r.kind === "audio" ? "들어보기" : "보기"}
                </button>
              )}
              {!r.checked_at && (
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await markSubmissionChecked(r.id);
                      if (res?.error) alert(res.error);
                      router.refresh();
                    })
                  }
                >
                  확인
                </button>
              )}
            </div>

            {r.kind === "checklist" && (
              <div className="stack" style={{ gap: 2 }}>
                {parseList(r.body).map((x, i) => (
                  <span key={i} className="hint" style={{ fontSize: 12.5 }}>
                    {x.done ? "☑" : "☐"} {x.text}
                  </span>
                ))}
              </div>
            )}
            {open[r.id] && r.kind === "audio" && (
              <audio controls src={open[r.id]} style={{ width: "100%" }} />
            )}
            {open[r.id] && r.kind === "photo" && (
              <a href={open[r.id]} target="_blank" rel="noreferrer">
                <img
                  src={open[r.id]}
                  alt=""
                  style={{ maxWidth: "100%", borderRadius: 8, display: "block" }}
                />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
