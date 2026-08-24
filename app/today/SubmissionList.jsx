"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLazyRefresh } from "@/components/useLazyRefresh";
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
  // 「확인」 은 누르는 순간 태그가 바뀐다 — 서버 답을 기다리면 한 박자 늦다
  // (원장님 2026-08-21 「버튼이 작동이 너무 늦어」). 실패하면 되돌리고 알린다.
  const [checkedLocal, setCheckedLocal] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // 판이 열려 있는 동안은 미룬다 — 새로 그리면 아직 저장 안 한 것이 사라진다 (2026-08-24)
  const { lazy: lazyRefresh } = useLazyRefresh();
  const nameOf = (id) => items.find((i) => i.id === id)?.name || "숙제";
  const isChecked = (r) => !!r.checked_at || checkedLocal.has(r.id);

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
              <span className={`tag ${isChecked(r) ? "tag-muted" : "tag-amber"}`}>
                {r.kind === "audio" ? "녹음" : r.kind === "checklist" ? "체크" : "사진"}
              </span>
              <b style={{ fontSize: 14.5 }}>{nameOf(r.homework_item_id)}</b>
              <span className="hint" style={{ fontSize: 12.5 }}>
                {r.kind === "audio" && r.seconds ? `${r.seconds}초 · ` : ""}
                {new Date(r.created_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              <span className="spacer" />
              {/* 보관 기간(1개월)이 지나 파일은 지웠다 — 낸 기록은 남는다 */}
              {r.kind !== "checklist" && !r.path && (
                <span className="hint" style={{ fontSize: 12.5 }}>보관 기간 지남</span>
              )}
              {r.kind !== "checklist" && r.path && (
                <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => show(r)}>
                  {open[r.id] ? "닫기" : r.kind === "audio" ? "들어보기" : "보기"}
                </button>
              )}
              {!isChecked(r) && (
                <button
                  className="btn btn-sm"
                  disabled={pending}
                  onClick={() => {
                    // 누르는 순간 태그를 바꾼다 — 저장은 뒤에서
                    setCheckedLocal((prev) => new Set(prev).add(r.id));
                    startTransition(async () => {
                      const res = await markSubmissionChecked(r.id);
                      if (res?.error) {
                        setCheckedLocal((prev) => {
                          const n = new Set(prev); n.delete(r.id); return n;   // 실패 — 되돌린다
                        });
                        alert(res.error);
                        return;
                      }
                      lazyRefresh();
                    });
                  }}
                >
                  확인
                </button>
              )}
            </div>

            {r.kind === "checklist" && (
              <div className="stack" style={{ gap: 2 }}>
                {parseList(r.body).map((x, i) => (
                  <span key={i} className="hint" style={{ fontSize: 14 }}>
                    {/* 학생 3단계 그대로 — ○완료 △하는 중 ✕미이행 (2026-08-21) */}
                    <b style={{ color: x.state === "doing" ? "var(--amber)" : x.done ? "var(--mint)" : "var(--red)" }}>
                      {x.done ? "○" : x.state === "doing" ? "△" : "✕"}
                    </b>{" "}
                    {x.text}
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
